import { and, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db, first } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { saveObject, readObject, removeObject } from "@/lib/storage";
import type { AuthContext } from "@/lib/session";
import { notify } from "@/modules/notifications/service";
import { employeeDocuments, users } from "@/db/schema";
import { can } from "@/modules/iam/engine";
import { hrDocLabel, isHrDocType } from "@/lib/hr-doc";

/**
 * F3.3 — Employee HR documents.
 *
 * Typed, per-employee records (offer letter, contract, ID proof, …) with
 * optional expiry, stored through the storage adapter. The owning employee
 * can always read their own files; anyone with `employees.edit` (HR admins /
 * administrators) can upload, manage and download any employee's documents.
 * An expiry sweep notifies owners before a document lapses.
 */

async function canManage(ctx: AuthContext): Promise<boolean> {
  return can(ctx.access, "employees.edit") || can(ctx.access, "documents.manage");
}

function keyFor(orgId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  return `tenant/${orgId}/hr-documents/${randomUUID()}-${safe}`;
}

export interface DocRow {
  id: string;
  employeeUserId: string;
  employeeName: string;
  docType: string;
  title: string;
  mimeType: string | null;
  sizeBytes: number;
  expiresAt: string | null;
  uploadedByName: string | null;
  createdAt: Date;
}

/** Seconds until an expiry (positive) — the sweep only notifies once per doc. */
const SWEEP_LOOKAHEAD_DAYS = 30;

/**
 * Documents the viewer may see: everyone sees their own; employees.edit
 * holders see the whole org (optionally filtered to one employee).
 * Runs the expiry sweep opportunistically for managers so notifications
 * fire when HR opens the page (mirrors the SLA sweep on the SLA page).
 */
export async function listDocs(
  ctx: AuthContext,
  opts: { employeeUserId?: string } = {},
): Promise<{ docs: DocRow[]; canManageAll: boolean }> {
  const orgId = ctx.user.organizationId;
  const manage = await canManage(ctx);
  const rows = await db
    .select({
      id: employeeDocuments.id,
      employeeUserId: employeeDocuments.employeeUserId,
      employeeName: users.name,
      docType: employeeDocuments.docType,
      title: employeeDocuments.title,
      mimeType: employeeDocuments.mimeType,
      sizeBytes: employeeDocuments.sizeBytes,
      expiresAt: employeeDocuments.expiresAt,
      uploadedByName: sql<string | null>`(SELECT name FROM users WHERE id = ${employeeDocuments.uploadedBy})`,
      createdAt: employeeDocuments.createdAt,
    })
    .from(employeeDocuments)
    .innerJoin(users, eq(users.id, employeeDocuments.employeeUserId))
    .where(
      and(
        eq(employeeDocuments.organizationId, orgId),
        manage
          ? opts.employeeUserId
            ? eq(employeeDocuments.employeeUserId, opts.employeeUserId)
            : undefined
          : eq(employeeDocuments.employeeUserId, ctx.user.id),
      ),
    )
    .orderBy(desc(employeeDocuments.createdAt))
    .limit(500);
  if (manage) {
    void sweepDocumentExpiries(orgId);
  }
  return { docs: rows, canManageAll: manage };
}

export interface UploadInput {
  employeeUserId: string;
  docType: string;
  title: string;
  expiresAt?: string | null;
  mimeType?: string;
  fileName: string;
  data: Buffer;
}

