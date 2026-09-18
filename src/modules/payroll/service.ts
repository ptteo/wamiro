import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db, first } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { notify } from "@/modules/notifications/service";
import type { AuthContext } from "@/lib/session";
import {
  employees,
  leaveEncashments,
  organizations,
  payslips,
  payrollArrears,
  payrollRuns,
  salaryComponents,
  salaryStructures,
  salaryStructureLines,
  users,
} from "@/db/schema";
import { can } from "@/modules/iam/engine";
import { advancesInPeriod } from "@/modules/payroll/advances";

/**
 * Phase 4 — payroll engine (native, Frappe-HR parity foundations).
 *
 * Salary components (library) → per-employee salary structures (versioned) →
 * monthly payroll runs whose payslips are computed from the active structure:
 *   net = base + earnings − deductions
 * Earnings/deductions come from structure lines (fixed amounts or % of base);
 * the base itself is always an earning. Worked days within the period pro-rate
 * every amount. No attendance *and* no leave on record → full month (tenants
 * that do not clock in). Leave-encashment approvals inside the period are
 * added as an earning automatically. Runs move draft → submitted → approved
 * → paid; payslips lock on payment.
 */

/** Pure ratio used by `prorationFactor`. Exported for unit tests. */
export function prorationRatio(input: {
  expectedDays: number;
  creditedDays: number;
  hasAttendanceOrLeave: boolean;
}): number {
  if (input.expectedDays <= 0) return 1;
  if (!input.hasAttendanceOrLeave) return 1;
  return Math.min(1, Math.max(0, input.creditedDays / input.expectedDays));
}

async function ensureManage(ctx: AuthContext): Promise<void> {
  if (!can(ctx.access, "payroll.manage")) {
    throw ApiError.forbidden("Missing permission: payroll.manage");
  }
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ===========================================================================
// F4.1 — salary components (org-wide library)
// ===========================================================================

export async function listComponents(ctx: AuthContext) {
  await ensureManage(ctx);
  return db
    .select()
    .from(salaryComponents)
    .where(eq(salaryComponents.organizationId, ctx.user.organizationId))
    .orderBy(salaryComponents.type, salaryComponents.name);
}

export interface ComponentInput {
  name: string;
  type: "earning" | "deduction";
  amountType: "fixed" | "percent_of_basic";
  defaultAmount?: number;
  isTaxable?: boolean;
  /** Phase 8 — display/reporting group for tax components (config-only). */
  taxGroup?: string;
}

export async function createComponent(ctx: AuthContext, input: ComponentInput) {
  await ensureManage(ctx);
  const orgId = ctx.user.organizationId;
  const name = input.name.trim();
  if (!name) throw ApiError.badRequest("Name is required");
  if (!["earning", "deduction"].includes(input.type)) throw ApiError.badRequest("Type must be earning or deduction");
  if (!["fixed", "percent_of_basic"].includes(input.amountType)) {
    throw ApiError.badRequest("Amount type must be fixed or percent_of_basic");
  }
  const amount = round2(input.defaultAmount ?? 0);
  if (amount < 0) throw ApiError.badRequest("Amount cannot be negative");
  if (input.amountType === "percent_of_basic" && amount > 100) throw ApiError.badRequest("Percent cannot exceed 100");

  const [dup] = await db
    .select({ id: salaryComponents.id })
    .from(salaryComponents)
    .where(
      and(
        eq(salaryComponents.organizationId, orgId),
        sql`lower(${salaryComponents.name}) = lower(${name})`,
        eq(salaryComponents.type, input.type),
      ),
    )
    .limit(1);
  if (dup) throw ApiError.conflict("A component with that name and type already exists");
  const row = first(
    await db
      .insert(salaryComponents)
      .values({
        organizationId: orgId,
        name,
        type: input.type,
        amountType: input.amountType,
        defaultAmount: String(amount),
        isTaxable: input.isTaxable ?? true,
        taxGroup: input.taxGroup?.trim().slice(0, 60) || null,
      })
      .returning(),
  );
  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: "SALARY_COMPONENT_CREATED",
    entityType: "salary_component",
    entityId: row.id,
    newValue: input,
  });
  return row;
}

export async function deactivateComponent(ctx: AuthContext, id: string) {
  await ensureManage(ctx);
  const [row] = await db
    .select({ id: salaryComponents.id })
    .from(salaryComponents)
    .where(and(eq(salaryComponents.id, id), eq(salaryComponents.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!row) throw ApiError.notFound("Component not found");
  await db.update(salaryComponents).set({ active: false }).where(eq(salaryComponents.id, id));
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "SALARY_COMPONENT_DEACTIVATED",
    entityType: "salary_component",
    entityId: id,
  });
}

// ===========================================================================
// F4.1 — salary structures (per employee, versioned)
// ===========================================================================

export interface StructureLineInput {
  componentId: string;
  /** fixed amount (component fixed) or override; leave undefined to use component default */
  amount?: number | null;
  /** percent of base when component is percent_of_basic; leave undefined to use default */
  percentOfBasic?: number | null;
}

export interface StructureInput {
  employeeUserId: string;
  name?: string;
  base: number;
  currency?: string;
  effectiveFrom?: string;
  lines: StructureLineInput[];
}

/** Org members with an employee record (payroll-eligible pickers). Manage only. */
export async function listPayrollMembers(ctx: AuthContext) {
  await ensureManage(ctx);
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      employeeCode: employees.employeeCode,
    })
    .from(employees)
    .innerJoin(users, eq(users.id, employees.userId))
    .where(eq(employees.organizationId, ctx.user.organizationId))
    .orderBy(users.name);
  return rows;
}

async function membersOf(orgId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.organizationId, orgId));
  return new Set(rows.map((r) => r.id));
}

