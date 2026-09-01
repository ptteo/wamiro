/**
 * Metric registry (blueprint §68): every KPI has ONE definition, computed
 * here — never inline in UI.
 *
 * Scoping: TEAM viewers pass an explicit member-id list; COMPANY passes null
 * (= whole org). Same definitions, narrower inputs. All values are bound
 * parameters — no string-built SQL.
 */
import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/session";
import { employees } from "@/db/schema";
import { widestScope } from "@/modules/iam/engine";

export type Sensitivity = "internal" | "confidential";

/** null = unrestricted (org-wide); array = only these members. */
type MemberScope = string[] | null;

async function resolveMemberIds(ctx: AuthContext): Promise<string[]> {
  // TEAM / DEPARTMENT / SELF → self + direct reports
  const rows = await db
    .select({ id: employees.userId })
    .from(employees)
    .where(eq(employees.managerUserId, ctx.user.id));
  return [ctx.user.id, ...rows.map((r) => r.id)];
}

async function scalar(query: ReturnType<typeof db.execute>): Promise<number> {
  const row = (await query).rows[0] as Record<string, unknown> | undefined;
  return Number(row?.["value"] ?? 0);
}

/**
 * Postgres array literal for `= ANY($1::uuid[])`. A JS array bound directly
 * makes drizzle flatten it into a tuple `($1,$2)` which cannot cast to
 * uuid[]; a single string param `{id,id}` casts cleanly.
 */
function uuidArrayLiteral(ids: string[]): string {
  return `{${ids.join(",")}}`;
}

// ---------- metric definitions ----------

const headcountDef = {
  id: "headcount",
  label: "Headcount",
  definition: "Active employees",
  sensitivity: "internal" as Sensitivity,
};

async function computeHeadcount(orgId: string, scope: MemberScope): Promise<number> {
  return scalar(
    db.execute(sql`
      SELECT count(*)::int AS value FROM employees e JOIN users u ON u.id = e.user_id
      WHERE e.organization_id = ${orgId} AND u.status = 'active'
        ${scope ? sql`AND e.user_id = ANY(${uuidArrayLiteral(scope)}::uuid[])` : sql``}
    `),
  );
}

async function computeOnLeaveToday(orgId: string, scope: MemberScope): Promise<number> {
  return scalar(
    db.execute(sql`
      SELECT count(DISTINCT lr.user_id)::int AS value
      FROM leave_requests lr
      WHERE lr.organization_id = ${orgId}
        AND lr.status = 'approved'
        AND CURRENT_DATE BETWEEN lr.start_date AND lr.end_date
        ${scope ? sql`AND lr.user_id = ANY(${uuidArrayLiteral(scope)}::uuid[])` : sql``}
    `),
  );
}

async function computePendingApprovals(orgId: string): Promise<number> {
  return scalar(
    db.execute(sql`
      SELECT (
        (SELECT count(*) FROM leave_requests WHERE organization_id = ${orgId} AND status = 'pending') +
        (SELECT count(*) FROM requests        WHERE organization_id = ${orgId} AND status = 'pending')
      )::int AS value
    `),
  );
}

async function computeApprovalLatencyHours(orgId: string, scope: MemberScope): Promise<number> {
  return scalar(
    db.execute(sql`
      SELECT COALESCE(round(avg(EXTRACT(EPOCH FROM (lr.reviewed_at - lr.created_at)) / 3600)::numeric, 1), 0)::float8 AS value
      FROM leave_requests lr
      WHERE lr.organization_id = ${orgId}
        AND lr.reviewed_at IS NOT NULL
        AND lr.created_at > now() - interval '30 days'
        ${scope ? sql`AND lr.user_id = ANY(${uuidArrayLiteral(scope)}::uuid[])` : sql``}
    `),
  );
}

interface DayPoint {
  date: string;
  clockIns: number;
}

async function computeAttendance7d(orgId: string, scope: MemberScope): Promise<DayPoint[]> {
  const res = await db.execute(sql`
    WITH days AS (
      SELECT generate_series(CURRENT_DATE - 6, CURRENT_DATE, interval '1 day')::date AS d
    )
    SELECT to_char(days.d, 'DD Mon') AS date,
           count(DISTINCT ar.user_id)::int AS "clockIns"
    FROM days
    LEFT JOIN attendance_records ar
      ON ar.clock_in::date = days.d
     AND ar.organization_id = ${orgId}
     ${scope ? sql`AND ar.user_id = ANY(${uuidArrayLiteral(scope)}::uuid[])` : sql``}
    GROUP BY days.d
    ORDER BY days.d
  `);
  return (res.rows as unknown as { date: string; clockIns: number }[]).map((r) => ({
    date: r.date,
    clockIns: Number(r.clockIns),
  }));
}

// ---------- additional metrics (m10) ----------

async function computeOpenPositions(orgId: string): Promise<number> {
  return scalar(
    db.execute(sql`
      SELECT count(*)::int AS value FROM job_openings
      WHERE organization_id = ${orgId} AND status = 'open'
    `),
  );
}

