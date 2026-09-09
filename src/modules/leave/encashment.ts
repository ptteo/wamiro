import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";

import { db, first } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import type { AuthContext } from "@/lib/session";
import { notify } from "@/modules/notifications/service";
import { resolveApprovalActors } from "@/modules/approvals/delegation";
import {
  employees,
  leaveBalances,
  leaveEncashments,
  leaveTypes,
  users,
} from "@/db/schema";
import { can, widestScope } from "@/modules/iam/engine";

const YEAR = new Date().getFullYear();

/**
 * F3.4 — Leave encashment.
 * Mirrors the leave apply/approve workflow: an employee requests to cash out
 * unused paid leave; on approval the days are deducted from the balance and
 * the payout amount (days × rate) is recorded for the payroll phase (P4).
 */

export interface EncashInput {
  leaveTypeId: string;
  days: number;
  reason?: string;
}

export async function apply(ctx: AuthContext, input: EncashInput) {
  if (!can(ctx.access, "leave.apply")) throw ApiError.forbidden("Missing permission: leave.apply");
  const orgId = ctx.user.organizationId;

  if (!Number.isFinite(input.days) || input.days <= 0 || input.days > 365) {
    throw ApiError.badRequest("Encashment days must be between 0 and 365");
  }

  const [type] = await db
    .select({ id: leaveTypes.id, name: leaveTypes.name, encashmentCapDays: leaveTypes.encashmentCapDays })
    .from(leaveTypes)
    .where(and(eq(leaveTypes.id, input.leaveTypeId), eq(leaveTypes.organizationId, orgId)))
    .limit(1);
  if (!type) throw ApiError.notFound("Leave type not found");

  // Phase 8 — per-type yearly encashment cap (null = no type-level cap).
  if (type.encashmentCapDays !== null) {
    const used = await db
      .select({ total: sql<string | null>`coalesce(sum(${leaveEncashments.days}), 0)` })
      .from(leaveEncashments)
      .where(
        and(
          eq(leaveEncashments.organizationId, orgId),
          eq(leaveEncashments.employeeUserId, ctx.user.id),
          eq(leaveEncashments.leaveTypeId, input.leaveTypeId),
          sql`${leaveEncashments.status} IN ('pending', 'approved')`,
          gte(leaveEncashments.createdAt, new Date(Date.UTC(YEAR, 0, 1))),
        ),
      );
    const usedDays = Number(used[0]?.total ?? 0);
    const cap = Number(type.encashmentCapDays);
    if (usedDays + input.days > cap) {
      throw ApiError.badRequest(
        `Encashment cap for ${type.name} is ${cap} day(s)/year — ${usedDays} already committed`,
      );
    }
  }

  const [bal] = await db
    .select({
      entitledDays: leaveBalances.entitledDays,
      usedDays: leaveBalances.usedDays,
    })
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
    if (input.days > remaining) {
      throw ApiError.badRequest(`Only ${remaining} day(s) available to encash`);
    }
  }

  const row = first(
    await db
      .insert(leaveEncashments)
      .values({
        organizationId: orgId,
        employeeUserId: ctx.user.id,
        leaveTypeId: input.leaveTypeId,
        days: String(input.days),
        reason: input.reason?.trim() ?? null,
      })
      .returning(),
  );

  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: "ENCASHMENT_REQUESTED",
    entityType: "leave_encashment",
    entityId: row.id,
    newValue: input,
  });

  const [mgr] = await db
    .select({ managerUserId: employees.managerUserId })
    .from(employees)
    .where(and(eq(employees.userId, ctx.user.id), eq(employees.organizationId, orgId)))
    .limit(1);
  if (mgr?.managerUserId) {
    await notify({
      organizationId: orgId,
      userId: mgr.managerUserId,
      type: "leave.encashment",
      title: `${ctx.user.name} requested leave encashment`,
      body: `${input.days} day(s) of ${type.name}`,
      link: "/leave/encashment",
    });
  }
  return row;
}