export async function createStructure(ctx: AuthContext, input: StructureInput) {
  await ensureManage(ctx);
  const orgId = ctx.user.organizationId;
  if (!(await membersOf(orgId)).has(input.employeeUserId)) {
    throw ApiError.notFound("Employee not found in this organization");
  }
  const base = round2(input.base);
  if (!(base > 0)) throw ApiError.badRequest("Base pay must be positive");
  if (input.lines.length === 0) throw ApiError.badRequest("Add at least one earning or deduction component");
  const effectiveFrom = input.effectiveFrom ?? new Date().toISOString().slice(0, 10);
  if (effectiveFrom > new Date().toISOString().slice(0, 10) && !input.effectiveFrom) {
    // allowed only when explicitly provided
  }

  // Resolve component definitions (org-scoped)
  const compRows = await db
    .select()
    .from(salaryComponents)
    .where(
      and(
        eq(salaryComponents.organizationId, orgId),
        inArray(salaryComponents.id, input.lines.map((l) => l.componentId)),
      ),
    );
  const compById = new Map(compRows.map((c) => [c.id, c]));
  if (compRows.length !== input.lines.length) throw ApiError.badRequest("One or more components were not found");
  for (const l of input.lines) {
    if (!compById.get(l.componentId)?.active) throw ApiError.badRequest("Only active components can be used");
  }

  // Validate net pay > 0 before persisting (pure check mirrors compute)
  const validation = computeAmounts(
    base,
    input.lines.map((l) => {
      const c = compById.get(l.componentId)!;
      return {
        componentName: c.name,
        type: c.type as "earning" | "deduction",
        amountType: c.amountType as "fixed" | "percent_of_basic",
        defaultAmount: Number(c.defaultAmount),
        amount: l.amount ?? null,
        percentOfBasic: l.percentOfBasic ?? null,
      };
    }),
    1,
  );
  if (validation.gross - validation.totalDeductions <= 0) {
    throw ApiError.badRequest("Net pay must be positive — check the base and deductions");
  }

  // New employee → first structure becomes active; otherwise starts as draft
  const [existingActive] = await db
    .select({ id: salaryStructures.id })
    .from(salaryStructures)
    .where(
      and(
        eq(salaryStructures.organizationId, orgId),
        eq(salaryStructures.employeeUserId, input.employeeUserId),
        eq(salaryStructures.status, "active"),
      ),
    )
    .limit(1);

  const structure = first(
    await db
      .insert(salaryStructures)
      .values({
        organizationId: orgId,
        employeeUserId: input.employeeUserId,
        name: input.name?.trim() || `Salary · ${input.employeeUserId.slice(0, 8)}`,
        base: String(base),
        currency: input.currency ?? "USD",
        effectiveFrom,
        status: existingActive ? "draft" : "active",
        createdBy: ctx.user.id,
      })
      .returning(),
  );

  const rows = input.lines.map((l) => {
    const c = compById.get(l.componentId)!;
    const isPct = c.amountType === "percent_of_basic";
    return {
      organizationId: orgId,
      structureId: structure.id,
      componentId: l.componentId,
      amount: !isPct ? String(round2(l.amount ?? Number(c.defaultAmount))) : null,
      percentOfBasic: isPct ? String(round2(l.percentOfBasic ?? Number(c.defaultAmount))) : null,
    };
  });
  await db.insert(salaryStructureLines).values(rows);

  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: "SALARY_STRUCTURE_CREATED",
    entityType: "salary_structure",
    entityId: structure.id,
    newValue: { employeeUserId: input.employeeUserId, base, status: structure.status },
  });
  return structure;
}

/** Make a draft structure active, superseding the employee's previous one. */
export async function activateStructure(ctx: AuthContext, structureId: string) {
  await ensureManage(ctx);
  const orgId = ctx.user.organizationId;
  const [s] = await db
    .select({
      id: salaryStructures.id,
      status: salaryStructures.status,
      employeeUserId: salaryStructures.employeeUserId,
    })
    .from(salaryStructures)
    .where(and(eq(salaryStructures.id, structureId), eq(salaryStructures.organizationId, orgId)))
    .limit(1);
  if (!s) throw ApiError.notFound("Structure not found");
  if (s.status === "active") return s;
  if (s.status !== "draft") throw ApiError.conflict("Only draft structures can be activated");

  await db
    .update(salaryStructures)
    .set({ status: "superseded" })
    .where(
      and(
        eq(salaryStructures.organizationId, orgId),
        eq(salaryStructures.employeeUserId, s.employeeUserId),
        eq(salaryStructures.status, "active"),
      ),
    );
  const updated = first(
    await db.update(salaryStructures).set({ status: "active" }).where(eq(salaryStructures.id, structureId)).returning(),
  );
  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: "SALARY_STRUCTURE_ACTIVATED",
    entityType: "salary_structure",
    entityId: structureId,
  });
  return updated;
}

export interface StructureRow {
  id: string;
  employeeUserId: string;
  employeeName: string;
  name: string;
  base: number;
  currency: string;
  effectiveFrom: string;
  status: string;
  lineCount: number;
}

export async function listStructures(ctx: AuthContext): Promise<StructureRow[]> {
  await ensureManage(ctx);
  const rows = await db
    .select({
      id: salaryStructures.id,
      employeeUserId: salaryStructures.employeeUserId,
      employeeName: users.name,
      name: salaryStructures.name,
      base: salaryStructures.base,
      currency: salaryStructures.currency,
      effectiveFrom: salaryStructures.effectiveFrom,
      status: salaryStructures.status,
      lineCount: sql<number>`(
        SELECT count(*)::int FROM salary_structure_lines l WHERE l.structure_id = ${salaryStructures.id}
      )`,
    })
    .from(salaryStructures)
    .innerJoin(users, eq(users.id, salaryStructures.employeeUserId))
    .where(eq(salaryStructures.organizationId, ctx.user.organizationId))
    .orderBy(desc(salaryStructures.createdAt))
    .limit(300);
  return rows.map((r) => ({ ...r, base: Number(r.base) }));
}

