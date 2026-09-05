/**
 * Phase 5 — HR & support analytics.
 *
 * Companion to ./service.ts (workforce overview). These are the Frappe-HR /
 * Zammad parity reports: org-wide by design, so both entry points are gated
 * on COMPANY-scope permissions (tickets.sla_view for support, analytics.view_company
 * for HR). Same rule as ./service.ts: every metric has ONE definition, computed
 * here — never inline in the UI. All values are bound parameters.
 */
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/session";
import { can } from "@/modules/iam/engine";

// ============================================================================
// Support analytics (Zammad parity) — gated on tickets.sla_view
// ============================================================================

export interface SupportAnalytics {
  volume: {
    total: number;
    open: number;
    resolved: number;
    byStatus: { status: string; count: number }[];
    byCategory: { category: string; count: number }[];
    byPriority: { priority: string; count: number }[];
    trend30d: { date: string; count: number }[];
  };
  sla: {
    compliancePct: number;
    met: number;
    due: number;
    byPriority: { priority: string; met: number; due: number; pct: number }[];
    firstResponseAvgHours: number;
    firstResponseCount: number;
    firstResponseCompliancePct: number;
  };
  csat: {
    avg: number;
    count: number;
    responseRatePct: number;
    distribution: { score: number; count: number }[];
  };
  groups: { name: string; open: number; total: number }[];
  unassignedOpen: number;
  assignees: { name: string; open: number; total: number }[];
}

// Postgres array literals (not JS arrays — drizzle flattens those into
// tuple placeholders that cannot cast; see uuidArrayLiteral in ./service.ts).
const OPEN_STATUS = "{new,open,waiting}";
const RESOLVED_STATUS = "{resolved,closed}";

