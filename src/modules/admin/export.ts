/**
 * Data export (blueprint §103): separate export permission, per-dataset
 * gating, and an audit row for every download. CSV only.
 */
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { AuthContext } from "@/lib/session";
import {
  attendanceRecords,
  auditLogs,
  departments,
  employees,
  leaveBalances,
  leaveRequests,
  leaveTypes,
  payrollRuns,
  payslips,
  tickets,
  users,
} from "@/db/schema";
import { can } from "@/modules/iam/engine";

export const DATASETS = [
  "employees",
  "attendance",
  "leave",
  "audit",
  "hr-headcount",
  "hr-attrition",
  "hr-leave",
  "hr-payroll",
  "support-tickets",
  "support-sla",
  "support-csat",
] as const;
export type Dataset = (typeof DATASETS)[number];

export function isDataset(v: string): v is Dataset {
  return (DATASETS as readonly string[]).includes(v);
}

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [
    headers.join(","),
    ...rows.map((r) => r.map(csvEscape).join(",")),
  ].join("\n");
}

const REQUIRED: Record<Dataset, string> = {
  employees: "employees.view",
  attendance: "attendance.view_company",
  leave: "leave.manage",
  audit: "audit.view",
  "hr-headcount": "analytics.view_company",
  "hr-attrition": "analytics.view_company",
  "hr-leave": "analytics.view_company",
  "hr-payroll": "analytics.view_company",
  "support-tickets": "tickets.sla_view",
  "support-sla": "tickets.sla_view",
  "support-csat": "tickets.sla_view",
};