// ===========================================================================
// F4.2 — payroll computation (pure + data lookups)
// ===========================================================================

interface RawLine {
  componentName: string;
  type: "earning" | "deduction";
  amountType: "fixed" | "percent_of_basic";
  defaultAmount: number;
  amount: number | null;
  percentOfBasic: number | null;
}

/**
 * Pure payroll math — unit-testable. Base is always an earning ("Basic").
 * Percent-of-basic amounts are computed on the base. factor ∈ (0,1] is the
 * worked-day proration.
 */
export function computeAmounts(
  base: number,
  rawLines: RawLine[],
  factor: number,
): { earnings: { component: string; amount: number }[]; deductions: { component: string; amount: number }[]; gross: number; totalDeductions: number; net: number } {
  const f = Math.max(0.05, Math.min(1, factor));
  const earnings: { component: string; amount: number }[] = [{ component: "Basic (base)", amount: round2(base * f) }];
  const deductions: { component: string; amount: number }[] = [];

  for (const l of rawLines) {
    const amount =
      l.amountType === "percent_of_basic"
        ? (base * (l.percentOfBasic ?? l.defaultAmount)) / 100
        : (l.amount ?? l.defaultAmount);
    const target = l.type === "earning" ? earnings : deductions;
    target.push({ component: l.componentName, amount: round2(amount * f) });
  }
  const gross = round2(earnings.reduce((s, e) => s + e.amount, 0));
  const totalDeductions = round2(deductions.reduce((s, d) => s + d.amount, 0));
  return { earnings, deductions, gross, totalDeductions, net: round2(gross - totalDeductions) };
}

async function activeStructureLines(
  orgId: string,
  employeeUserId: string,
): Promise<{ base: number; currency: string; lines: RawLine[] } | null> {
  const [s] = await db
    .select({
      id: salaryStructures.id,
      base: salaryStructures.base,
      currency: salaryStructures.currency,
    })
    .from(salaryStructures)
    .where(
      and(
        eq(salaryStructures.organizationId, orgId),
        eq(salaryStructures.employeeUserId, employeeUserId),
        eq(salaryStructures.status, "active"),
      ),
    )
    .limit(1);
  if (!s) return null;

  const lines = await db
    .select({
      componentName: salaryComponents.name,
      type: salaryComponents.type,
      amountType: salaryComponents.amountType,
      defaultAmount: salaryComponents.defaultAmount,
      amount: salaryStructureLines.amount,
      percentOfBasic: salaryStructureLines.percentOfBasic,
    })
    .from(salaryStructureLines)
    .innerJoin(salaryComponents, eq(salaryComponents.id, salaryStructureLines.componentId))
    .where(eq(salaryStructureLines.structureId, s.id));
  return {
    base: Number(s.base),
    currency: s.currency,
    lines: lines.map((l) => ({
      componentName: l.componentName,
      type: l.type as "earning" | "deduction",
      amountType: l.amountType as "fixed" | "percent_of_basic",
      defaultAmount: Number(l.defaultAmount),
      amount: l.amount !== null ? Number(l.amount) : null,
      percentOfBasic: l.percentOfBasic !== null ? Number(l.percentOfBasic) : null,
    })),
  };
}

/**
 * Worked-day ratio inside a period: |clock-in ∪ approved paid-leave| /
 * scheduled workdays. Clock-in and paid leave on the same day count once.
 * UNPAID leave is not credited (and a month of only unpaid leave is not
 * treated as "no attendance → full pay"). Holidays are excluded from the
 * expected-day denominator, so they neither help nor hurt.
 *
 * G-17: workdays follow the ORGANIZATION's calendar — workweek_days (ISO day
 * numbers, default Mon–Fri, matching the old hardcoded behavior) evaluated in
 * the org's timezone, not the server's UTC.
 */
async function prorationFactor(orgId: string, employeeUserId: string, startIso: string, endIso: string): Promise<number> {
  const expectedRes = await db.execute(sql`
    WITH org AS (
      SELECT timezone, workweek_days FROM organizations WHERE id = ${orgId}
    )
    SELECT count(*)::int AS n
    FROM generate_series(${startIso}::date, ${endIso}::date, '1 day') AS d
    WHERE EXTRACT(ISODOW FROM (d AT TIME ZONE (SELECT timezone FROM org)))::text
            = ANY (SELECT unnest(workweek_days) FROM org)
      AND NOT EXISTS (SELECT 1 FROM holidays h WHERE h.organization_id = ${orgId} AND h.date = d::date)
  `);
  const expectedDays = Number(expectedRes.rows[0]?.n ?? 0);
  if (expectedDays <= 0) return 1;

  const creditRes = await db.execute(sql`
    WITH org AS (
      SELECT timezone, workweek_days FROM organizations WHERE id = ${orgId}
    ),
    workdays AS (
      SELECT d::date AS day
      FROM generate_series(${startIso}::date, ${endIso}::date, '1 day') AS d
      WHERE EXTRACT(ISODOW FROM (d AT TIME ZONE (SELECT timezone FROM org)))::text
              = ANY (SELECT unnest(workweek_days) FROM org)
        AND NOT EXISTS (SELECT 1 FROM holidays h WHERE h.organization_id = ${orgId} AND h.date = d::date)
    ),
    leave_ranges AS (
      SELECT lr.start_date, lr.end_date, lt.paid
      FROM leave_requests lr
      JOIN leave_types lt ON lt.id = lr.leave_type_id
      WHERE lr.organization_id = ${orgId}
        AND lr.user_id = ${employeeUserId}
        AND lr.status = 'approved'
        AND lr.end_date >= ${startIso}::date
        AND lr.start_date <= ${endIso}::date
    ),
    clocked AS (
      SELECT DISTINCT a.clock_in::date AS day
      FROM attendance_records a
      WHERE a.organization_id = ${orgId}
        AND a.user_id = ${employeeUserId}
        AND a.clock_in::date >= ${startIso}::date
        AND a.clock_in::date <= ${endIso}::date
        AND EXISTS (SELECT 1 FROM workdays w WHERE w.day = a.clock_in::date)
    ),
    paid_days AS (
      SELECT w.day FROM workdays w
      WHERE EXISTS (SELECT 1 FROM leave_ranges p WHERE p.paid = true AND w.day BETWEEN p.start_date AND p.end_date)
    ),
    unpaid_days AS (
      SELECT w.day FROM workdays w
      WHERE EXISTS (SELECT 1 FROM leave_ranges p WHERE p.paid = false AND w.day BETWEEN p.start_date AND p.end_date)
    ),
    credited AS (
      SELECT day FROM clocked
      UNION
      SELECT day FROM paid_days
    )
    SELECT
      (SELECT count(*) FROM clocked) AS clocked,
      (SELECT count(*) FROM paid_days) AS paid_leave,
      (SELECT count(*) FROM unpaid_days) AS unpaid_leave,
      (SELECT count(*) FROM credited) AS credited
  `);
  const clocked = Number(creditRes.rows[0]?.clocked ?? 0);
  const paidLeave = Number(creditRes.rows[0]?.paid_leave ?? 0);
  const unpaidLeave = Number(creditRes.rows[0]?.unpaid_leave ?? 0);
  const credited = Number(creditRes.rows[0]?.credited ?? 0);
  return prorationRatio({
    expectedDays,
    creditedDays: credited,
    hasAttendanceOrLeave: clocked + paidLeave + unpaidLeave > 0,
  });
}

