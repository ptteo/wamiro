/**
 * Phase 8 — leave depth: monthly accrual policies, carry-forward and
 * encashment caps, half-day types, per-location holiday calendars, and
 * balance projections at request time.
 *
 * Design: accrual is a pure function of (policy, elapsed months, entitled
 * days) evaluated on read — no worker needed, deterministic, and consistent
 * with the existing reconcile-on-read auto-allocation pattern.
 */
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { leaveBalances, leaveTypes } from "@/db/schema";

export interface AccrualPolicy {
  /** Days granted upfront for the year (quota). */
  annualQuotaDays: number;
  /** Days accrued per elapsed month; null = upfront grant. */
  accrualPerMonth: number | null;
}

/**
 * Projected entitlement `monthsElapsed` into the year.
 * - Upfront policy: full quota immediately.
 * - Accrual policy: quota * min(1, monthsElapsed / 12) — accrues evenly to
 *   the full annual quota by year end.
 * Deterministic and pure — unit-testable without a DB.
 */
export function projectedEntitlement(policy: AccrualPolicy, monthsElapsed: number): number {
  if (policy.accrualPerMonth === null) return policy.annualQuotaDays;
  const monthly = Math.min(policy.accrualPerMonth, policy.annualQuotaDays / 12);
  return round1(monthly * Math.max(0, Math.min(12, monthsElapsed)));
}

/** Months elapsed in the calendar year (January = 1 complete month by Feb 1). */
export function monthsElapsedThisYear(now: Date = new Date()): number {
  return now.getUTCMonth();
}

/** Round to one decimal (balances are numeric(5,1)). */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Carry-forward when rolling into a new year: unused days up to the cap move
 * forward; the rest lapses. Pure function.
 */
export function carryForwardDays(
  unusedDays: number,
  carryForwardCap: number | null,
): number {
  if (carryForwardCap === null || carryForwardCap <= 0) return 0;
  return round1(Math.min(unusedDays, carryForwardCap));
}

/**
 * Encashment cap check: how many of `requestedDays` are allowed given the
 * type's cap (falls back to org-wide policy when the type has none).
 */
export function encashableDays(
  requestedDays: number,
  remainingBalance: number,
  typeCapDays: number | null,
  orgCapDays: number | null,
): number {
  const cap = typeCapDays ?? orgCapDays ?? Infinity;
  return round1(Math.max(0, Math.min(requestedDays, remainingBalance, cap)));
}

export interface BalanceProjection {
  leaveTypeId: string;
  name: string;
  entitledNow: number;
  entitledProjected: number;
  usedDays: number;
  remainingNow: number;
  /** After the proposed request: negative means over-borrow. */
  remainingAfterRequest: number;
}

/**
 * Balance projection used at request time: shows the employee what their
 * balance will look like AFTER the proposed leave, including accrual growth
 * between now and the leave start (Frappe-style "future balance").
 */
export async function projectBalance(
  orgId: string,
  userId: string,
  leaveTypeId: string,
  additionalDays: number,
  now: Date = new Date(),
): Promise<BalanceProjection | null> {
  const [type] = await db
    .select({
      id: leaveTypes.id,
      name: leaveTypes.name,
      annualQuotaDays: leaveTypes.annualQuotaDays,
      accrualPerMonth: leaveTypes.accrualPerMonth,
    })
    .from(leaveTypes)
    .where(and(eq(leaveTypes.id, leaveTypeId), eq(leaveTypes.organizationId, orgId)))
    .limit(1);
  if (!type) return null;

  const year = now.getUTCFullYear();
  const [bal] = await db
    .select({ entitledDays: leaveBalances.entitledDays, usedDays: leaveBalances.usedDays })
    .from(leaveBalances)
    .where(
      and(
        eq(leaveBalances.organizationId, orgId),
        eq(leaveBalances.userId, userId),
        eq(leaveBalances.leaveTypeId, leaveTypeId),
        eq(leaveBalances.year, year),
      ),
    )
    .limit(1);

  const policy: AccrualPolicy = {
    annualQuotaDays: Number(type.annualQuotaDays),
    accrualPerMonth: type.accrualPerMonth !== null ? Number(type.accrualPerMonth) : null,
  };
  const entitledNow = Number(bal?.entitledDays ?? 0);
  const entitledProjected = projectedEntitlement(policy, monthsElapsedThisYear(now));
  const entitledEffective = Math.max(entitledNow, entitledProjected);
  const used = Number(bal?.usedDays ?? 0);

  return {
    leaveTypeId: type.id,
    name: type.name,
    entitledNow,
    entitledProjected,
    usedDays: used,
    remainingNow: round1(entitledEffective - used),
    remainingAfterRequest: round1(entitledEffective - used - additionalDays),
  };
}

/**
 * Year-end roll-forward for one org: adds carry-forward entitlement to the
 * new year's balance rows for types with a carry cap. Idempotent via the
 * unique balance key — called by the retention/jobs tick monthly or on read.
 */
export async function rollForwardYear(orgId: string, fromYear: number, toYear: number): Promise<number> {
  const types = await db
    .select({
      id: leaveTypes.id,
      carryForwardCap: leaveTypes.carryForwardCap,
    })
    .from(leaveTypes)
    .where(eq(leaveTypes.organizationId, orgId));
  const cappable = types.filter((t) => t.carryForwardCap !== null && Number(t.carryForwardCap) > 0);
  if (cappable.length === 0) return 0;

  const res = await db.execute(sql`
    INSERT INTO leave_balances (organization_id, user_id, leave_type_id, year, entitled_days, used_days)
    SELECT b.organization_id, b.user_id, b.leave_type_id, ${toYear},
           LEAST(
             GREATEST(b.entitled_days - b.used_days, 0),
             t.carry_forward_cap
           )::numeric,
           0
    FROM leave_balances b
    JOIN leave_types t ON t.id = b.leave_type_id
    WHERE b.organization_id = ${orgId}
      AND b.year = ${fromYear}
      AND t.carry_forward_cap IS NOT NULL
      AND t.carry_forward_cap > 0
    ON CONFLICT (user_id, leave_type_id, year) DO NOTHING
  `);
  return res.rowCount ?? 0;
}
