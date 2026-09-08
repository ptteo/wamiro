/**
 * Tenant-facing "My activity" — the signed-in user's own audit rows only.
 */
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { auditLogs } from "@/db/schema";
import type { AuthContext } from "@/lib/session";

const LABELS: Record<string, string> = {
  USER_LOGIN: "Signed in",
  USER_LOGOUT: "Signed out",
  LOGIN_FAILED: "Failed sign-in",
  MFA_ENABLED: "Turned on two-factor authentication",
  MFA_DISABLED: "Turned off two-factor authentication",
  MFA_FAILED: "Failed two-factor challenge",
  PASSWORD_CHANGED: "Changed password",
  PASSWORD_RESET: "Reset password",
  PASSWORD_CHANGE_REQUESTED: "Asked an admin to change your password",
  USER_INVITED: "Invited a teammate",
  LEAVE_REQUESTED: "Applied for leave",
  LEAVE_APPROVED: "Approved leave",
  LEAVE_REJECTED: "Rejected leave",
  LEAVE_WITHDRAWN: "Withdrew a leave request",
  TICKET_CREATED: "Opened a ticket",
  TICKET_REPLIED: "Replied to a ticket",
  REQUEST_CREATED: "Submitted a request",
  REQUEST_WITHDRAWN: "Withdrew a request",
  REQUEST_REJECTED: "Rejected a request",
  ATTENDANCE_CORRECTION_REQUESTED: "Requested an attendance correction",
  SESSION_REVOKED: "Signed out a device",
  SESSIONS_REVOKED_ALL: "Signed out all other devices",
};

export interface ActivityItem {
  id: number;
  action: string;
  label: string;
  createdAt: string;
}

export function activityLabel(action: string): string {
  return LABELS[action] ?? "Account activity";
}

export async function listMyActivity(ctx: AuthContext, limit = 100): Promise<ActivityItem[]> {
  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(
      and(eq(auditLogs.actorUserId, ctx.user.id), eq(auditLogs.organizationId, ctx.user.organizationId)),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(Math.min(limit, 100));

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    label: activityLabel(r.action),
    createdAt: r.createdAt.toISOString(),
  }));
}