/**
 * Phase 8 — pending arrears for an employee. Marked applied when the run is
 * computed (see `markArrearsApplied` called from computeRun).
 */
async function pendingArrearsInPeriod(orgId: string, employeeUserId: string): Promise<number> {
  const rows = await db
    .select({ amount: payrollArrears.amount })
    .from(payrollArrears)
    .where(
      and(
        eq(payrollArrears.organizationId, orgId),
        eq(payrollArrears.employeeUserId, employeeUserId),
        eq(payrollArrears.status, "pending"),
      ),
    );
  return rows.reduce((s, r) => s + Number(r.amount), 0);
}

/** Stamp an employee's pending arrears as applied by a run (recompute-safe). */
export async function markArrearsApplied(orgId: string, runId: string, employeeUserId: string): Promise<void> {
  await db
    .update(payrollArrears)
    .set({ status: "applied", appliedRunId: runId })
    .where(
      and(
        eq(payrollArrears.organizationId, orgId),
        eq(payrollArrears.employeeUserId, employeeUserId),
        eq(payrollArrears.status, "pending"),
      ),
    );
}

/** Create an arrears adjustment (payroll.manage) — recovered on next compute. */
export async function createArrears(
  ctx: AuthContext,
  input: { employeeUserId: string; amount: number; reason?: string },
) {
  await ensureManage(ctx);
  if (!(input.amount > 0)) throw ApiError.badRequest("Arrears amount must be positive");
  const row = first(
    await db
      .insert(payrollArrears)
      .values({
        organizationId: ctx.user.organizationId,
        employeeUserId: input.employeeUserId,
        amount: String(round2(input.amount)),
        reason: input.reason?.slice(0, 300) ?? null,
        createdBy: ctx.user.id,
      })
      .returning(),
  );
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "PAYROLL_ARREARS_CREATED",
    entityType: "payroll_arrears",
    entityId: row.id,
    newValue: { amount: input.amount, employee: input.employeeUserId },
  });
  return row;
}

/** Arrears ledger (payroll.manage): pending recover on next compute + applied history. */
export async function listArrears(ctx: AuthContext, opts: { status?: string } = {}) {
  await ensureManage(ctx);
  const status = opts.status === "pending" || opts.status === "applied" ? opts.status : null;
  const rows = await db
    .select({
      id: payrollArrears.id,
      employeeUserId: payrollArrears.employeeUserId,
      employeeName: users.name,
      amount: payrollArrears.amount,
      reason: payrollArrears.reason,
      status: payrollArrears.status,
      appliedRunId: payrollArrears.appliedRunId,
      createdAt: payrollArrears.createdAt,
    })
    .from(payrollArrears)
    .innerJoin(users, eq(users.id, payrollArrears.employeeUserId))
    .where(
      and(
        eq(payrollArrears.organizationId, ctx.user.organizationId),
        status ? eq(payrollArrears.status, status) : undefined,
      ),
    )
    .orderBy(desc(payrollArrears.createdAt))
    .limit(200);
  return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
}

async function encashmentsInPeriod(orgId: string, employeeUserId: string, startIso: string, endIso: string): Promise<number> {
  const rows = await db
    .select({ amount: leaveEncashments.amount })
    .from(leaveEncashments)
    .where(
      and(
        eq(leaveEncashments.organizationId, orgId),
        eq(leaveEncashments.employeeUserId, employeeUserId),
        eq(leaveEncashments.status, "approved"),
        gte(leaveEncashments.decidedAt, new Date(`${startIso}T00:00:00.000Z`)),
        lte(leaveEncashments.decidedAt, new Date(`${endIso}T23:59:59.999Z`)),
      ),
    );
  return rows.reduce((s, r) => s + (r.amount !== null ? Number(r.amount) : 0), 0);
}