async function computeHires30d(orgId: string): Promise<number> {
  return scalar(
    db.execute(sql`
      SELECT count(*)::int AS value FROM employees
      WHERE organization_id = ${orgId} AND hired_at IS NOT NULL
        AND hired_at > now() - interval '30 days'
    `),
  );
}

async function computeExpensePendingCents(orgId: string, scope: MemberScope): Promise<number> {
  return scalar(
    db.execute(sql`
      SELECT COALESCE(sum(amount_cents),0)::bigint::int AS value
      FROM expenses
      WHERE organization_id = ${orgId} AND status = 'submitted'
        ${scope ? sql`AND submitted_by = ANY(${uuidArrayLiteral(scope)}::uuid[])` : sql``}
    `),
  );
}

async function computeKnowledgeArticles(orgId: string): Promise<number> {
  return scalar(
    db.execute(sql`
      SELECT count(*)::int AS value FROM knowledge_articles
      WHERE organization_id = ${orgId}
    `),
  );
}

async function computeOverdueObligations(orgId: string): Promise<number> {
  return scalar(
    db.execute(sql`
      SELECT count(*)::int AS value FROM gov_obligations
      WHERE organization_id = ${orgId} AND status = 'open' AND due_at < now()
    `),
  );
}

async function computeBudgetUtilizationPct(orgId: string): Promise<number> {
  return scalar(
    db.execute(sql`
      SELECT COALESCE(round(100.0 * sum(spent_cents) / nullif(sum(amount_cents),0), 1), 0)::float8 AS value
      FROM budgets
      WHERE organization_id = ${orgId} AND status = 'active'
    `),
  );
}

interface CategoryPoint { category: string; cents: number }

async function computeExpenseByCategory30d(orgId: string, scope: MemberScope): Promise<CategoryPoint[]> {
  const res = await db.execute(sql`
    SELECT category,
           COALESCE(sum(amount_cents),0)::bigint::int AS cents
    FROM expenses
    WHERE organization_id = ${orgId}
      AND incurred_at >= CURRENT_DATE - 30
      AND status IN ('approved','reimbursed')
      ${scope ? sql`AND submitted_by = ANY(${uuidArrayLiteral(scope)}::uuid[])` : sql``}
    GROUP BY category
    ORDER BY cents DESC
    LIMIT 8
  `);
  return (res.rows as unknown as { category: string; cents: number }[]).map((r) => ({
    category: r.category,
    cents: Number(r.cents),
  }));
}

interface LeaveTypePoint { type: string; days: number }

async function computeLeaveByType30d(orgId: string, scope: MemberScope): Promise<LeaveTypePoint[]> {
  const res = await db.execute(sql`
    SELECT lt.name AS type,
           COALESCE(sum(lr.days), 0)::float8 AS days
    FROM leave_requests lr
    JOIN leave_types lt ON lt.id = lr.leave_type_id
    WHERE lr.organization_id = ${orgId}
      AND lr.created_at > now() - interval '30 days'
      AND lr.status = 'approved'
      ${scope ? sql`AND lr.user_id = ANY(${uuidArrayLiteral(scope)}::uuid[])` : sql``}
    GROUP BY lt.name
    ORDER BY days DESC
    LIMIT 8
  `);
  return (res.rows as unknown as { type: string; days: number }[]).map((r) => ({
    type: r.type,
    days: Number(r.days),
  }));
}

// ---------- scoped overview ----------

export interface Overview {
  scope: "team" | "company";
  scopeLabel: string;
  headcount: number;
  onLeaveToday: number;
  pendingApprovals: number;
  approvalLatencyHours: number;
  attendanceLast7Days: DayPoint[];
  // m10 additions
  openPositions: number;
  hires30d: number;
  expensePendingCents: number;
  expensePendingByCurrency: { currency: string; cents: number }[];
  knowledgeArticles: number;
  overdueObligations: number;
  budgetUtilizationPct: number;
  expenseByCategory30d: CategoryPoint[];
  leaveByType30d: LeaveTypePoint[];
  // 30-day-prior comparisons for the existing core metrics
  headcountPrior30d: number;
  pendingApprovalsPrior30d: number;
  onLeaveTodayPrior30d: number;
}

async function computeExpensePendingByCurrency(orgId: string, scope: MemberScope): Promise<{ currency: string; cents: number }[]> {
  const res = await db.execute(sql`
    SELECT currency, COALESCE(sum(amount_cents),0)::bigint::int AS cents
    FROM expenses
    WHERE organization_id = ${orgId} AND status = 'submitted'
      ${scope ? sql`AND submitted_by = ANY(${uuidArrayLiteral(scope)}::uuid[])` : sql``}
    GROUP BY currency
    ORDER BY cents DESC
  `);
  return (res.rows as unknown as { currency: string; cents: number }[]).map((r) => ({
    currency: r.currency,
    cents: Number(r.cents),
  }));
}

