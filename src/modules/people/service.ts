/**
 * People directory queries. EVERY query here filters by the caller's
 * organizationId — taken from the session, never from input.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db";
import { departments, employees, users } from "@/db/schema";
import type { AuthContext } from "@/lib/session";
import { can, widestScope } from "@/modules/iam/engine";

const managers = alias(users, "manager_user");

export interface DirectoryEntry {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  jobTitle: string | null;
  departmentId: string | null;
  departmentName: string | null;
  managerName: string | null;
  status: string;
}

/** Widest audience the viewer can see. Falls back to SELF. */
function directoryScope(ctx: AuthContext): "SELF" | "TEAM" | "COMPANY" {
  const s = widestScope(ctx.access, "employees.view");
  if (!s) return "SELF"; // no employees.view* at all → only self
  return s === "SELF" ? "SELF" : s === "TEAM" || s === "DEPARTMENT" ? "TEAM" : "COMPANY";
}

export interface DirectoryFilters {
  q?: string;
  departmentId?: string;
  status?: "active" | "invited" | "suspended";
}

export async function listDirectory(
  ctx: AuthContext,
  filters: DirectoryFilters = {},
): Promise<DirectoryEntry[]> {
  const orgId = ctx.user.organizationId;

  // D2 §12–13: immediate search across name/email/title, department filter
  const conditions = [eq(users.organizationId, orgId)];
  if (filters.status && ["active", "invited", "suspended"].includes(filters.status)) {
    conditions.push(sql`${users.status}::text = ${filters.status}`);
  }
  // When no status filter is given, all statuses are returned (the
  // filter chip UI defaults to "All"). Callers that want only-active
  // can pass status: "active" explicitly.
  if (filters.q) {
    const like = `%${filters.q.replace(/[%_\\]/g, "\\$&")}%`;
    conditions.push(
      sql`(${users.name} ILIKE ${like} OR ${users.email} ILIKE ${like} OR COALESCE(${employees.jobTitle}, '') ILIKE ${like})`,
    );
  }
  if (filters.departmentId) conditions.push(eq(employees.departmentId, filters.departmentId));
  const filterWhere = and(...conditions);

  if (directoryScope(ctx) === "COMPANY") {
    return db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        jobTitle: employees.jobTitle,
        departmentId: employees.departmentId,
        departmentName: departments.name,
        managerName: managers.name,
        status: users.status,
      })
      .from(users)
      .leftJoin(employees, eq(employees.userId, users.id))
      .leftJoin(departments, eq(departments.id, employees.departmentId))
      .leftJoin(managers, eq(managers.id, employees.managerUserId))
      .where(filterWhere)
      .orderBy(asc(users.name));
  }

  // TEAM scope: people who report to me (directly), plus me
  const teamConds = [eq(users.organizationId, orgId)];
  if (filters.status && ["active", "invited", "suspended"].includes(filters.status)) {
    teamConds.push(sql`${users.status}::text = ${filters.status}`);
  }
  if (filters.q) {
    const like = `%${filters.q.replace(/[%_\\]/g, "\\$&")}%`;
    teamConds.push(sql`(${users.name} ILIKE ${like} OR ${users.email} ILIKE ${like})`);
  }
  if (filters.departmentId) teamConds.push(eq(employees.departmentId, filters.departmentId));

  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      jobTitle: employees.jobTitle,
      departmentId: employees.departmentId,
      departmentName: departments.name,
      managerName: managers.name,
      status: users.status,
    })
    .from(users)
    .innerJoin(
      employees,
      and(
        eq(employees.userId, users.id),
        eq(employees.managerUserId, ctx.user.id),
      ),
    )
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .leftJoin(managers, eq(managers.id, employees.managerUserId))
    .where(and(...teamConds))
    .orderBy(asc(users.name));
}