/** Compute one payslip payload for an employee in a run period. */
export async function computePayslipFor(
  orgId: string,
  employeeUserId: string,
  periodStart: string,
  periodEnd: string,
  employeeCode: string | null,
  currency: string,
) {
  const structure = await activeStructureLines(orgId, employeeUserId);
  if (!structure) return null;
  const factor = await prorationFactor(orgId, employeeUserId, periodStart, periodEnd);
  const values = computeAmounts(structure.base, structure.lines, factor);

  const encash = await encashmentsInPeriod(orgId, employeeUserId, periodStart, periodEnd);
  const earnings = [...values.earnings];
  if (encash > 0) earnings.push({ component: "Leave encashment", amount: round2(encash) });
  const gross = round2(values.gross + encash);

  // Phase 7: approved salary advances decided inside the period are recovered
  // from this run's pay (deterministic, recompute-safe — mirrors encashment).
  const advance = await advancesInPeriod(orgId, employeeUserId, periodStart, periodEnd);
  const deductions = [...values.deductions];
  if (advance > 0) deductions.push({ component: "Salary advance", amount: round2(advance) });

  // Phase 8: pending arrears (out-of-run adjustments) are recovered here too.
  const arrears = await pendingArrearsInPeriod(orgId, employeeUserId);
  if (arrears > 0) deductions.push({ component: "Arrears", amount: round2(arrears) });

  const totalDeductions = round2(values.totalDeductions + advance + arrears);
  const net = round2(gross - totalDeductions);
  if (net <= 0) {
    throw ApiError.badRequest(
      `Net pay for ${employeeUserId.slice(0, 8)} is not positive — review its salary structure`,
    );
  }
  return {
    employeeUserId,
    employeeCode,
    currency: structure.currency || currency,
    earnings,
    deductions,
    gross,
    totalDeductions,
    net,
  };
}

// ===========================================================================
// F4.2 — payroll runs
// ===========================================================================

export interface RunSummary {
  id: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  currency: string;
  createdAt: Date;
  payslipCount: number;
  gross: number;
  totalDeductions: number;
  net: number;
}

export async function listRuns(ctx: AuthContext): Promise<RunSummary[]> {
  await ensureManage(ctx);
  const rows = await db
    .select({
      id: payrollRuns.id,
      periodLabel: payrollRuns.periodLabel,
      periodStart: payrollRuns.periodStart,
      periodEnd: payrollRuns.periodEnd,
      status: payrollRuns.status,
      currency: payrollRuns.currency,
      createdAt: payrollRuns.createdAt,
      payslipCount: sql<number>`(SELECT count(*)::int FROM payslips p WHERE p.run_id = ${payrollRuns.id})`,
      gross: sql<number>`COALESCE((SELECT sum(gross) FROM payslips p WHERE p.run_id = ${payrollRuns.id}), 0)`,
      totalDeductions: sql<number>`COALESCE((SELECT sum(total_deductions) FROM payslips p WHERE p.run_id = ${payrollRuns.id}), 0)`,
      net: sql<number>`COALESCE((SELECT sum(net) FROM payslips p WHERE p.run_id = ${payrollRuns.id}), 0)`,
    })
    .from(payrollRuns)
    .where(eq(payrollRuns.organizationId, ctx.user.organizationId))
    .orderBy(desc(payrollRuns.createdAt))
    .limit(100);
  return rows.map((r) => ({
    ...r,
    periodStart: String(r.periodStart),
    periodEnd: String(r.periodEnd),
    payslipCount: Number(r.payslipCount),
    gross: Number(r.gross),
    totalDeductions: Number(r.totalDeductions),
    net: Number(r.net),
  }));
}

function monthLabel(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  return d.toLocaleString("en-US", { month: "short", year: "numeric" });
}

export async function createRun(
  ctx: AuthContext,
  input: { periodStart: string; periodEnd: string; periodLabel?: string; currency?: string; schedule?: string },
) {
  await ensureManage(ctx);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(input.periodEnd)) {
    throw ApiError.badRequest("Period dates must be YYYY-MM-DD");
  }
  if (input.periodEnd < input.periodStart) throw ApiError.badRequest("Period end must be after start");
  const days = (Date.parse(input.periodEnd) - Date.parse(input.periodStart)) / 86_400_000 + 1;
  if (days > 62) throw ApiError.badRequest("A run cannot span more than 62 days");
  const currency = input.currency ?? "USD";
  const schedule = input.schedule === "semi_monthly" ? "semi_monthly" : "monthly";

  const row = first(
    await db
      .insert(payrollRuns)
      .values({
        organizationId: ctx.user.organizationId,
        periodLabel: input.periodLabel?.trim() || monthLabel(input.periodStart),
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        currency,
        schedule,
        createdBy: ctx.user.id,
      })
      .returning(),
  );
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "PAYROLL_RUN_CREATED",
    entityType: "payroll_run",
    entityId: row.id,
    newValue: { periodStart: input.periodStart, periodEnd: input.periodEnd },
  });
  return row;
}

/** (Re)compute payslips for every employee with an active structure. Draft only.
 * G-13: the write phase takes `FOR UPDATE NOWAIT` on the run row, so two
 * concurrent computes fail fast instead of interleaving (previously both read
 * status=draft, then both deleted/inserted — the last writer silently won).
 * Payload computation is read-only and parallelized in bounded chunks.
 */