export async function supportAnalytics(ctx: AuthContext): Promise<SupportAnalytics | null> {
  if (!can(ctx.access, "tickets.sla_view")) return null;
  const orgId = ctx.user.organizationId;

  const [volRow, byStatus, byCategory, byPriority, trend, slaRow, slaByPriority, frRow, frCompliance, csatRow, groups, unassigned, assignees] =
    await Promise.all([
      db.execute(sql`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE status = ANY(${OPEN_STATUS}::text[]))::int AS open,
               count(*) FILTER (WHERE status = ANY(${RESOLVED_STATUS}::text[]))::int AS resolved
        FROM tickets WHERE organization_id = ${orgId}
      `),
      db.execute(sql`
        SELECT status, count(*)::int AS count FROM tickets
        WHERE organization_id = ${orgId} GROUP BY status ORDER BY count DESC
      `),
      db.execute(sql`
        SELECT category, count(*)::int AS count FROM tickets
        WHERE organization_id = ${orgId} GROUP BY category ORDER BY count DESC
      `),
      db.execute(sql`
        SELECT priority, count(*)::int AS count FROM tickets
        WHERE organization_id = ${orgId} GROUP BY priority ORDER BY count DESC
      `),
      db.execute(sql`
        WITH days AS (SELECT generate_series(CURRENT_DATE - 29, CURRENT_DATE, interval '1 day')::date AS d)
        SELECT to_char(days.d, 'DD Mon') AS date, count(t.id)::int AS count
        FROM days
        LEFT JOIN tickets t ON t.created_at::date = days.d AND t.organization_id = ${orgId}
        GROUP BY days.d ORDER BY days.d
      `),
      db.execute(sql`
        SELECT count(*)::int AS due,
               count(*) FILTER (WHERE resolved_at <= sla_due_date)::int AS met
        FROM tickets
        WHERE organization_id = ${orgId} AND status = ANY(${RESOLVED_STATUS}::text[]) AND sla_due_date IS NOT NULL
      `),
      db.execute(sql`
        SELECT priority,
               count(*)::int AS due,
               count(*) FILTER (WHERE resolved_at <= sla_due_date)::int AS met
        FROM tickets
        WHERE organization_id = ${orgId} AND status = ANY(${RESOLVED_STATUS}::text[]) AND sla_due_date IS NOT NULL
        GROUP BY priority ORDER BY due DESC
      `),
      db.execute(sql`
        SELECT COALESCE(round(avg(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 3600)::numeric, 1), 0)::float8 AS value,
               count(*)::int AS count
        FROM tickets
        WHERE organization_id = ${orgId} AND first_response_at IS NOT NULL
          AND created_at > now() - interval '30 days'
      `),
      db.execute(sql`
        SELECT count(*)::int AS due,
               count(*) FILTER (WHERE first_response_at <= first_response_due_at)::int AS met
        FROM tickets
        WHERE organization_id = ${orgId} AND first_response_due_at IS NOT NULL
      `),
      db.execute(sql`
        SELECT COALESCE(round(avg(csat_score)::numeric, 2), 0)::float8 AS avg,
               count(*)::int AS count,
               count(*) FILTER (WHERE csat_score = 1)::int AS s1,
               count(*) FILTER (WHERE csat_score = 2)::int AS s2,
               count(*) FILTER (WHERE csat_score = 3)::int AS s3,
               count(*) FILTER (WHERE csat_score = 4)::int AS s4,
               count(*) FILTER (WHERE csat_score = 5)::int AS s5
        FROM tickets WHERE organization_id = ${orgId} AND csat_score IS NOT NULL
      `),
      db.execute(sql`
        SELECT g.name, count(t.id) FILTER (WHERE t.status = ANY(${OPEN_STATUS}::text[]))::int AS open,
               count(t.id)::int AS total
        FROM ticket_groups g
        LEFT JOIN tickets t ON t.group_id = g.id
        WHERE g.organization_id = ${orgId}
        GROUP BY g.id, g.name ORDER BY open DESC
      `),
      db.execute(sql`
        SELECT count(*)::int AS value FROM tickets
        WHERE organization_id = ${orgId} AND status = ANY(${OPEN_STATUS}::text[]) AND assignee_id IS NULL
      `),
      db.execute(sql`
        SELECT u.name, count(t.id) FILTER (WHERE t.status = ANY(${OPEN_STATUS}::text[]))::int AS open,
               count(t.id)::int AS total
        FROM users u
        LEFT JOIN tickets t ON t.assignee_id = u.id AND t.organization_id = ${orgId}
        WHERE u.organization_id = ${orgId}
        GROUP BY u.id, u.name
        HAVING count(t.id) > 0
        ORDER BY open DESC, total DESC LIMIT 8
      `),
    ]);

  const vol = volRow.rows[0] as { total: number; open: number; resolved: number };
  const sla = slaRow.rows[0] as { due: number; met: number };
  const fr = frRow.rows[0] as { value: number; count: number };
  const frc = frCompliance.rows[0] as { due: number; met: number };
  const cs = csatRow.rows[0] as { avg: number; count: number; s1: number; s2: number; s3: number; s4: number; s5: number };

  const slaDue = Number(sla.due);
  const slaMet = Number(sla.met);
  const frDue = Number(frc.due);
  const frMet = Number(frc.met);
  const resolvedTotal = Number(vol.resolved);

  return {
    volume: {
      total: Number(vol.total),
      open: Number(vol.open),
      resolved: resolvedTotal,
      byStatus: byStatus.rows as { status: string; count: number }[],
      byCategory: byCategory.rows as { category: string; count: number }[],
      byPriority: byPriority.rows as { priority: string; count: number }[],
      trend30d: trend.rows as { date: string; count: number }[],
    },
    sla: {
      compliancePct: slaDue === 0 ? 0 : Math.round((slaMet / slaDue) * 1000) / 10,
      met: slaMet,
      due: slaDue,
      byPriority: (slaByPriority.rows as { priority: string; met: number; due: number }[]).map((r) => {
        const due = Number(r.due);
        const met = Number(r.met);
        return { priority: r.priority, met, due, pct: due === 0 ? 0 : Math.round((met / due) * 1000) / 10 };
      }),
      firstResponseAvgHours: Number(fr.value),
      firstResponseCount: Number(fr.count),
      firstResponseCompliancePct: frDue === 0 ? 0 : Math.round((frMet / frDue) * 1000) / 10,
    },
    csat: {
      avg: Number(cs.avg),
      count: Number(cs.count),
      responseRatePct: resolvedTotal === 0 ? 0 : Math.round((Number(cs.count) / resolvedTotal) * 1000) / 10,
      distribution: [1, 2, 3, 4, 5].map((score) => ({
        score,
        count: Number((cs as unknown as Record<string, number>)[`s${score}`] ?? 0),
      })),
    },
    groups: groups.rows as { name: string; open: number; total: number }[],
    unassignedOpen: Number(unassigned.rows[0]?.["value"] ?? 0),
    assignees: assignees.rows as { name: string; open: number; total: number }[],
  };
}

// ============================================================================
// HR analytics (Frappe parity) — gated on analytics.view_company
// ============================================================================

