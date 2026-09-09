import { and, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";

import { db, first } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/events";
import type { AuthContext } from "@/lib/session";
import { notify } from "@/modules/notifications/service";
import { resolveApprovalActors } from "@/modules/approvals/delegation";
import {
  departments,
  employees,
  holidays,
  leaveBalances,
  leaveRequests,
  leaveTypes,
  users,
} from "@/db/schema";
import { can, widestScope } from "@/modules/iam/engine";
import {
  LEAVE_QUEUE_STATUSES,
  approverMayForceCancel,
  employeeMayRequestCancel,
  employeeMayWithdraw,
} from "@/modules/leave/cancel";
import { projectBalance } from "@/modules/leave/accrual";

const YEAR = new Date().getFullYear();

// ---------- balances ----------

/**
 * Frappe parity: auto-allocation. Leave types flagged `auto_allocate` grant
 * their annual quota to every employee on hire and at each new year. Running
 * this reconciles the year's balance rows (idempotent via the unique
 * user+type+year key) — called on every balance read so fresh hires and new
 * years self-heal without a worker.
 */
export async function reconcileAnnualAllocations(ctx: AuthContext, year = YEAR) {
  const orgId = ctx.user.organizationId;
  const [autoTypes, members] = await Promise.all([
    db
      .select({ id: leaveTypes.id, annualQuotaDays: leaveTypes.annualQuotaDays })
      .from(leaveTypes)
      .where(and(eq(leaveTypes.organizationId, orgId), eq(leaveTypes.autoAllocate, true))),
    db.select({ id: users.id }).from(users).where(eq(users.organizationId, orgId)),
  ]);
  if (autoTypes.length === 0 || members.length === 0) return;
  await db
    .insert(leaveBalances)
    .values(
      autoTypes.flatMap((t) =>
        members.map((m) => ({
          organizationId: orgId,
          userId: m.id,
          leaveTypeId: t.id,
          year,
          entitledDays: t.annualQuotaDays,
          usedDays: "0",
        })),
      ),
    )
    .onConflictDoNothing();
}

export async function myBalances(ctx: AuthContext) {
  await reconcileAnnualAllocations(ctx);
  return db
    .select({
      leaveTypeId: leaveBalances.leaveTypeId,
      name: leaveTypes.name,
      annualQuotaDays: leaveTypes.annualQuotaDays,
      paid: leaveTypes.paid,
      entitledDays: leaveBalances.entitledDays,
      usedDays: leaveBalances.usedDays,
    })
    .from(leaveBalances)
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveBalances.leaveTypeId))
    .where(
      and(
        eq(leaveBalances.userId, ctx.user.id),
        eq(leaveBalances.year, YEAR),
        eq(leaveBalances.organizationId, ctx.user.organizationId),
      ),
    );
}

/**
 * Team who's-out calendar: 8 weeks of approved leave, grouped by week.
 * Returns a flat list of approved requests sorted by start date. The
 * client buckets them by week for display.
 */