async function computeHeadcountPrior30d(orgId: string, scope: MemberScope): Promise<number> {
  return scalar(
    db.execute(sql`
      SELECT count(*)::int AS value FROM employees e JOIN users u ON u.id = e.user_id
      WHERE e.organization_id = ${orgId} AND u.status = 'active'
        AND e.hired_at IS NOT NULL AND e.hired_at <= (CURRENT_DATE - 30)
        ${scope ? sql`AND e.user_id = ANY(${uuidArrayLiteral(scope)}::uuid[])` : sql``}
    `),
  );
}

async function computePendingApprovalsPrior30d(orgId: string): Promise<number> {
  return scalar(
    db.execute(sql`
      SELECT (
        (SELECT count(*) FROM leave_requests WHERE organization_id = ${orgId} AND status = 'pending'
           AND created_at <= (now() - interval '30 days')) +
        (SELECT count(*) FROM requests        WHERE organization_id = ${orgId} AND status = 'pending'
           AND created_at <= (now() - interval '30 days'))
      )::int AS value
    `),
  );
}

async function computeOnLeaveTodayPrior30d(orgId: string, scope: MemberScope): Promise<number> {
  return scalar(
    db.execute(sql`
      SELECT count(DISTINCT lr.user_id)::int AS value
      FROM leave_requests lr
      WHERE lr.organization_id = ${orgId}
        AND lr.status = 'approved'
        AND (CURRENT_DATE - 30) BETWEEN lr.start_date AND lr.end_date
        ${scope ? sql`AND lr.user_id = ANY(${uuidArrayLiteral(scope)}::uuid[])` : sql``}
    `),
  );
}

export async function overview(ctx: AuthContext): Promise<Overview | null> {
  const orgId = ctx.user.organizationId;
  const scope = widestScope(ctx.access, "analytics.view");
  if (!scope) return null;

  let s: MemberScope;
  if (scope === "COMPANY" || scope === "GLOBAL") {
    s = null; // whole org
  } else {
    const ids = await resolveMemberIds(ctx);
    if (ids.length === 0) return null; // no visible members
    s = ids;
  }

  const [
    headcount, onLeaveToday, pendingApprovals, approvalLatencyHours, attendanceLast7Days,
    openPositions, hires30d, expensePendingCents, expensePendingByCurrency,
    knowledgeArticles, overdueObligations, budgetUtilizationPct,
    expenseByCategory30d, leaveByType30d,
    headcountPrior30d, pendingApprovalsPrior30d, onLeaveTodayPrior30d,
  ] = await Promise.all([
    computeHeadcount(orgId, s),
    computeOnLeaveToday(orgId, s),
    computePendingApprovals(orgId),
    computeApprovalLatencyHours(orgId, s),
    computeAttendance7d(orgId, s),
    computeOpenPositions(orgId),
    computeHires30d(orgId),
    computeExpensePendingCents(orgId, s),
    computeExpensePendingByCurrency(orgId, s),
    computeKnowledgeArticles(orgId),
    computeOverdueObligations(orgId),
    computeBudgetUtilizationPct(orgId),
    computeExpenseByCategory30d(orgId, s),
    computeLeaveByType30d(orgId, s),
    computeHeadcountPrior30d(orgId, s),
    computePendingApprovalsPrior30d(orgId),
    computeOnLeaveTodayPrior30d(orgId, s),
  ]);

  return {
    scope: s === null ? "company" : "team",
    scopeLabel: s === null ? "Company-wide" : "Your team + reports",
    headcount, onLeaveToday, pendingApprovals, approvalLatencyHours, attendanceLast7Days,
    openPositions, hires30d, expensePendingCents, expensePendingByCurrency,
    knowledgeArticles, overdueObligations, budgetUtilizationPct,
    expenseByCategory30d, leaveByType30d,
    headcountPrior30d, pendingApprovalsPrior30d, onLeaveTodayPrior30d,
  };
}

// exported for the admin/metric documentation surface later
export const registryDocumentation = [
  headcountDef,
  { id: "on_leave_today", label: "On leave today", definition: "Approved leave spanning today", sensitivity: "internal" as Sensitivity },
  { id: "pending_approvals", label: "Pending approvals", definition: "Unreviewed leave + generic requests", sensitivity: "internal" as Sensitivity },
  { id: "approval_latency_hours", label: "Avg approval time (h)", definition: "Mean hours to decision, last 30 days", sensitivity: "internal" as Sensitivity },
  { id: "open_positions", label: "Open positions", definition: "Job openings in status open", sensitivity: "internal" as Sensitivity },
  { id: "hires_30d", label: "Hires (30d)", definition: "Employees hired in last 30 days", sensitivity: "internal" as Sensitivity },
  { id: "expense_pending_cents", label: "Expenses awaiting approval", definition: "Sum of submitted expenses", sensitivity: "confidential" as Sensitivity },
  { id: "knowledge_articles", label: "Published articles", definition: "Knowledge base published count", sensitivity: "internal" as Sensitivity },
  { id: "overdue_obligations", label: "Overdue obligations", definition: "Open governance obligations past due", sensitivity: "internal" as Sensitivity },
  { id: "budget_utilization_pct", label: "Budget utilization", definition: "Active budgets spent / allocated", sensitivity: "confidential" as Sensitivity },
];