export interface HrAnalytics {
  headcountByDepartment: { department: string; count: number }[];
  headcountByStatus: { status: string; count: number }[];
  attrition: {
    monthly: { month: string; joins: number; leaves: number }[];
    leaves12m: number;
    rate12mPct: number;
  };
  leaveUtilization: { type: string; entitled: number; used: number; pct: number }[];
  overtime: { totalHours30d: number; top: { name: string; hours: number }[] };
  payroll: { totalGross: number; totalNet: number; byDepartment: { department: string; gross: number; net: number }[] };
  recognition: { monthly: { month: string; count: number }[]; topRecipients: { name: string; count: number }[] };
  hiring: { openings: number; funnel: { stage: string; count: number }[] };
}

export async function hrAnalytics(ctx: AuthContext): Promise<HrAnalytics | null> {
  if (!can(ctx.access, "analytics.view_company")) return null;
  const orgId = ctx.user.organizationId;

  const [byDept, byStatus, attritionMonthly, leaves12m, headcount, leaveUtil, overtimeRow, overtimeTop, payrollRow, payrollDept, recMonthly, recTop, openings, candidates] =
    await Promise.all([
      db.execute(sql`
        SELECT COALESCE(d.name, 'Unassigned') AS department, count(*)::int AS count
        FROM employees e
        JOIN users u ON u.id = e.user_id
        LEFT JOIN departments d ON d.id = e.department_id
        WHERE e.organization_id = ${orgId} AND u.status = 'active'
        GROUP BY d.name ORDER BY count DESC
      `),
      db.execute(sql`
        SELECT e.status, count(*)::int AS count
        FROM employees e JOIN users u ON u.id = e.user_id
        WHERE e.organization_id = ${orgId} AND u.status = 'active'
        GROUP BY e.status ORDER BY count DESC
      `),
      db.execute(sql`
        WITH months AS (
          SELECT generate_series(date_trunc('month', CURRENT_DATE) - interval '5 months',
                                 date_trunc('month', CURRENT_DATE), interval '1 month')::date AS m
        )
        SELECT to_char(months.m, 'Mon YY') AS month,
          (SELECT count(*) FROM employees WHERE organization_id = ${orgId}
             AND hired_at >= months.m AND hired_at < months.m + interval '1 month')::int AS joins,
          (SELECT count(*) FROM employees WHERE organization_id = ${orgId}
             AND left_at >= months.m AND left_at < months.m + interval '1 month')::int AS leaves
        FROM months ORDER BY months.m
      `),
      db.execute(sql`
        SELECT count(*)::int AS value FROM employees
        WHERE organization_id = ${orgId} AND left_at IS NOT NULL
          AND left_at >= CURRENT_DATE - interval '12 months'
      `),
      db.execute(sql`
        SELECT count(*)::int AS value FROM employees e JOIN users u ON u.id = e.user_id
        WHERE e.organization_id = ${orgId} AND u.status = 'active'
      `),
      db.execute(sql`
        SELECT lt.name AS type,
               COALESCE(sum(lb.entitled_days), 0)::float8 AS entitled,
               COALESCE(sum(lb.used_days), 0)::float8 AS used
        FROM leave_types lt
        LEFT JOIN leave_balances lb ON lb.leave_type_id = lt.id
          AND lb.year = EXTRACT(YEAR FROM CURRENT_DATE)::int
        WHERE lt.organization_id = ${orgId}
        GROUP BY lt.name ORDER BY used DESC
      `),
      db.execute(sql`
        SELECT COALESCE(sum(GREATEST(0, EXTRACT(EPOCH FROM (ar.clock_out - ar.clock_in)) / 3600 - st.working_hours::float8)), 0)::float8 AS value
        FROM attendance_records ar
        JOIN shift_types st ON st.id = ar.shift_type_id
        WHERE ar.organization_id = ${orgId} AND ar.clock_out IS NOT NULL
          AND ar.clock_in >= now() - interval '30 days'
      `),
      db.execute(sql`
        SELECT u.name, COALESCE(sum(GREATEST(0, EXTRACT(EPOCH FROM (ar.clock_out - ar.clock_in)) / 3600 - st.working_hours::float8)), 0)::float8 AS hours
        FROM attendance_records ar
        JOIN shift_types st ON st.id = ar.shift_type_id
        JOIN users u ON u.id = ar.user_id
        WHERE ar.organization_id = ${orgId} AND ar.clock_out IS NOT NULL
          AND ar.clock_in >= now() - interval '30 days'
        GROUP BY u.id, u.name ORDER BY hours DESC LIMIT 8
      `),
      db.execute(sql`
        SELECT COALESCE(sum(ps.gross::float8), 0)::float8 AS gross,
               COALESCE(sum(ps.net::float8), 0)::float8 AS net
        FROM payslips ps JOIN payroll_runs r ON r.id = ps.run_id
        WHERE ps.organization_id = ${orgId} AND r.status IN ('approved', 'paid')
          AND r.period_start >= date_trunc('year', CURRENT_DATE)::date
      `),
      db.execute(sql`
        SELECT COALESCE(d.name, 'Unassigned') AS department,
               COALESCE(sum(ps.gross::float8), 0)::float8 AS gross,
               COALESCE(sum(ps.net::float8), 0)::float8 AS net
        FROM payslips ps
        JOIN payroll_runs r ON r.id = ps.run_id
        JOIN employees e ON e.user_id = ps.employee_user_id AND e.organization_id = ${orgId}
        LEFT JOIN departments d ON d.id = e.department_id
        WHERE ps.organization_id = ${orgId} AND r.status IN ('approved', 'paid')
          AND r.period_start >= date_trunc('year', CURRENT_DATE)::date
        GROUP BY d.name ORDER BY net DESC
      `),
      db.execute(sql`
        WITH months AS (
          SELECT generate_series(date_trunc('month', CURRENT_DATE) - interval '5 months',
                                 date_trunc('month', CURRENT_DATE), interval '1 month')::date AS m
        )
        SELECT to_char(months.m, 'Mon YY') AS month,
          (SELECT count(*) FROM recognitions WHERE organization_id = ${orgId}
             AND created_at >= months.m AND created_at < months.m + interval '1 month')::int AS count
        FROM months ORDER BY months.m
      `),
      db.execute(sql`
        SELECT u.name, count(*)::int AS count
        FROM recognitions rc JOIN users u ON u.id = rc.to_user_id
        WHERE rc.organization_id = ${orgId} AND rc.created_at > now() - interval '6 months'
        GROUP BY u.id, u.name ORDER BY count DESC LIMIT 5
      `),
      db.execute(sql`
        SELECT count(*)::int AS value FROM job_openings
        WHERE organization_id = ${orgId} AND status = 'open'
      `),
      db.execute(sql`
        SELECT stage, count(*)::int AS count FROM candidates
        WHERE organization_id = ${orgId} GROUP BY stage ORDER BY count DESC
      `),
    ]);

  const leaveRows = leaveUtil.rows as { type: string; entitled: number; used: number }[];
  const pay = payrollRow.rows[0] as { gross: number; net: number };
  const hc = Number(headcount.rows[0]?.["value"] ?? 0);
  const lv12 = Number(leaves12m.rows[0]?.["value"] ?? 0);

  return {
    headcountByDepartment: byDept.rows as { department: string; count: number }[],
    headcountByStatus: byStatus.rows as { status: string; count: number }[],
    attrition: {
      monthly: attritionMonthly.rows as { month: string; joins: number; leaves: number }[],
      leaves12m: lv12,
      rate12mPct: hc === 0 ? 0 : Math.round((lv12 / hc) * 1000) / 10,
    },
    leaveUtilization: leaveRows.map((r) => {
      const entitled = Number(r.entitled);
      const used = Number(r.used);
      return { type: r.type, entitled, used, pct: entitled === 0 ? 0 : Math.round((used / entitled) * 1000) / 10 };
    }),
    overtime: {
      totalHours30d: Number(overtimeRow.rows[0]?.["value"] ?? 0),
      top: overtimeTop.rows as { name: string; hours: number }[],
    },
    payroll: {
      totalGross: Number(pay.gross),
      totalNet: Number(pay.net),
      byDepartment: payrollDept.rows as { department: string; gross: number; net: number }[],
    },
    recognition: {
      monthly: recMonthly.rows as { month: string; count: number }[],
      topRecipients: recTop.rows as { name: string; count: number }[],
    },
    hiring: {
      openings: Number(openings.rows[0]?.["value"] ?? 0),
      funnel: candidates.rows as { stage: string; count: number }[],
    },
  };
}

// ============================================================================
// Dashboard extras — pin-able metrics for manager/CEO dashboards
// ============================================================================

export async function dashboardExtras(ctx: AuthContext): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (can(ctx.access, "tickets.sla_view")) {
    const s = await supportAnalytics(ctx);
    if (s) {
      out.open_tickets = s.volume.open;
      out.sla_compliance_pct = s.sla.compliancePct;
      out.csat_avg = s.csat.avg;
    }
  }
  if (can(ctx.access, "analytics.view_company")) {
    const h = await hrAnalytics(ctx);
    if (h) {
      out.payroll_cost_ytd = Math.round(h.payroll.totalNet);
      out.attrition_12m_pct = h.attrition.rate12mPct;
    }
  }
  return out;
}