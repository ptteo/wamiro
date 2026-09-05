/**
 * Ticket attachments (F2.1) — files on tickets and replies, stored via the
 * storage adapter (`WAMIRO_DATA_DIR` / S3 seam) with tenant-prefixed keys.
 * Download authorization mirrors document isolation: cross-tenant or
 * unauthorized access is a 404, never a hint that the file exists.
 */
import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import { documentKey, readObject, removeObject, saveObject } from "@/lib/storage";
import type { AuthContext } from "@/lib/session";
import { ticketAttachments, tickets } from "@/db/schema";
import { can } from "@/modules/iam/engine";

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Requester/assignee (or any agent) may access a ticket's attachments. */
async function assertTicketAccess(ctx: AuthContext, ticketId: string): Promise<void> {
  const [t] = await db
    .select({ requesterId: tickets.requesterId, assigneeId: tickets.assigneeId })
    .from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!t) throw ApiError.notFound();
  const isAgent = can(ctx.access, "tickets.manage");
  if (!isAgent && t.requesterId !== ctx.user.id && t.assigneeId !== ctx.user.id) {
    throw ApiError.forbidden();
  }
}

export async function addAttachment(
  ctx: AuthContext,
  ticketId: string,
  input: { name: string; mimeType: string; data: Buffer },
): Promise<{ id: string }> {
  await assertTicketAccess(ctx, ticketId);
  return addAttachmentRecord(ctx.user.organizationId, ctx.user.id, ticketId, input);
}

/** Actor-parametrized core so system flows (email ingestion) can attach files. */
export async function addAttachmentRecord(
  orgId: string,
  actorUserId: string,
  ticketId: string,
  input: { name: string; mimeType: string; data: Buffer },
): Promise<{ id: string }> {
  if (input.data.byteLength > MAX_ATTACHMENT_BYTES) {
    throw ApiError.badRequest("File exceeds the 25 MB limit");
  }
  if (!input.name.trim()) throw ApiError.badRequest("File name required");
  const key = documentKey(orgId, input.name.trim());
  await saveObject(key, input.data);
  const inserted = await db
    .insert(ticketAttachments)
    .values({
      organizationId: orgId,
      ticketId,
      fileKey: key,
      fileName: input.name.trim().slice(0, 300),
      mimeType: input.mimeType?.slice(0, 120) || null,
      sizeBytes: input.data.byteLength,
      uploadedBy: actorUserId,
    })
    .returning({ id: ticketAttachments.id });
  await audit({
    organizationId: orgId,
    actorUserId,
    action: "TICKET_ATTACHMENT_ADDED",
    entityType: "ticket",
    entityId: ticketId,
    newValue: { fileName: input.name.trim() },
  });
  return inserted[0]!;
}

/** Attachment metadata visible to anyone who can view the ticket. */
export async function listForTicket(ctx: AuthContext, ticketId: string) {
  await assertTicketAccess(ctx, ticketId);
  return db
    .select({
      id: ticketAttachments.id,
      ticketId: ticketAttachments.ticketId,
      fileName: ticketAttachments.fileName,
      mimeType: ticketAttachments.mimeType,
      sizeBytes: ticketAttachments.sizeBytes,
      uploadedBy: ticketAttachments.uploadedBy,
      createdAt: ticketAttachments.createdAt,
    })
    .from(ticketAttachments)
    .where(eq(ticketAttachments.ticketId, ticketId))
    .orderBy(asc(ticketAttachments.createdAt));
}

/** Download: tenant-scoped + ticket-access enforced; anything else is 404. */
export async function getForDownload(ctx: AuthContext, attachmentId: string): Promise<{
  fileName: string;
  mimeType: string | null;
  data: Buffer;
}> {
  const [row] = await db
    .select({ a: ticketAttachments })
    .from(ticketAttachments)
    .where(and(eq(ticketAttachments.id, attachmentId), eq(ticketAttachments.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!row) throw ApiError.notFound();
  await assertTicketAccess(ctx, row.a.ticketId);
  const data = await readObject(row.a.fileKey).catch(() => {
    throw ApiError.notFound();
  });
  return { fileName: row.a.fileName, mimeType: row.a.mimeType, data };
}

/** Agents can remove an attachment (also removes the stored object). */
export async function removeAttachment(ctx: AuthContext, attachmentId: string): Promise<void> {
  if (!can(ctx.access, "tickets.manage")) throw ApiError.forbidden("Missing permission: tickets.manage");
  const [row] = await db
    .select({ a: ticketAttachments })
    .from(ticketAttachments)
    .where(and(eq(ticketAttachments.id, attachmentId), eq(ticketAttachments.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!row) throw ApiError.notFound();
  await db
    .delete(ticketAttachments)
    .where(and(eq(ticketAttachments.id, attachmentId), eq(ticketAttachments.organizationId, ctx.user.organizationId)));
  await removeObject(row.a.fileKey);
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "TICKET_ATTACHMENT_REMOVED",
    entityType: "ticket",
    entityId: row.a.ticketId,
    newValue: { fileName: row.a.fileName },
  });
}

/** Newest first — used by the detail panel. */
export async function listForTicketNewest(ctx: AuthContext, ticketId: string) {
  await assertTicketAccess(ctx, ticketId);
  return db
    .select({
      id: ticketAttachments.id,
      fileName: ticketAttachments.fileName,
      mimeType: ticketAttachments.mimeType,
      sizeBytes: ticketAttachments.sizeBytes,
      createdAt: ticketAttachments.createdAt,
    })
    .from(ticketAttachments)
    .where(eq(ticketAttachments.ticketId, ticketId))
    .orderBy(desc(ticketAttachments.createdAt));
}