export async function exportDataset(
  ctx: AuthContext,
  dataset: Dataset,
): Promise<{ csv: string; rows: number }> {
  if (!can(ctx.access, REQUIRED[dataset])) {
    throw new Error(`Missing permission: ${REQUIRED[dataset]}`);
  }
  const orgId = ctx.user.organizationId;

  let headers: string[];
  let rows: unknown[][];

  if (dataset === "employees") {
    const data = await db
      .select({
        name: users.name,
        email: users.email,
        jobTitle: employees.jobTitle,
        department: departments.name,
        employmentType: employees.employmentType,
        status: users.status,
        hiredAt: employees.hiredAt,
      })
      .from(users)
      .innerJoin(employees, eq(employees.userId, users.id))
      .leftJoin(departments, eq(departments.id, employees.departmentId))
      .where(eq(users.organizationId, orgId));
    headers = ["name", "email", "job_title", "department", "employment_type", "status", "hired_at"];
    rows = data.map((d) => [d.name, d.email, d.jobTitle, d.department, d.employmentType, d.status, d.hiredAt]);
  } else if (dataset === "attendance") {
    const data = await db
      .select({
        userName: users.name,
        clockIn: attendanceRecords.clockIn,
        clockOut: attendanceRecords.clockOut,
        source: attendanceRecords.source,
      })
      .from(attendanceRecords)
      .innerJoin(users, eq(users.id, attendanceRecords.userId))
      .where(eq(attendanceRecords.organizationId, orgId))
      .limit(10_000);
    headers = ["user", "clock_in", "clock_out", "source"];
    rows = data.map((d) => [d.userName, d.clockIn?.toISOString(), d.clockOut?.toISOString(), d.source]);
  } else if (dataset === "hr-headcount") {
    const data = await db
      .select({
        name: users.name,
        email: users.email,
        jobTitle: employees.jobTitle,
        department: departments.name,
        status: employees.status,
        hiredAt: employees.hiredAt,
        leftAt: employees.leftAt,
      })
      .from(users)
      .innerJoin(employees, eq(employees.userId, users.id))
      .leftJoin(departments, eq(departments.id, employees.departmentId))
      .where(eq(users.organizationId, orgId));
    headers = ["name", "email", "job_title", "department", "status", "hired_at", "left_at"];
    rows = data.map((d) => [d.name, d.email, d.jobTitle, d.department, d.status, d.hiredAt, d.leftAt]);
  } else if (dataset === "hr-attrition") {
    const data = await db.execute(sql`
      WITH months AS (
        SELECT generate_series(date_trunc('month', CURRENT_DATE) - interval '11 months',
                               date_trunc('month', CURRENT_DATE), interval '1 month')::date AS m
      )
      SELECT to_char(months.m, 'YYYY-MM') AS month,
        (SELECT count(*) FROM employees WHERE organization_id = ${orgId}
           AND hired_at >= months.m AND hired_at < months.m + interval '1 month')::int AS joins,
        (SELECT count(*) FROM employees WHERE organization_id = ${orgId}
           AND left_at >= months.m AND left_at < months.m + interval '1 month')::int AS leaves
      FROM months ORDER BY months.m
    `);
    headers = ["month", "joins", "leaves"];
    rows = (data.rows as unknown as { month: string; joins: number; leaves: number }[]).map((d) => [d.month, d.joins, d.leaves]);
  } else if (dataset === "hr-leave") {
    const data = await db
      .select({
        type: leaveTypes.name,
        entitled: leaveBalances.entitledDays,
        used: leaveBalances.usedDays,
      })
      .from(leaveTypes)
      .leftJoin(leaveBalances, sql`${leaveBalances.leaveTypeId} = ${leaveTypes.id} AND ${leaveBalances.year} = EXTRACT(YEAR FROM CURRENT_DATE)::int`)
      .where(eq(leaveTypes.organizationId, orgId))
      .orderBy(desc(leaveBalances.usedDays));
    headers = ["leave_type", "entitled_days", "used_days"];
    rows = data.map((d) => [d.type, d.entitled, d.used]);
  } else if (dataset === "hr-payroll") {
    const data = await db
      .select({
        department: departments.name,
        gross: payslips.gross,
        net: payslips.net,
      })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
      .innerJoin(employees, sql`${employees.userId} = ${payslips.employeeUserId} AND ${employees.organizationId} = ${orgId}`)
      .leftJoin(departments, eq(departments.id, employees.departmentId))
      .where(and(eq(payslips.organizationId, orgId), sql`${payrollRuns.status} IN ('approved','paid')`, sql`${payrollRuns.periodStart} >= date_trunc('year', CURRENT_DATE)::date`));
    headers = ["department", "gross", "net"];
    rows = data.map((d) => [d.department ?? "Unassigned", d.gross, d.net]);
  } else if (dataset === "support-tickets") {
    const data = await db
      .select({
        title: tickets.title,
        category: tickets.category,
        priority: tickets.priority,
        status: tickets.status,
        slaState: tickets.slaState,
        requester: users.name,
        createdAt: tickets.createdAt,
        resolvedAt: tickets.resolvedAt,
        csat: tickets.csatScore,
      })
      .from(tickets)
      .innerJoin(users, eq(users.id, tickets.requesterId))
      .where(eq(tickets.organizationId, orgId))
      .limit(50_000);
    headers = ["title", "category", "priority", "status", "sla_state", "requester", "created_at", "resolved_at", "csat_score"];
    rows = data.map((d) => [d.title, d.category, d.priority, d.status, d.slaState, d.requester, d.createdAt.toISOString(), d.resolvedAt?.toISOString() ?? "", d.csat ?? ""]);
  } else if (dataset === "support-sla") {
    const data = await db.execute(sql`
      SELECT priority,
             count(*) FILTER (WHERE resolved_at <= sla_due_date)::int AS met,
             count(*)::int AS due
      FROM tickets
      WHERE organization_id = ${orgId} AND status IN ('resolved','closed') AND sla_due_date IS NOT NULL
      GROUP BY priority ORDER BY due DESC
    `);
    headers = ["priority", "met", "due", "compliance_pct"];
    rows = (data.rows as unknown as { priority: string; met: number; due: number }[]).map((d) => {
      const due = Number(d.due);
      return [d.priority, d.met, due, due === 0 ? 0 : Math.round((Number(d.met) / due) * 1000) / 10];
    });
  } else if (dataset === "support-csat") {
    const data = await db.execute(sql`
      SELECT csat_score AS score, count(*)::int AS count
      FROM tickets WHERE organization_id = ${orgId} AND csat_score IS NOT NULL
      GROUP BY csat_score ORDER BY csat_score
    `);
    headers = ["score", "count"];
    rows = (data.rows as unknown as { score: number; count: number }[]).map((d) => [d.score, d.count]);
  } else if (dataset === "audit") {
    const data = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        actorName: users.name,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(eq(auditLogs.organizationId, orgId))
      .orderBy(desc(auditLogs.id))
      .limit(50_000);
    headers = ["id", "action", "entity_type", "entity_id", "actor", "created_at"];
    rows = data.map((d) => [d.id, d.action, d.entityType, d.entityId ?? "", d.actorName ?? "", d.createdAt.toISOString()]);
  } else {
    const data = await db
      .select({
        userName: users.name,
        type: leaveTypes.name,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
        days: leaveRequests.days,
        status: leaveRequests.status,
      })
      .from(leaveRequests)
      .innerJoin(users, eq(users.id, leaveRequests.userId))
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .where(and(eq(leaveRequests.organizationId, orgId), sql`true`))
      .limit(10_000);
    headers = ["user", "type", "start_date", "end_date", "days", "status"];
    rows = data.map((d) => [d.userName, d.type, d.startDate, d.endDate, d.days, d.status]);
  }

  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: "DATA_EXPORTED",
    entityType: "dataset",
    entityId: dataset,
    newValue: { rowCount: rows.length },
  });

  return { csv: toCsv(headers, rows), rows: rows.length };
}