export async function teamOutNextWeeks(ctx: AuthContext, weeks = 8) {
  const orgId = ctx.user.organizationId;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setUTCDate(today.getUTCDate() + weeks * 7);

  return db
    .select({
      id: leaveRequests.id,
      userId: leaveRequests.userId,
      userName: users.name,
      typeName: leaveTypes.name,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      days: leaveRequests.days,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(users.id, leaveRequests.userId))
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
    .where(
      and(
        eq(leaveRequests.organizationId, orgId),
        eq(leaveRequests.status, "approved"),
        sql`${leaveRequests.startDate} <= ${horizon.toISOString().slice(0, 10)}::date`,
        sql`${leaveRequests.endDate} >= ${today.toISOString().slice(0, 10)}::date`,
      ),
    )
    .orderBy(leaveRequests.startDate);
}

export async function listLeaveTypes(ctx: AuthContext) {
  return db
    .select({ id: leaveTypes.id, name: leaveTypes.name })
    .from(leaveTypes)
    .where(eq(leaveTypes.organizationId, ctx.user.organizationId));
}

// ---------- requests ----------

export interface ApplyInput {
  leaveTypeId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  reason?: string;
  /** Phase 8 — half-day leave: 'first_half' | 'second_half'. */
  halfDay?: "first_half" | "second_half";
}

function businessDays(startStr: string, endStr: string): number {
  const start = new Date(`${startStr}T00:00:00Z`);
  const end = new Date(`${endStr}T00:00:00Z`);
  if (Number.isNaN(+start) || Number.isNaN(+end)) throw ApiError.badRequest("Invalid dates");
  if (end < start) throw ApiError.badRequest("End date must be on or after start date");
  // calendar-day count incl. weekends; company holidays are subtracted below
  const days = Math.round((+end - +start) / 86_400_000) + 1;
  if (days > 365) throw ApiError.badRequest("Leave cannot exceed one year");
  return days;
}

const HALF_DAYS = new Set(["first_half", "second_half"]);

/** Company holidays falling inside an inclusive date range (F3.4: not counted as leave days). */
async function holidaysInRange(orgId: string, startStr: string, endStr: string): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(holidays)
    .where(
      and(
        eq(holidays.organizationId, orgId),
        gte(holidays.date, startStr),
        lte(holidays.date, endStr),
      ),
    );
  return row?.c ?? 0;
}

