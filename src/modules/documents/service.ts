import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import {
  documentKey,
  readObject,
  removeObject,
  saveObject,
} from "@/lib/storage";
import { documents, users, auditLogs } from "@/db/schema";
import { can } from "@/modules/iam/engine";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_UPLOAD_BYTES_API = 25 * 1024 * 1024; // matches API route cap

const BLOCKED_EXTENSIONS = [
  ".exe", ".bat", ".cmd", ".sh", ".ps1", ".msi", ".com", ".scr", ".dll",
];

export interface DocumentRow {
  id: string;
  category: string;
  /** Phase 8 — folder grouping label */
  folder: string;
  /** Phase 8 — stale-after date (drives expiry reminders) */
  expiresAt: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploaderName: string | null;
  uploaderAvatar: string | null;
  ownerUserId: string | null;
  uploadedBy: string | null;
  createdAt: Date;
  downloadCount: number;
  lastDownloadedAt: Date | null;
}

/** Company/policy docs for the whole org + personal docs owned by viewer. */
export async function listVisible(ctx: AuthContext): Promise<DocumentRow[]> {
  return db
    .select({
      id: documents.id,
      category: documents.category,
      folder: documents.folder,
      expiresAt: documents.expiresAt,
      fileName: documents.fileName,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      uploaderName: users.name,
      uploaderAvatar: users.avatarUrl,
      ownerUserId: documents.ownerUserId,
      uploadedBy: documents.uploadedBy,
      createdAt: documents.createdAt,
      downloadCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${auditLogs}
        WHERE ${auditLogs.entityType} = 'document'
          AND ${auditLogs.action} = 'DOCUMENT_DOWNLOADED'
          AND ${auditLogs.entityId} = ${documents.id}::text
      )`.as("download_count"),
      lastDownloadedAt: sql<Date | null>`(
        SELECT MAX(${auditLogs.createdAt}) FROM ${auditLogs}
        WHERE ${auditLogs.entityType} = 'document'
          AND ${auditLogs.action} = 'DOCUMENT_DOWNLOADED'
          AND ${auditLogs.entityId} = ${documents.id}::text
      )`.as("last_downloaded_at"),
    })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.uploadedBy))
    .where(
      and(
        eq(documents.organizationId, ctx.user.organizationId),
        or(
          isNull(documents.ownerUserId),
          eq(documents.ownerUserId, ctx.user.id),
        ),
      ),
    )
    .orderBy(desc(documents.createdAt))
    .limit(200);
}

export async function upload(
  ctx: AuthContext,
  file: { name: string; mimeType: string; data: Buffer },
  opts: { category?: string; ownerUserId?: string | null; folder?: string | null; expiresAt?: string | null },
) {
  if (!can(ctx.access, "documents.upload")) {
    throw ApiError.forbidden("Missing permission: documents.upload");
  }
  if (file.data.length === 0) throw ApiError.badRequest("Empty file");
  if (file.data.length > MAX_UPLOAD_BYTES) {
    throw ApiError.badRequest("File exceeds the 10 MB limit");
  }
  const lower = file.name.toLowerCase();
  if (BLOCKED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    throw ApiError.badRequest("This file type is not allowed");
  }

  const category = ["company", "policy", "personal"].includes(opts.category ?? "")
    ? (opts.category as string)
    : "company";
  let ownerUserId: string | null = null;
  if (category === "personal") {
    if (!opts.ownerUserId) throw ApiError.badRequest("Personal documents need an owner");
    ownerUserId = opts.ownerUserId;
    // owner must belong to this tenant
    const [owner] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, ownerUserId), eq(users.organizationId, ctx.user.organizationId)))
      .limit(1);
    if (!owner) throw ApiError.notFound("Owner not found in your organization");
  }

  const key = documentKey(ctx.user.organizationId, file.name);
  await saveObject(key, file.data);

  try {
    const inserted = await db
      .insert(documents)
      .values({
        organizationId: ctx.user.organizationId,
        uploadedBy: ctx.user.id,
        category,
        ownerUserId,
        folder: opts.folder?.trim().slice(0, 80) || "General",
        expiresAt: /^\d{4}-\d{2}-\d{2}$/.test(opts.expiresAt ?? "") ? opts.expiresAt! : null,
        fileName: file.name.slice(0, 255),
        mimeType: file.mimeType || "application/octet-stream",
        sizeBytes: file.data.length,
        storageKey: key,
      })
      .returning({ id: documents.id });
    const row = inserted[0];
    if (!row) throw new Error("Insert returned no row");

    await audit({
      organizationId: ctx.user.organizationId,
      actorUserId: ctx.user.id,
      action: "DOCUMENT_UPLOADED",
      entityType: "document",
      entityId: row.id,
      newValue: { fileName: file.name, category },
    });
    return row;
  } catch (e) {
    await removeObject(key); // don't orphan bytes if the DB write fails
    throw e;
  }
}

/** Authorization happens BEFORE any byte leaves storage. */
export async function getForDownload(ctx: AuthContext, documentId: string) {
  if (!can(ctx.access, "documents.view")) {
    throw ApiError.forbidden("Missing permission: documents.view");
  }
  const [row] = await db
    .select()
    .from(documents)
    .where(
      and(eq(documents.id, documentId), eq(documents.organizationId, ctx.user.organizationId)),
    )
    .limit(1);
  if (!row) throw ApiError.notFound();
  if (row.ownerUserId && row.ownerUserId !== ctx.user.id && row.uploadedBy !== ctx.user.id) {
    if (!can(ctx.access, "documents.manage")) {
      throw ApiError.forbidden(); // someone else's personal document
    }
  }

  const [uploader] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, row.uploadedBy))
    .limit(1);

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "DOCUMENT_DOWNLOADED",
    entityType: "document",
    entityId: row.id,
  });

  return {
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    uploaderName: uploader?.name ?? null,
    createdAt: row.createdAt,
    data: await readObject(row.storageKey),
  };
}

export async function remove(ctx: AuthContext, documentId: string) {
  const [row] = await db
    .select({ id: documents.id, uploadedBy: documents.uploadedBy, storageKey: documents.storageKey })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!row) throw ApiError.notFound();
  if (row.uploadedBy !== ctx.user.id && !can(ctx.access, "documents.manage")) {
    throw ApiError.forbidden("Only the uploader or an administrator can delete a document");
  }

  await db.delete(documents).where(eq(documents.id, documentId));
  await removeObject(row.storageKey);
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "DOCUMENT_DELETED",
    entityType: "document",
    entityId: documentId,
  });
}
