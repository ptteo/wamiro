/**
 * Salary advances (Phase 7, Frappe parity).
 *
 * Employees request an advance on their salary; HR/Finance (payroll.manage)
 * approves or rejects. An approved advance whose decision falls inside a
 * payroll period is auto-deducted from that period's run by the payroll
 * computation (`advancesInPeriod`, consumed in `computePayslipFor`) — the
 * same deterministic, recompute-safe pattern as leave encashment.
 */
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { notify } from "@/modules/notifications/service";
import { salaryAdvances, users } from "@/db/schema";

export interface AdvanceRow {
  id: string;
  employeeUserId: string;
  employeeName: string;
  amount: number;
  reason: string | null;
  status: string;
  decidedBy: string | null;
  decidedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
}

/** My own advance requests. */
export async function myAdvances(ctx: AuthContext): Promise<AdvanceRow[]> {
  const rows = await db
    .select({
      id: salaryAdvances.id,
      employeeUserId: salaryAdvances.employeeUserId,
      employeeName: users.name,
      amount: salaryAdvances.amount,
      reason: salaryAdvances.reason,
      status: salaryAdvances.status,
      decidedBy: salaryAdvances.decidedBy,
      decidedAt: salaryAdvances.decidedAt,
      reviewNote: salaryAdvances.reviewNote,
      createdAt: salaryAdvances.createdAt,
    })
    .from(salaryAdvances)
    .innerJoin(users, eq(users.id, salaryAdvances.employeeUserId))
    .where(
      and(
        eq(salaryAdvances.organizationId, ctx.user.organizationId),
        eq(salaryAdvances.employeeUserId, ctx.user.id),
      ),
    )
    .orderBy(desc(salaryAdvances.createdAt));
  return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
}

/** All advances (approval queue + history) — payroll.manage. */
export async function listAdvances(ctx: AuthContext): Promise<AdvanceRow[]> {
  const rows = await db
    .select({
      id: salaryAdvances.id,
      employeeUserId: salaryAdvances.employeeUserId,
      employeeName: users.name,
      amount: salaryAdvances.amount,
      reason: salaryAdvances.reason,
      status: salaryAdvances.status,
      decidedBy: salaryAdvances.decidedBy,
      decidedAt: salaryAdvances.decidedAt,
      reviewNote: salaryAdvances.reviewNote,
      createdAt: salaryAdvances.createdAt,
    })
    .from(salaryAdvances)
    .innerJoin(users, eq(users.id, salaryAdvances.employeeUserId))
    .where(eq(salaryAdvances.organizationId, ctx.user.organizationId))
    .orderBy(desc(salaryAdvances.createdAt));
  return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
}

export async function applyAdvance(
  ctx: AuthContext,
  input: { amount: number; reason?: string | null },
) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    throw ApiError.badRequest("Advance amount must be between 0 and 1,000,000");
  }
  const [row] = await db
    .insert(salaryAdvances)
    .values({
      organizationId: ctx.user.organizationId,
      employeeUserId: ctx.user.id,
      amount: String(amount),
      reason: (input.reason ?? "").trim().slice(0, 500) || null,
    })
    .returning();
  if (!row) throw ApiError.notFound();
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "ADVANCE_REQUESTED",
    entityType: "salary_advance",
    entityId: row.id,
    newValue: { amount, reason: row.reason },
  });
  return { id: row.id };
}

export async function reviewAdvance(
  ctx: AuthContext,
  id: string,
  input: { approve: boolean; note?: string | null },
) {
  const [row] = await db
    .select()
    .from(salaryAdvances)
    .where(and(eq(salaryAdvances.id, id), eq(salaryAdvances.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!row) throw ApiError.notFound();
  if (row.status !== "pending") throw ApiError.conflict("Advance already decided");

  const status = input.approve ? "approved" : "rejected";
  const [updated] = await db
    .update(salaryAdvances)
    .set({
      status,
      decidedBy: ctx.user.id,
      decidedAt: new Date(),
      reviewNote: (input.note ?? "").trim().slice(0, 500) || null,
    })
    .where(and(eq(salaryAdvances.id, id), eq(salaryAdvances.organizationId, ctx.user.organizationId)))
    .returning();
  if (!updated) throw ApiError.notFound();

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: input.approve ? "ADVANCE_APPROVED" : "ADVANCE_REJECTED",
    entityType: "salary_advance",
    entityId: id,
    newValue: { amount: Number(row.amount), status },
  });
  if (row.employeeUserId !== ctx.user.id) {
    await notify({
      organizationId: ctx.user.organizationId,
      userId: row.employeeUserId,
      type: "payroll",
      title: input.approve ? "Salary advance approved" : "Salary advance rejected",
      body: input.approve
        ? `Your advance of ${Number(row.amount).toFixed(2)} was approved and will be recovered from an upcoming payroll run.`
        : `Your salary advance request of ${Number(row.amount).toFixed(2)} was rejected.`,
      link: "/payroll/advances",
    });
  }
  return { ok: true, status };
}

/**
 * Approved advances decided inside [startIso, endIso] — deducted by the run
 * computation. Recomputation-safe: derived purely from decided_at, no state.
 */
export async function advancesInPeriod(
  orgId: string,
  employeeUserId: string,
  startIso: string,
  endIso: string,
): Promise<number> {
  const rows = await db
    .select({ amount: salaryAdvances.amount })
    .from(salaryAdvances)
    .where(
      and(
        eq(salaryAdvances.organizationId, orgId),
        eq(salaryAdvances.employeeUserId, employeeUserId),
        eq(salaryAdvances.status, "approved"),
        isNotNull(salaryAdvances.decidedAt),
        // decided_at within the period
        sql`${salaryAdvances.decidedAt} >= ${new Date(`${startIso}T00:00:00.000Z`)}`,
        sql`${salaryAdvances.decidedAt} <= ${new Date(`${endIso}T23:59:59.999Z`)}`,
      ),
    );
  return rows.reduce((s, r) => s + Number(r.amount), 0);
}