export async function apply(ctx: AuthContext, input: ApplyInput) {
  if (!can(ctx.access, "leave.apply")) throw ApiError.forbidden("Missing permission: leave.apply");

  const [type] = await db
    .select({ id: leaveTypes.id })
    .from(leaveTypes)
    .where(
      and(
        eq(leaveTypes.id, input.leaveTypeId),
        eq(leaveTypes.organizationId, ctx.user.organizationId),
      ),
    )
    .limit(1);
  if (!type) throw ApiError.notFound("Leave type not found");

  let days = businessDays(input.startDate, input.endDate);
  // company holidays inside the range are not charged leave days
  days -= await holidaysInRange(ctx.user.organizationId, input.startDate, input.endDate);
  // Phase 8 — half-day: only valid on a single-day request; costs 0.5 days.
  const halfDay = input.halfDay && HALF_DAYS.has(input.halfDay) ? input.halfDay : null;
  if (halfDay) {
    if (input.startDate !== input.endDate) {
      throw ApiError.badRequest("Half-day leave must be a single date");
    }
    days = 0.5;
  }
  if (days <= 0) throw ApiError.badRequest("That period contains only company holidays");

  // balance check (only when a balance row exists)
  const [bal] = await db
    .select({ entitledDays: leaveBalances.entitledDays, usedDays: leaveBalances.usedDays })
    .from(leaveBalances)
    .where(
      and(
        eq(leaveBalances.userId, ctx.user.id),
        eq(leaveBalances.leaveTypeId, input.leaveTypeId),
        eq(leaveBalances.year, YEAR),
      ),
    )
    .limit(1);
  if (bal) {
    const remaining = Number(bal.entitledDays) - Number(bal.usedDays);
    if (days > remaining) {
      throw ApiError.badRequest(`Insufficient balance: ${remaining} day(s) remaining`);
    }
  }

  const req = await db
    .insert(leaveRequests)
    .values({
      organizationId: ctx.user.organizationId,
      userId: ctx.user.id,
      leaveTypeId: input.leaveTypeId,
      startDate: input.startDate,
      endDate: input.endDate,
      days: String(days),
      halfDay,
      halfDayDate: halfDay ? input.startDate : null,
      reason: input.reason ?? null,
    })
    .returning()
    .then(first);

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "LEAVE_REQUESTED",
    entityType: "leave_request",
    entityId: req.id,
    newValue: { ...input, days },
  });
  await emit(ctx.user.organizationId, "leave.requested", "leave_request", req.id, ctx.user.id, { days });

  // notify the requester's direct manager (if any)
  const [mgr] = await db
    .select({ managerUserId: employees.managerUserId })
    .from(employees)
    .where(and(eq(employees.userId, ctx.user.id), eq(employees.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (mgr?.managerUserId) {
    await notify({
      organizationId: ctx.user.organizationId,
      userId: mgr.managerUserId,
      type: "leave.requested",
      title: `${ctx.user.name} requested leave`,
      body: `${days} day(s), ${input.startDate} → ${input.endDate}`,
      link: "/leave",
    });
  }
  return req;
}

/**
 * Requests the viewer can act on:
 *  - leave.approve @ TEAM → direct reports' pending
 *  - leave.approve @ COMPANY (or leave.manage) → all org pending
 */
export async function pendingForApprover(ctx: AuthContext) {
  const orgId = ctx.user.organizationId;
  const companyWide =
    can(ctx.access, "leave.approve") &&
    (widestScope(ctx.access, "leave.approve") === "COMPANY" ||
      widestScope(ctx.access, "leave.approve") === "GLOBAL");

  if (!companyWide && !can(ctx.access, "leave.approve")) return [];

  // §27 delegation: the queue includes requests of anyone who delegated to me.
  // The delegate never exceeds their own scope — TEAM viewers still only see
  // their own reports' items plus delegators' reports; COMPANY sees all anyway.
  const actorIds = [ctx.user.id, ...(await resolveApprovalActors(ctx))];

  const rows = await db
    .select({
      id: leaveRequests.id,
      userName: users.name,
      userAvatar: users.avatarUrl,
      userId: leaveRequests.userId,
      jobTitle: employees.jobTitle,
      departmentName: departments.name,
      typeName: leaveTypes.name,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      days: leaveRequests.days,
      reason: leaveRequests.reason,
      status: leaveRequests.status,
      createdAt: leaveRequests.createdAt,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(users.id, leaveRequests.userId))
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
    .leftJoin(employees, eq(employees.userId, leaveRequests.userId))
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .where(
      companyWide
        ? and(eq(leaveRequests.organizationId, orgId), inArray(leaveRequests.status, [...LEAVE_QUEUE_STATUSES]))
        : and(
            eq(leaveRequests.organizationId, orgId),
            inArray(leaveRequests.status, [...LEAVE_QUEUE_STATUSES]),
            sql`${leaveRequests.userId} IN (SELECT user_id FROM employees WHERE manager_user_id = ANY(${`{${actorIds.join(",")}}`}::uuid[]))`,
          ),
    )
    .orderBy(leaveRequests.startDate);
  return rows.map((r) => ({
    ...r,
    kind: r.status === "cancel_requested" ? ("cancel" as const) : ("apply" as const),
  }));
}

/** Decisions already made by this reviewer, newest first. */
export async function listReviewedByMe(ctx: AuthContext) {
  return db
    .select({
      id: leaveRequests.id,
      userName: users.name,
      userAvatar: users.avatarUrl,
      typeName: leaveTypes.name,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      days: leaveRequests.days,
      status: leaveRequests.status,
      reviewNote: leaveRequests.reviewNote,
      reviewedAt: leaveRequests.reviewedAt,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(users.id, leaveRequests.userId))
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
    .where(
      and(
        eq(leaveRequests.organizationId, ctx.user.organizationId),
        eq(leaveRequests.reviewedBy, ctx.user.id),
      ),
    )
    .orderBy(desc(leaveRequests.reviewedAt))
    .limit(50);
}

/** My own requests, newest first. */
export async function myRequests(ctx: AuthContext) {
  return db
    .select({
      id: leaveRequests.id,
      typeName: leaveTypes.name,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      days: leaveRequests.days,
      status: leaveRequests.status,
      reason: leaveRequests.reason,
      reviewNote: leaveRequests.reviewNote,
      createdAt: leaveRequests.createdAt,
    })
    .from(leaveRequests)
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
    .where(
      and(
        eq(leaveRequests.organizationId, ctx.user.organizationId),
        eq(leaveRequests.userId, ctx.user.id),
      ),
    )
    .orderBy(desc(leaveRequests.createdAt))
    .limit(50);
}

export async function review(
  ctx: AuthContext,
  requestId: string,
  decision: "approved" | "rejected",
  note?: string,
) {
  if (!can(ctx.access, "leave.approve")) throw ApiError.forbidden("Missing permission: leave.approve");
  const orgId = ctx.user.organizationId;
  const scope = widestScope(ctx.access, "leave.approve");

  const [req] = await db
    .select({ id: leaveRequests.id, userId: leaveRequests.userId, status: leaveRequests.status })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.id, requestId), eq(leaveRequests.organizationId, orgId)))
    .limit(1);
  if (!req) throw ApiError.notFound();
  if (req.status !== "pending" && req.status !== "cancel_requested") {
    throw ApiError.conflict("Already reviewed");
  }

  const companyWide = scope === "COMPANY" || scope === "GLOBAL";
  await assertCanActOnLeave(ctx, req.userId, companyWide);

  if (req.status === "cancel_requested") {
    return decideCancelRequest(ctx, orgId, requestId, req.userId, decision, note);
  }

  const [updated] = await db
    .update(leaveRequests)
    .set({
      status: decision,
      reviewedBy: ctx.user.id,
      reviewedAt: new Date(),
      reviewNote: note ?? null,
    })
    .where(and(eq(leaveRequests.id, requestId), eq(leaveRequests.status, "pending")))
    .returning({ id: leaveRequests.id, userId: leaveRequests.userId, days: leaveRequests.days, leaveTypeId: leaveRequests.leaveTypeId });

  if (updated && decision === "approved") {
    // Track usage against the quota row when one exists; tenants without a
    // seeded balance for this type still get usage recorded (entitled 0).
    const deducted = await db
      .update(leaveBalances)
      .set({ usedDays: sql`${leaveBalances.usedDays} + ${Number(updated.days)}::numeric` })
      .where(
        and(
          eq(leaveBalances.userId, updated.userId),
          eq(leaveBalances.leaveTypeId, updated.leaveTypeId),
          eq(leaveBalances.year, YEAR),
        ),
      )
      .returning({ id: leaveBalances.id });
    if (!deducted[0]) {
      await db
        .insert(leaveBalances)
        .values({
          organizationId: orgId,
          userId: updated.userId,
          leaveTypeId: updated.leaveTypeId,
          year: YEAR,
          entitledDays: "0",
          usedDays: String(Number(updated.days)),
        })
        .onConflictDoNothing();
    }
  }

  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: decision === "approved" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
    entityType: "leave_request",
    entityId: requestId,
    metadata: { note },
  });
  await emit(orgId, decision === "approved" ? "leave.approved" : "leave.rejected", "leave_request", requestId, ctx.user.id);

  if (updated) {
    await notify({
      organizationId: orgId,
      userId: updated.userId,
      type: `leave.${decision}`,
      title:
        decision === "approved"
          ? `Your leave was approved by ${ctx.user.name}`
          : `Your leave was rejected by ${ctx.user.name}`,
      body: note ?? null,
      link: "/leave",
    });
  }
  return updated;
}