/** Upload is allowed for employees.edit holders, or an employee adding their own file. */
export async function upload(ctx: AuthContext, input: UploadInput) {
  const orgId = ctx.user.organizationId;
  const isSelf = input.employeeUserId === ctx.user.id;
  const manage = await canManage(ctx);
  if (!manage && !isSelf) throw ApiError.forbidden("Missing permission: employees.edit");

  if (!input.employeeUserId || !input.fileName) throw ApiError.badRequest("Employee and file are required");
  // the target employee must belong to this tenant (guards cross-tenant writes)
  const [member] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.organizationId, orgId), eq(users.id, input.employeeUserId)))
    .limit(1);
  if (!member) throw ApiError.notFound("Employee not found in this organization");
  if (!isHrDocType(input.docType)) throw ApiError.badRequest("Unknown document type");
  const title = input.title.trim();
  if (!title) throw ApiError.badRequest("A title is required");
  if (title.length > 200) throw ApiError.badRequest("Title too long");
  if (input.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(input.expiresAt)) {
    throw ApiError.badRequest("expiresAt must be YYYY-MM-DD");
  }
  const MAX_BYTES = 25 * 1024 * 1024;
  if (input.data.length > MAX_BYTES) throw ApiError.badRequest("File exceeds the 25 MB limit");

  const key = keyFor(orgId, input.fileName);
  await saveObject(key, input.data);

  const row = first(
    await db
      .insert(employeeDocuments)
      .values({
        organizationId: orgId,
        employeeUserId: input.employeeUserId,
        docType: input.docType,
        title,
        fileKey: key,
        mimeType: input.mimeType ?? null,
        sizeBytes: input.data.length,
        expiresAt: input.expiresAt ?? null,
        uploadedBy: ctx.user.id,
      })
      .returning(),
  );

  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: "HR_DOCUMENT_UPLOADED",
    entityType: "employee_document",
    entityId: row.id,
    newValue: {
      employeeUserId: input.employeeUserId,
      docType: input.docType,
      title,
      expiresAt: input.expiresAt ?? null,
    },
  });

  if (!isSelf) {
    await notify({
      organizationId: orgId,
      userId: input.employeeUserId,
      type: "document",
      title: "A new HR document was added to your file",
      body: `${title} (${hrDocLabel(input.docType)})`,
      link: "/people/documents",
    });
  }
  return row;
}

export async function getOwned(
  ctx: AuthContext,
  docId: string,
): Promise<{ row: (typeof employeeDocuments.$inferSelect) & { fileKey: string } }> {
  const orgId = ctx.user.organizationId;
  const manage = await canManage(ctx);
  const rows = await db
    .select()
    .from(employeeDocuments)
    .where(and(eq(employeeDocuments.id, docId), eq(employeeDocuments.organizationId, orgId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw ApiError.notFound();
  if (!manage && row.employeeUserId !== ctx.user.id) {
    throw ApiError.forbidden("You can only access your own documents");
  }
  return { row };
}

export async function download(ctx: AuthContext, docId: string): Promise<{ buffer: Buffer; fileName: string; mimeType: string | null }> {
  const { row } = await getOwned(ctx, docId);
  const buffer = await readObject(row.fileKey);
  const original = row.fileKey.split("-").slice(1).join("-");
  return { buffer, fileName: original || "document", mimeType: row.mimeType };
}

export async function remove(ctx: AuthContext, docId: string) {
  const { row } = await getOwned(ctx, docId);
  const manage = await canManage(ctx);
  if (!manage && row.employeeUserId !== ctx.user.id) {
    throw ApiError.forbidden("You can only delete your own documents");
  }
  await removeObject(row.fileKey).catch(() => {});
  await db.delete(employeeDocuments).where(eq(employeeDocuments.id, docId));
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "HR_DOCUMENT_DELETED",
    entityType: "employee_document",
    entityId: docId,
    oldValue: { title: row.title, docType: row.docType },
  });
}

/**
 * One-time notification per expiring document (lookahead 30 days). It is
 * idempotent: documents whose owners were already told this month are skipped.
 */
export async function sweepDocumentExpiries(orgId: string): Promise<number> {
  const now = new Date();
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + SWEEP_LOOKAHEAD_DAYS);
  const todayIso = now.toISOString().slice(0, 10);
  const horizonIso = horizon.toISOString().slice(0, 10);

  const rows = await db
    .select({
      id: employeeDocuments.id,
      employeeUserId: employeeDocuments.employeeUserId,
      title: employeeDocuments.title,
      docType: employeeDocuments.docType,
      expiresAt: employeeDocuments.expiresAt,
    })
    .from(employeeDocuments)
    .where(
      and(
        eq(employeeDocuments.organizationId, orgId),
        isNotNull(employeeDocuments.expiresAt),
        gte(employeeDocuments.expiresAt, todayIso),
        lte(employeeDocuments.expiresAt, horizonIso),
      ),
    );
  let notified = 0;
  for (const row of rows) {
    const expiry = String(row.expiresAt);
    // One notification per doc + expiry window — skip when we already told them.
    const already = await db.execute(sql`
      SELECT 1 FROM notifications
      WHERE organization_id = ${orgId}
        AND user_id = ${row.employeeUserId}
        AND type = 'hr_doc.expiry'
        AND body LIKE ${`%${row.id}%`}
      LIMIT 1
    `);
    if (already.rows?.length) continue;
    await notify({
      organizationId: orgId,
      userId: row.employeeUserId,
      type: "hr_doc.expiry",
      title: `Your ${hrDocLabel(row.docType)} expires soon`,
      body: `${row.title} expires on ${expiry}`,
      link: "/people/documents",
    });
    notified += 1;
  }
  return notified;
}

