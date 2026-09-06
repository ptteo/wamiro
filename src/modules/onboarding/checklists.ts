import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/session";
import { can } from "@/modules/iam/engine";
import { attendanceRecords, employees, invitationTokens, leaveRequests } from "@/db/schema";

export interface RoleStep {
  key: string;
  label: string;
  href: string;
  done: boolean;
}

export interface RoleChecklist {
  role: "manager" | "employee";
  steps: RoleStep[];
  done: number;
  total: number;
}

export async function roleChecklists(ctx: AuthContext): Promise<RoleChecklist[]> {
  const out: RoleChecklist[] = [];
  if (can(ctx.access, "team.invite") || can(ctx.access, "leave.approve")) {
    out.push(await managerChecklist(ctx));
  }
  out.push(await employeeChecklist(ctx));
  return out.filter((c) => c.total > 0);
}

async function managerChecklist(ctx: AuthContext): Promise<RoleChecklist> {
  const orgId = ctx.user.organizationId;
  const [reports, invited, approved] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(employees)
      .where(and(eq(employees.organizationId, orgId), eq(employees.managerUserId, ctx.user.id))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(invitationTokens)
      .where(and(eq(invitationTokens.organizationId, orgId), eq(invitationTokens.invitedBy, ctx.user.id))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.organizationId, orgId),
          eq(leaveRequests.reviewedBy, ctx.user.id),
          eq(leaveRequests.status, "approved"),
        ),
      ),
  ]);
  const invitedCount = Number(reports[0]?.n ?? 0) + Number(invited[0]?.n ?? 0);
  const steps: RoleStep[] = [];
  if (can(ctx.access, "team.invite")) {
    steps.push({
      key: "invite3",
      label: "Invite 3 people onto your team",
      href: "/people",
      done: invitedCount >= 3,
    });
  }
  if (can(ctx.access, "leave.approve")) {
    steps.push({
      key: "approveLeave",
      label: "Approve a leave request",
      href: "/leave",
      done: Number(approved[0]?.n ?? 0) >= 1,
    });
  }
  return { role: "manager", steps, done: steps.filter((s) => s.done).length, total: steps.length };
}

async function employeeChecklist(ctx: AuthContext): Promise<RoleChecklist> {
  const [clocked, leave] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(attendanceRecords)
      .where(
        and(eq(attendanceRecords.organizationId, ctx.user.organizationId), eq(attendanceRecords.userId, ctx.user.id)),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.organizationId, ctx.user.organizationId), eq(leaveRequests.userId, ctx.user.id))),
  ]);
  const steps: RoleStep[] = [];
  if (can(ctx.access, "attendance.view_self")) {
    steps.push({
      key: "clockIn",
      label: "Clock in for the first time",
      href: "/attendance",
      done: Number(clocked[0]?.n ?? 0) >= 1,
    });
  }
  if (can(ctx.access, "leave.apply")) {
    steps.push({
      key: "applyLeave",
      label: "Apply for leave",
      href: "/leave",
      done: Number(leave[0]?.n ?? 0) >= 1,
    });
  }
  return { role: "employee", steps, done: steps.filter((s) => s.done).length, total: steps.length };
}