async function assertCanActOnLeave(ctx: AuthContext, targetUserId: string, companyWide: boolean) {
  if (targetUserId === ctx.user.id && !companyWide) {
    throw ApiError.forbidden("You cannot approve your own request");
  }
  if (companyWide) return;
  const actorIds = [ctx.user.id, ...(await resolveApprovalActors(ctx))];
  const managerFilter =
    actorIds.length > 1
      ? or(eq(employees.managerUserId, ctx.user.id), inArray(employees.managerUserId, actorIds))
      : eq(employees.managerUserId, ctx.user.id);
  const [report] = await db
    .select({ userId: employees.userId })
    .from(employees)
    .where(and(eq(employees.userId, targetUserId), managerFilter))
    .limit(1);
  if (!report) throw ApiError.forbidden("Not your direct report");
}

async function restoreUsedDays(orgId: string, userId: string, leaveTypeId: string, days: string | number) {
  await db
    .update(leaveBalances)
    .set({ usedDays: sql`GREATEST(0, ${leaveBalances.usedDays} - ${Number(days)}::numeric)` })
    .where(
      and(
        eq(leaveBalances.organizationId, orgId),
        eq(leaveBalances.userId, userId),
        eq(leaveBalances.leaveTypeId, leaveTypeId),
        eq(leaveBalances.year, YEAR),
      ),
    );
}

