/**
 * Data export (blueprint §103): separate export permission, per-dataset
 * gating, and an audit row for every download. CSV only.
 */
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { AuthContext } from "@/lib/session";
import { attendanceRecords, auditLogs, departments, employees, leaveRequests, leaveTypes, users } from "@/db/schema";
import { can } from "@/modules/iam/engine";

export const DATASETS = ["employees", "attendance", "leave", "audit"] as const;
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