export async function computeRun(ctx: AuthContext, runId: string): Promise<{ count: number }> {
  await ensureManage(ctx);
  const orgId = ctx.user.organizationId;
  const [run] = await db
    .select({
      id: payrollRuns.id,
      status: payrollRuns.status,
      periodStart: payrollRuns.periodStart,
      periodEnd: payrollRuns.periodEnd,
      currency: payrollRuns.currency,
    })
    .from(payrollRuns)
    .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.organizationId, orgId)))
    .limit(1);
  if (!run) throw ApiError.notFound("Payroll run not found");
  if (run.status !== "draft") throw ApiError.conflict("Only draft runs can be (re)computed");

  // employees with an active structure
  const staff = await db
    .select({
      employeeUserId: salaryStructures.employeeUserId,
      employeeCode: employees.employeeCode,
    })
    .from(salaryStructures)
    .leftJoin(employees, and(eq(employees.userId, salaryStructures.employeeUserId), eq(employees.organizationId, orgId)))
    .where(
      and(
        eq(salaryStructures.organizationId, orgId),
        eq(salaryStructures.status, "active"),
      ),
    );

  const start = String(run.periodStart);
  const end = String(run.periodEnd);
  // G-13 — parallel payload computation in bounded chunks (the old per-employee
  // serial loop was ~5 queries × N employees; chunks keep pool pressure sane).
  // Read-only, so running it before the lock is safe — the lock re-check below
  // is what guards the write.
  const payloads: NonNullable<Awaited<ReturnType<typeof computePayslipFor>>>[] = [];
  const CHUNK = 8;
  for (let i = 0; i < staff.length; i += CHUNK) {
    const chunk = staff.slice(i, i + CHUNK);
    const calcs = await Promise.all(
      chunk.map((emp) =>
        computePayslipFor(orgId, emp.employeeUserId, start, end, emp.employeeCode, run.currency).catch((e) => {
          // Pre-validate every structure *before* deleting existing slips so a
          // mid-loop throw cannot leave a half-written run.
          throw e;
        }),
      ),
    );
    for (const calc of calcs) if (calc) payloads.push(calc);
  }

  try {
    await db.transaction(async (tx) => {
      // G-13 — atomic claim of the run row. NOWAIT makes a concurrent compute
      // throw immediately (clear error) instead of queueing and interleaving.
      const claimed = await tx.execute(
        sql`SELECT id FROM payroll_runs WHERE id = ${runId} FOR UPDATE NOWAIT`,
      );
      if (Number(claimed.rowCount ?? 0) !== 1) throw ApiError.conflict("Payroll run is being modified elsewhere");
      // Re-check under the lock — the status may have changed while payloads computed.
      const [fresh] = await tx
        .select({ status: payrollRuns.status })
        .from(payrollRuns)
        .where(eq(payrollRuns.id, runId))
        .limit(1);
      if (!fresh || fresh.status !== "draft") throw ApiError.conflict("Only draft runs can be (re)computed");

      await tx.delete(payslips).where(eq(payslips.runId, runId));
      if (payloads.length > 0) {
        await tx.insert(payslips).values(
          payloads.map((calc) => ({
            organizationId: orgId,
            runId,
            employeeUserId: calc.employeeUserId,
            employeeCode: calc.employeeCode,
            earnings: calc.earnings,
            deductions: calc.deductions,
            gross: String(calc.gross),
            totalDeductions: String(calc.totalDeductions),
            net: String(calc.net),
            currency: calc.currency,
          })),
        );
      }
      // G-13 — arrears consumption rides the same transaction as the slips it
      // belongs to (previously a separate commit after the slips were written).
      for (const calc of payloads) {
        await tx
          .update(payrollArrears)
          .set({ status: "applied", appliedRunId: runId })
          .where(
            and(
              eq(payrollArrears.organizationId, orgId),
              eq(payrollArrears.employeeUserId, calc.employeeUserId),
              eq(payrollArrears.status, "pending"),
            ),
          );
      }
    });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const msg = String(e);
    if (msg.includes("could not obtain lock") || msg.includes("55P03")) {
      throw ApiError.conflict("Another compute of this run is already in progress");
    }
    throw e;
  }
  const count = payloads.length;
  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: "PAYROLL_RUN_COMPUTED",
    entityType: "payroll_run",
    entityId: runId,
    newValue: { payslips: count },
  });
  return { count };
}

async function transition(ctx: AuthContext, runId: string, from: string, to: string, auditAction: string) {
  await ensureManage(ctx);
  const orgId = ctx.user.organizationId;
  const [run] = await db
    .select({ id: payrollRuns.id, status: payrollRuns.status, periodLabel: payrollRuns.periodLabel })
    .from(payrollRuns)
    .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.organizationId, orgId)))
    .limit(1);
  if (!run) throw ApiError.notFound("Payroll run not found");
  if (run.status !== from) throw ApiError.conflict(`Run must be ${from} to ${to}`);
  if (from === "draft" && to === "submitted") {
    const [n] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(payslips)
      .where(eq(payslips.runId, runId));
    if ((n?.c ?? 0) === 0) throw ApiError.badRequest("Compute the run first — there are no payslips");
  }
  const set: Partial<typeof payrollRuns.$inferInsert> = { status: to };
  if (to === "submitted") {
    set.submittedBy = ctx.user.id;
    set.submittedAt = new Date();
  } else if (to === "approved") {
    set.approvedBy = ctx.user.id;
    set.approvedAt = new Date();
  } else if (to === "paid") {
    set.paidBy = ctx.user.id;
    set.paidAt = new Date();
    await db.update(payslips).set({ locked: true }).where(eq(payslips.runId, runId));
    // notify every employee that their payslip is ready
    const recipients = await db
      .select({ userId: payslips.employeeUserId })
      .from(payslips)
      .where(eq(payslips.runId, runId));
    for (const r of recipients) {
      await notify({
        organizationId: orgId,
        userId: r.userId,
        type: "payroll",
        title: `Your payslip for ${run.periodLabel} is available`,
        body: "Approved and marked as paid.",
        link: "/payroll",
      });
    }
  }
  await db.update(payrollRuns).set(set).where(eq(payrollRuns.id, runId));
  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: auditAction,
    entityType: "payroll_run",
    entityId: runId,
    newValue: { from, to },
  });
}

export const submitRun = (ctx: AuthContext, runId: string) =>
  transition(ctx, runId, "draft", "submitted", "PAYROLL_RUN_SUBMITTED");
export const approveRun = (ctx: AuthContext, runId: string) =>
  transition(ctx, runId, "submitted", "approved", "PAYROLL_RUN_APPROVED");