export interface EncashmentRow {
  id: string;
  userName: string;
  leaveTypeName: string;
  days: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  rate: number | null;
  amount: number | null;
  decidedNote: string | null;
  createdAt: Date;
}

type RawRow = {
  id: string;
  userName: string;
  leaveTypeName: string;
  days: string;
  reason: string | null;
  status: EncashmentRow["status"];
  rate: string | null;
  amount: string | null;
  decidedNote: string | null;
  createdAt: Date;
};

function toRows(raw: RawRow[]): EncashmentRow[] {
  return raw.map((r) => ({
    id: r.id,
    userName: r.userName,
    leaveTypeName: r.leaveTypeName,
    days: Number(r.days),
    reason: r.reason,
    status: r.status,
    rate: r.rate !== null ? Number(r.rate) : null,
    amount: r.amount !== null ? Number(r.amount) : null,
    decidedNote: r.decidedNote,
    createdAt: r.createdAt,
  }));
}

function baseQuery() {
  return db
    .select({
      id: leaveEncashments.id,
      userName: users.name,
      leaveTypeName: leaveTypes.name,
      days: leaveEncashments.days,
      reason: leaveEncashments.reason,
      status: leaveEncashments.status,
      rate: leaveEncashments.rate,
      amount: leaveEncashments.amount,
      decidedNote: leaveEncashments.decidedNote,
      createdAt: leaveEncashments.createdAt,
    })
    .from(leaveEncashments)
    .innerJoin(users, eq(users.id, leaveEncashments.employeeUserId))
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveEncashments.leaveTypeId));
}

export async function mine(ctx: AuthContext): Promise<EncashmentRow[]> {
  const rows = await baseQuery()
    .where(
      and(
        eq(leaveEncashments.organizationId, ctx.user.organizationId),
        eq(leaveEncashments.employeeUserId, ctx.user.id),
      ),
    )
    .orderBy(desc(leaveEncashments.createdAt))
    .limit(50);
  return toRows(rows as unknown as RawRow[]);
}

/** Pending requests in the viewer's approval scope (same rules as leave). */
export async function pendingForApprover(ctx: AuthContext): Promise<EncashmentRow[]> {
  const orgId = ctx.user.organizationId;
  const companyWide =
    can(ctx.access, "leave.approve") &&
    (widestScope(ctx.access, "leave.approve") === "COMPANY" ||
      widestScope(ctx.access, "leave.approve") === "GLOBAL");
  if (!companyWide && !can(ctx.access, "leave.approve")) return [];

  if (companyWide) {
    const rows = await baseQuery()
      .where(
        and(
          eq(leaveEncashments.organizationId, orgId),
          eq(leaveEncashments.status, "pending"),
        ),
      )
      .orderBy(desc(leaveEncashments.createdAt))
      .limit(100);
    return toRows(rows as unknown as RawRow[]);
  }
  const actorIds = [ctx.user.id, ...(await resolveApprovalActors(ctx))];
  const filter =
    actorIds.length > 1
      ? or(inArray(employees.managerUserId, actorIds), eq(employees.managerUserId, ctx.user.id))
      : eq(employees.managerUserId, ctx.user.id);
  const reports = db
    .select({ userId: employees.userId })
    .from(employees)
    .where(filter);
  const rows = await baseQuery()
    .where(
      and(
        eq(leaveEncashments.organizationId, orgId),
        eq(leaveEncashments.status, "pending"),
        sql`${leaveEncashments.employeeUserId} IN (${reports})`,
      ),
    )
    .orderBy(desc(leaveEncashments.createdAt))
    .limit(100);
  return toRows(rows as unknown as RawRow[]);
}

/**
 * Decide an encashment. rate (per-day payout) is required for approval and
 * stored on the record; approved days are deducted from the leave balance so
 * the same days can't be spent twice.
 */
