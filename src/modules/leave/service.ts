import { and, desc, eq, inArray, or, sql } from "drizzle-orm";

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
  leaveBalances,
  leaveRequests,
  leaveTypes,
  users,
} from "@/db/schema";
import { can, widestScope } from "@/modules/iam/engine";

const YEAR = new Date().getFullYear();

// ---------- balances ----------

export async function myBalances(ctx: AuthContext) {
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
}

function businessDays(startStr: string, endStr: string): number {
  const start = new Date(`${startStr}T00:00:00Z`);
  const end = new Date(`${endStr}T00:00:00Z`);
  if (Number.isNaN(+start) || Number.isNaN(+end)) throw ApiError.badRequest("Invalid dates");
  if (end < start) throw ApiError.badRequest("End date must be on or after start date");
  // ponytail: calendar-day count incl. weekends; switch to working days when HR policy module lands
  const days = Math.round((+end - +start) / 86_400_000) + 1;
  if (days > 365) throw ApiError.badRequest("Leave cannot exceed one year");
  return days;
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

  const days = businessDays(input.startDate, input.endDate);

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
      createdAt: leaveRequests.createdAt,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(users.id, leaveRequests.userId))
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
    .leftJoin(employees, eq(employees.userId, leaveRequests.userId))
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .where(
      companyWide
        ? and(eq(leaveRequests.organizationId, orgId), eq(leaveRequests.status, "pending"))
        : and(
            eq(leaveRequests.organizationId, orgId),
            eq(leaveRequests.status, "pending"),
            sql`${leaveRequests.userId} IN (SELECT user_id FROM employees WHERE manager_user_id = ANY(${`{${actorIds.join(",")}}`}::uuid[]))`,
          ),
    )
    .orderBy(leaveRequests.startDate);
  return rows;
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
  if (req.status !== "pending") throw ApiError.conflict("Already reviewed");

  const companyWide = scope === "COMPANY" || scope === "GLOBAL";

  // Self-approval only for company-level approvers (HR/CEO), never managers on their own requests.
  if (req.userId === ctx.user.id && !companyWide) {
    throw ApiError.forbidden("You cannot approve your own request");
  }

  // TEAM/DEPARTMENT-scope approvers may act only on direct reports —
  // or on reports of anyone who delegated their approval authority to us (§27).
  if (!companyWide) {
    const actorIds = [ctx.user.id, ...(await resolveApprovalActors(ctx))];
    const managerFilter = actorIds.length > 1
      ? or(eq(employees.managerUserId, ctx.user.id), inArray(employees.managerUserId, actorIds))
      : eq(employees.managerUserId, ctx.user.id);
    const [report] = await db
      .select({ userId: employees.userId })
      .from(employees)
      .where(and(eq(employees.userId, req.userId), managerFilter))
      .limit(1);
    if (!report) throw ApiError.forbidden("Not your direct report");
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