export const markPaid = (ctx: AuthContext, runId: string) =>
  transition(ctx, runId, "approved", "paid", "PAYROLL_RUN_PAID");

export async function deleteRun(ctx: AuthContext, runId: string) {
  await ensureManage(ctx);
  const [run] = await db
    .select({ id: payrollRuns.id, status: payrollRuns.status })
    .from(payrollRuns)
    .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!run) throw ApiError.notFound("Payroll run not found");
  if (run.status !== "draft") throw ApiError.conflict("Only draft runs can be deleted");
  await db.delete(payrollRuns).where(eq(payrollRuns.id, runId)); // payslips cascade
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "PAYROLL_RUN_DELETED",
    entityType: "payroll_run",
    entityId: runId,
  });
}

export interface PayslipDetail {
  id: string;
  runId: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  runStatus: string;
  employeeUserId: string;
  employeeName: string;
  employeeCode: string | null;
  earnings: { component: string; amount: number }[];
  deductions: { component: string; amount: number }[];
  gross: number;
  totalDeductions: number;
  net: number;
  currency: string;
  locked: boolean;
}

/** One run with its payslips (manage). */
export async function runDetail(ctx: AuthContext, runId: string): Promise<{ run: RunSummary; payslips: PayslipDetail[] }> {
  await ensureManage(ctx);
  const orgId = ctx.user.organizationId;
  const [run] = await db
    .select({
      id: payrollRuns.id,
      periodLabel: payrollRuns.periodLabel,
      periodStart: payrollRuns.periodStart,
      periodEnd: payrollRuns.periodEnd,
      status: payrollRuns.status,
      currency: payrollRuns.currency,
      createdAt: payrollRuns.createdAt,
    })
    .from(payrollRuns)
    .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.organizationId, orgId)))
    .limit(1);
  if (!run) throw ApiError.notFound("Payroll run not found");
  const pays = await db
    .select({
      id: payslips.id,
      runId: payslips.runId,
      employeeUserId: payslips.employeeUserId,
      employeeName: users.name,
      employeeCode: payslips.employeeCode,
      earnings: payslips.earnings,
      deductions: payslips.deductions,
      gross: payslips.gross,
      totalDeductions: payslips.totalDeductions,
      net: payslips.net,
      currency: payslips.currency,
      locked: payslips.locked,
    })
    .from(payslips)
    .innerJoin(users, eq(users.id, payslips.employeeUserId))
    .where(and(eq(payslips.runId, runId), eq(payslips.organizationId, orgId)))
    .orderBy(users.name);
  return {
    run: {
      id: run.id,
      periodLabel: run.periodLabel,
      periodStart: String(run.periodStart),
      periodEnd: String(run.periodEnd),
      status: run.status,
      currency: run.currency,
      createdAt: run.createdAt,
      payslipCount: pays.length,
      gross: pays.reduce((s, p) => s + Number(p.gross), 0),
      totalDeductions: pays.reduce((s, p) => s + Number(p.totalDeductions), 0),
      net: pays.reduce((s, p) => s + Number(p.net), 0),
    },
    payslips: pays.map((p) => ({
      id: p.id,
      runId: p.runId,
      periodLabel: run.periodLabel,
      periodStart: String(run.periodStart),
      periodEnd: String(run.periodEnd),
      runStatus: run.status,
      employeeUserId: p.employeeUserId,
      employeeName: p.employeeName,
      employeeCode: p.employeeCode,
      earnings: p.earnings,
      deductions: p.deductions,
      gross: Number(p.gross),
      totalDeductions: Number(p.totalDeductions),
      net: Number(p.net),
      currency: p.currency,
      locked: p.locked,
    })),
  };
}

// ===========================================================================
// F4.3 — employee self-service + F4.4 — bank export
// ===========================================================================

/** The viewer's own payslips (approved or paid runs only). */
export async function myPayslips(ctx: AuthContext) {
  if (!can(ctx.access, "payroll.view_self")) return [];
  const rows = await db
    .select({
      id: payslips.id,
      runId: payslips.runId,
      periodLabel: payrollRuns.periodLabel,
      periodStart: payrollRuns.periodStart,
      periodEnd: payrollRuns.periodEnd,
      runStatus: payrollRuns.status,
      earnings: payslips.earnings,
      deductions: payslips.deductions,
      gross: payslips.gross,
      totalDeductions: payslips.totalDeductions,
      net: payslips.net,
      currency: payslips.currency,
      locked: payslips.locked,
    })
    .from(payslips)
    .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
    .where(
      and(
        eq(payslips.organizationId, ctx.user.organizationId),
        eq(payslips.employeeUserId, ctx.user.id),
        inArray(payrollRuns.status, ["approved", "paid"]),
      ),
    )
    .orderBy(desc(payrollRuns.periodEnd));
  return rows.map((r) => ({
    ...r,
    periodStart: String(r.periodStart),
    periodEnd: String(r.periodEnd),
    gross: Number(r.gross),
    totalDeductions: Number(r.totalDeductions),
    net: Number(r.net),
  }));
}

