import { db } from "./db";
import { auditLogs } from "@/db/schema";

export interface AuditEvent {
  organizationId: string | null;
  actorUserId: string | null;
  action: string; // e.g. USER_LOGIN, LEAVE_APPROVED, ROLE_ASSIGNED
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/**
 * Fire-and-forget audit write. Auditing must never break the user-facing
 * request, but failures are logged loudly.
 */
export async function audit(event: AuditEvent): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      organizationId: event.organizationId,
      actorUserId: event.actorUserId,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      oldValue: (event.oldValue as object) ?? null,
      newValue: (event.newValue as object) ?? null,
      metadata: (event.metadata as object) ?? null,
      ip: event.ip ?? null,
      userAgent: event.userAgent ?? null,
      requestId: event.requestId ?? null,
    });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "audit_write_failed", action: event.action, err: String(e) }));
  }
}