export async function decide(
  ctx: AuthContext,
  encashmentId: string,
  decision: "approved" | "rejected",
  opts: { rate?: number; note?: string },
) {
  if (!can(ctx.access, "leave.approve")) throw ApiError.forbidden("Missing permission: leave.approve");
  const orgId = ctx.user.organizationId;
  const scope = widestScope(ctx.access, "leave.approve");
  const companyWide = scope === "COMPANY" || scope === "GLOBAL";

  const [req] = await db
    .select({
      id: leaveEncashments.id,
      employeeUserId: leaveEncashments.employeeUserId,
      leaveTypeId: leaveEncashments.leaveTypeId,
      days: leaveEncashments.days,
      status: leaveEncashments.status,
    })
    .from(leaveEncashments)
    .where(and(eq(leaveEncashments.id, encashmentId), eq(leaveEncashments.organizationId, orgId)))
    .limit(1);
  if (!req) throw ApiError.notFound();
  if (req.status !== "pending") throw ApiError.conflict("Already decided");

  if (req.employeeUserId === ctx.user.id && !companyWide) {
    throw ApiError.forbidden("You cannot approve your own encashment");
  }
  if (!companyWide) {
    const actorIds = [ctx.user.id, ...(await resolveApprovalActors(ctx))];
    const filter =
      actorIds.length > 1
        ? or(inArray(employees.managerUserId, actorIds), eq(employees.managerUserId, ctx.user.id))
        : eq(employees.managerUserId, ctx.user.id);
    const [report] = await db
      .select({ userId: employees.userId })
      .from(employees)
      .where(and(eq(employees.userId, req.employeeUserId), filter))
      .limit(1);
    if (!report) throw ApiError.forbidden("Not your direct report");
  }

  const days = Number(req.days);
  let amount: number | null = null;
  if (decision === "approved") {
    if (opts.rate === undefined || !Number.isFinite(opts.rate) || opts.rate < 0) {
      throw ApiError.badRequest("A per-day rate is required to approve an encashment");
    }
    amount = Math.round(days * opts.rate * 100) / 100;
  }

  const updated = await db
    .update(leaveEncashments)
    .set({
      status: decision,
      decidedBy: ctx.user.id,
      decidedAt: new Date(),
      decidedNote: opts.note?.trim() ?? null,
      rate: decision === "approved" ? String(opts.rate) : null,
      amount: amount !== null ? String(amount) : null,
    })
    .where(and(eq(leaveEncashments.id, encashmentId), eq(leaveEncashments.status, "pending")))
    .returning({ id: leaveEncashments.id, employeeUserId: leaveEncashments.employeeUserId, leaveTypeId: leaveEncashments.leaveTypeId, days: leaveEncashments.days });

  if (updated[0] && decision === "approved") {
    await db
      .update(leaveBalances)
      .set({ usedDays: sql`${leaveBalances.usedDays} + ${days}::numeric` })
      .where(
        and(
          eq(leaveBalances.userId, updated[0].employeeUserId),
          eq(leaveBalances.leaveTypeId, updated[0].leaveTypeId),
          eq(leaveBalances.year, YEAR),
        ),
      );
  }

  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: decision === "approved" ? "ENCASHMENT_APPROVED" : "ENCASHMENT_REJECTED",
    entityType: "leave_encashment",
    entityId: encashmentId,
    metadata: { rate: opts.rate, note: opts.note, amount },
  });

  if (updated[0]) {
    await notify({
      organizationId: orgId,
      userId: updated[0].employeeUserId,
      type: "leave.encashment",
      title:
        decision === "approved"
          ? `Your leave encashment was approved by ${ctx.user.name}`
          : `Your leave encashment was rejected by ${ctx.user.name}`,
      body:
        decision === "approved"
          ? `${days} day(s) at ${opts.rate} → payout ${amount} queued`
          : opts.note ?? undefined,
      link: "/leave/encashment",
    });
  }
  return updated[0];
}