/** A single payslip visible to its owner (approved/paid) or any payroll manager. */
export async function getPayslip(ctx: AuthContext, payslipId: string) {
  const orgId = ctx.user.organizationId;
  const manage = can(ctx.access, "payroll.manage");
  const [row] = await db
    .select({
      id: payslips.id,
      runId: payslips.runId,
      periodLabel: payrollRuns.periodLabel,
      periodStart: payrollRuns.periodStart,
      periodEnd: payrollRuns.periodEnd,
      runStatus: payrollRuns.status,
      employeeUserId: payslips.employeeUserId,
      employeeName: users.name,
      employeeCode: payslips.employeeCode,
      employeeJobTitle: employees.jobTitle,
      organizationName: organizations.name,
      organizationLogoUrl: organizations.logoUrl,
      earnings: payslips.earnings,
      deductions: payslips.deductions,
      gross: payslips.gross,
      totalDeductions: payslips.totalDeductions,
      net: payslips.net,
      currency: payslips.currency,
      locked: payslips.locked,
    })
    .from(payslips)
    .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
    .innerJoin(users, eq(users.id, payslips.employeeUserId))
    .leftJoin(
      employees,
      and(
        eq(employees.organizationId, orgId),
        eq(employees.userId, payslips.employeeUserId),
      ),
    )
    .innerJoin(organizations, eq(organizations.id, payslips.organizationId))
    .where(and(eq(payslips.id, payslipId), eq(payslips.organizationId, orgId)))
    .limit(1);
  if (!row) throw ApiError.notFound();
  if (row.employeeUserId !== ctx.user.id && !manage) {
    throw ApiError.forbidden("You can only view your own payslips");
  }
  const approvedOnly = row.runStatus === "approved" || row.runStatus === "paid" || manage;
  if (!approvedOnly) throw ApiError.forbidden("Payslips become visible after the run is approved");
  return {
    id: row.id,
    runId: row.runId,
    periodLabel: row.periodLabel,
    periodStart: String(row.periodStart),
    periodEnd: String(row.periodEnd),
    runStatus: row.runStatus,
    employeeUserId: row.employeeUserId,
    employeeName: row.employeeName,
    employeeCode: row.employeeCode,
    employeeJobTitle: row.employeeJobTitle,
    organizationName: row.organizationName,
    organizationLogoUrl: row.organizationLogoUrl,
    earnings: row.earnings,
    deductions: row.deductions,
    gross: Number(row.gross),
    totalDeductions: Number(row.totalDeductions),
    net: Number(row.net),
    currency: row.currency,
    locked: row.locked,
  };
}

export interface BankRow {
  payslipId: string;
  employeeName: string;
  employeeCode: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  ifscCode: string | null;
  net: number;
}

/** Approved/paid run bank remittance rows (net > 0 only). */
export async function bankRows(ctx: AuthContext, runId: string): Promise<BankRow[]> {
  await ensureManage(ctx);
  if (!can(ctx.access, "data.export")) {
    throw ApiError.forbidden("Missing permission: data.export");
  }
  const [run] = await db
    .select({ id: payrollRuns.id, status: payrollRuns.status })
    .from(payrollRuns)
    .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!run) throw ApiError.notFound("Payroll run not found");
  if (!["approved", "paid"].includes(run.status)) {
    throw ApiError.badRequest("Bank export is available after the run is approved");
  }
  const rows = await db
    .select({
      payslipId: payslips.id,
      employeeName: users.name,
      employeeCode: payslips.employeeCode,
      bankName: employees.bankName,
      bankAccountNo: employees.bankAccountNo,
      ifscCode: employees.ifscCode,
      net: payslips.net,
    })
    .from(payslips)
    .innerJoin(users, eq(users.id, payslips.employeeUserId))
    .leftJoin(employees, eq(employees.userId, payslips.employeeUserId))
    .where(
      and(
        eq(payslips.runId, runId),
        eq(payslips.organizationId, ctx.user.organizationId),
        sql`${payslips.net} > 0`,
      ),
    )
    .orderBy(users.name);
  return rows.map((r) => ({
    payslipId: r.payslipId,
    employeeName: r.employeeName,
    employeeCode: r.employeeCode,
    bankName: r.bankName,
    bankAccountNo: r.bankAccountNo,
    ifscCode: r.ifscCode,
    net: Number(r.net),
  }));
}

export async function setBankDetails(
  ctx: AuthContext,
  input: { employeeUserId: string; bankName?: string; bankAccountNo?: string; ifscCode?: string },
) {
  await ensureManage(ctx);
  const orgId = ctx.user.organizationId;
  const [member] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.userId, input.employeeUserId), eq(employees.organizationId, orgId)))
    .limit(1);
  if (!member) throw ApiError.notFound("Employee record not found");
  await db
    .update(employees)
    .set({
      bankName: input.bankName?.trim() || null,
      bankAccountNo: input.bankAccountNo?.trim() || null,
      ifscCode: input.ifscCode?.trim() || null,
    })
    .where(eq(employees.id, member.id));
  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: "EMPLOYEE_BANK_DETAILS_UPDATED",
    entityType: "employee",
    entityId: input.employeeUserId,
    newValue: { hasBank: !!input.bankAccountNo?.trim() },
  });
  return { ok: true };
}

// ===========================================================================
// F4.5 — year-to-date rollups
// ===========================================================================

export interface YtdRow {
  employeeUserId: string;
  employeeName: string;
  periods: number;
  gross: number;
  totalDeductions: number;
  net: number;
}

export async function yearToDate(ctx: AuthContext, year: number): Promise<YtdRow[]> {
  await ensureManage(ctx);
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const rows = await db.execute(sql`
    SELECT p.employee_user_id AS "employeeUserId",
           u.name AS "employeeName",
           count(*)::int AS periods,
           sum(p.gross)::numeric AS gross,
           sum(p.total_deductions)::numeric AS "totalDeductions",
           sum(p.net)::numeric AS net
    FROM payslips p
    JOIN payroll_runs r ON r.id = p.run_id
    JOIN users u ON u.id = p.employee_user_id
    WHERE p.organization_id = ${ctx.user.organizationId}
      AND r.period_end >= ${start}::date
      AND r.period_end <= ${end}::date
      AND r.status IN ('approved', 'paid')
    GROUP BY p.employee_user_id, u.name
    ORDER BY u.name
  `);
  return (rows.rows as unknown as Omit<YtdRow, "gross" | "totalDeductions" | "net">[]).map((r) => ({
    ...r,
    gross: Number((r as unknown as { gross: string }).gross),
    totalDeductions: Number((r as unknown as { totalDeductions: string }).totalDeductions),
    net: Number((r as unknown as { net: string }).net),
  }));
}