/** D2 §23/§31: per-person records for the profile tabs. Permission-gated here. */
export async function employeeWorkspaceData(
  ctx: AuthContext,
  targetUserId: string,
): Promise<{
  canView: boolean;
  attendance: { clockIn: Date; clockOut: Date | null }[];
  leave: { typeName: string; startDate: string; endDate: string; status: string; days: string }[];
} | null> {
  const scope = widestScope(ctx.access, "employees.view");
  const companyWide = scope === "COMPANY" || scope === "GLOBAL";
  const isSelf = ctx.user.id === targetUserId;
  if (!companyWide && !isSelf) {
    if (!can(ctx.access, "attendance.view_team") && !can(ctx.access, "leave.view_team")) {
      return null;
    }
    if (!(await managesUser(ctx.user.id, targetUserId))) return null;
  }

  const [att, lv] = await Promise.all([
    db.execute(sql`
      SELECT clock_in AS "clockIn", clock_out AS "clockOut"
      FROM attendance_records
      WHERE user_id = ${targetUserId} AND organization_id = ${ctx.user.organizationId}
      ORDER BY clock_in DESC LIMIT 20
    `).then((r) => r.rows as unknown as { clockIn: string; clockOut: string | null }[]),
    db.execute(sql`
      SELECT lt.name AS "typeName", lr.start_date::text AS "startDate",
             lr.end_date::text AS "endDate", lr.status::text AS status,
             lr.days::text AS days
      FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
      WHERE lr.user_id = ${targetUserId} AND lr.organization_id = ${ctx.user.organizationId}
      ORDER BY lr.start_date DESC LIMIT 20
    `).then((r) => r.rows as unknown as {
      typeName: string;
      startDate: string;
      endDate: string;
      status: string;
      days: string;
    }[]),
  ]);

  void employees;
  return {
    canView: true,
    attendance: (att ?? []).map((a) => ({
      clockIn: new Date(a.clockIn),
      clockOut: a.clockOut ? new Date(a.clockOut) : null,
    })),
    leave: lv ?? [],
  };
}

export async function getMyProfile(ctx: AuthContext): Promise<{
  name: string;
  email: string;
  jobTitle: string | null;
  departmentName: string | null;
  managerName: string | null;
  hiredAt: string | null; // drizzle date columns arrive as strings
} | null> {
  const [row] = await db
    .select({
      name: users.name,
      email: users.email,
      jobTitle: employees.jobTitle,
      departmentName: departments.name,
      managerName: managers.name,
      hiredAt: employees.hiredAt,
    })
    .from(users)
    .leftJoin(employees, eq(employees.userId, users.id))
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .leftJoin(managers, eq(managers.id, employees.managerUserId))
    .where(and(eq(users.id, ctx.user.id), eq(users.organizationId, ctx.user.organizationId)))
    .limit(1);
  return row ?? null;
}

/** Does `viewer` directly manage `subject`? Used for TEAM-scope checks. */
export async function managesUser(viewerId: string, subjectId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: employees.userId })
    .from(employees)
    .where(and(eq(employees.managerUserId, viewerId), eq(employees.userId, subjectId)))
    .limit(1);
  return !!row;
}

export interface FullProfile {
  userId: string;
  name: string;
  email: string;
  status: string;
  avatarUrl: string | null;
  jobTitle: string | null;
  departmentId: string | null;
  departmentName: string | null;
  managerId: string | null;
  managerName: string | null;
  hiredAt: string | null; // date column arrives as string
}

/**
 * One person's full profile. Caller MUST authorize first (page layer checks
 * employees.view scope); this only guarantees org containment.
 */
export async function getProfileById(ctx: AuthContext, userId: string): Promise<FullProfile | null> {
  const [row] = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      status: users.status,
      avatarUrl: users.avatarUrl,
      jobTitle: employees.jobTitle,
      departmentId: employees.departmentId,
      departmentName: departments.name,
      managerId: managers.id,
      managerName: managers.name,
      hiredAt: employees.hiredAt,
    })
    .from(users)
    .leftJoin(employees, eq(employees.userId, users.id))
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .leftJoin(managers, eq(managers.id, employees.managerUserId))
    .where(and(eq(users.id, userId), eq(users.organizationId, ctx.user.organizationId)))
    .limit(1);
  return row ?? null;
}


/** Direct reports of a user (for profile page). */
export async function directReports(ctx: AuthContext, userId: string) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      jobTitle: employees.jobTitle,
      departmentName: departments.name,
    })
    .from(employees)
    .innerJoin(users, eq(users.id, employees.userId))
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .where(and(eq(employees.organizationId, ctx.user.organizationId), eq(employees.managerUserId, userId)))
    .orderBy(asc(users.name))
    .limit(50);
}