async function markCancelled(
  orgId: string,
  requestId: string,
  actorId: string,
  fromStatus: "pending" | "approved" | "cancel_requested",
  note: string | null,
) {
  const [updated] = await db
    .update(leaveRequests)
    .set({
      status: "cancelled",
      reviewedBy: actorId,
      reviewedAt: new Date(),
      reviewNote: note,
    })
    .where(and(eq(leaveRequests.id, requestId), eq(leaveRequests.status, fromStatus)))
    .returning({
      id: leaveRequests.id,
      userId: leaveRequests.userId,
      days: leaveRequests.days,
      leaveTypeId: leaveRequests.leaveTypeId,
    });
  return updated ?? null;
}

async function decideCancelRequest(
  ctx: AuthContext,
  orgId: string,
  requestId: string,
  userId: string,
  decision: "approved" | "rejected",
  note?: string,
) {
  if (decision === "rejected") {
    const [kept] = await db
      .update(leaveRequests)
      .set({
        status: "approved",
        reviewedBy: ctx.user.id,
        reviewedAt: new Date(),
        reviewNote: note ?? null,
      })
      .where(and(eq(leaveRequests.id, requestId), eq(leaveRequests.status, "cancel_requested")))
      .returning({ id: leaveRequests.id, userId: leaveRequests.userId });
    await audit({
      organizationId: orgId,
      actorUserId: ctx.user.id,
      action: "LEAVE_CANCEL_REJECTED",
      entityType: "leave_request",
      entityId: requestId,
      metadata: { note },
    });
    if (kept) {
      await notify({
        organizationId: orgId,
        userId: kept.userId,
        type: "leave.rejected",
        title: `${ctx.user.name} kept your approved leave`,
        body: note ?? "Your cancellation request was declined.",
        link: "/leave",
      });
    }
    return kept;
  }

  const updated = await markCancelled(orgId, requestId, ctx.user.id, "cancel_requested", note ?? null);
  if (updated) await restoreUsedDays(orgId, updated.userId, updated.leaveTypeId, updated.days);
  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: "LEAVE_CANCEL_APPROVED",
    entityType: "leave_request",
    entityId: requestId,
    metadata: { note },
  });
  await emit(orgId, "leave.cancelled", "leave_request", requestId, ctx.user.id);
  if (updated) {
    await notify({
      organizationId: orgId,
      userId: updated.userId,
      type: "leave.approved",
      title: `${ctx.user.name} cancelled your leave`,
      body: note ?? "Your cancellation was approved. Those days are back in your balance.",
      link: "/leave",
    });
  }
  return updated;
}

export async function cancelLeave(
  ctx: AuthContext,
  requestId: string,
  opts: { note?: string; force?: boolean } = {},
) {
  const orgId = ctx.user.organizationId;
  const [req] = await db
    .select({
      id: leaveRequests.id,
      userId: leaveRequests.userId,
      status: leaveRequests.status,
      endDate: leaveRequests.endDate,
      days: leaveRequests.days,
      leaveTypeId: leaveRequests.leaveTypeId,
    })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.id, requestId), eq(leaveRequests.organizationId, orgId)))
    .limit(1);
  if (!req) throw ApiError.notFound();

  if (opts.force) {
    if (!can(ctx.access, "leave.approve")) throw ApiError.forbidden("Missing permission: leave.approve");
    const note = opts.note?.trim() ?? "";
    if (note.length < 2) throw ApiError.badRequest("A note is required to cancel someone else's leave");
    if (!approverMayForceCancel(req.status)) {
      throw ApiError.conflict("Only approved leave can be cancelled by an approver");
    }
    const scope = widestScope(ctx.access, "leave.approve");
    const companyWide = scope === "COMPANY" || scope === "GLOBAL";
    await assertCanActOnLeave(ctx, req.userId, companyWide);
    const from = req.status === "cancel_requested" ? "cancel_requested" : "approved";
    const updated = await markCancelled(orgId, requestId, ctx.user.id, from, note);
    if (updated) await restoreUsedDays(orgId, updated.userId, updated.leaveTypeId, updated.days);
    await audit({
      organizationId: orgId,
      actorUserId: ctx.user.id,
      action: "LEAVE_FORCE_CANCELLED",
      entityType: "leave_request",
      entityId: requestId,
      metadata: { note },
    });
    await emit(orgId, "leave.cancelled", "leave_request", requestId, ctx.user.id);
    if (updated && updated.userId !== ctx.user.id) {
      await notify({
        organizationId: orgId,
        userId: updated.userId,
        type: "leave.rejected",
        title: `${ctx.user.name} cancelled your leave`,
        body: note,
        link: "/leave",
      });
    }
    return updated;
  }

  if (req.userId !== ctx.user.id) throw ApiError.forbidden("You can only cancel your own leave");
  if (!can(ctx.access, "leave.apply")) throw ApiError.forbidden("Missing permission: leave.apply");

  if (employeeMayWithdraw(req.status)) {
    const updated = await markCancelled(orgId, requestId, ctx.user.id, "pending", opts.note ?? null);
    await audit({
      organizationId: orgId,
      actorUserId: ctx.user.id,
      action: "LEAVE_WITHDRAWN",
      entityType: "leave_request",
      entityId: requestId,
    });
    await emit(orgId, "leave.cancelled", "leave_request", requestId, ctx.user.id);
    return updated;
  }

  if (!employeeMayRequestCancel(req.status, String(req.endDate))) {
    if (req.status === "approved") throw ApiError.conflict("This leave has already ended");
    throw ApiError.conflict("This leave cannot be cancelled");
  }

  const [updated] = await db
    .update(leaveRequests)
    .set({
      status: "cancel_requested",
      reviewNote: opts.note?.trim() || null,
    })
    .where(and(eq(leaveRequests.id, requestId), eq(leaveRequests.status, "approved")))
    .returning({ id: leaveRequests.id });
  if (!updated) throw ApiError.conflict("This leave cannot be cancelled");

  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: "LEAVE_CANCEL_REQUESTED",
    entityType: "leave_request",
    entityId: requestId,
    metadata: { note: opts.note },
  });
  await emit(orgId, "leave.cancel_requested", "leave_request", requestId, ctx.user.id);

  const [mgr] = await db
    .select({ managerUserId: employees.managerUserId })
    .from(employees)
    .where(and(eq(employees.userId, ctx.user.id), eq(employees.organizationId, orgId)))
    .limit(1);
  if (mgr?.managerUserId) {
    await notify({
      organizationId: orgId,
      userId: mgr.managerUserId,
      type: "leave.requested",
      title: `${ctx.user.name} asked to cancel leave`,
      body: opts.note?.trim() || "They no longer need the approved time off.",
      link: "/leave",
    });
  }
  return updated;
}
