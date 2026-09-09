/**
 * Phase 8 — documents depth: expiry reminder sweep (notify-once stamps on
 * `expiry_notified_at`), covering employee documents (passports, contracts)
 * and company documents with an `expires_at`.
 */
import { and, isNotNull, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { documents, employeeDocuments } from "@/db/schema";
import { notify } from "@/modules/notifications/service";

/** Horizon: remind when expiry is within 30 days (or already passed). */
const HORIZON_DAYS = 30;

/**
 * Daily sweep — notify-once semantics via the `expiry_notified_at` stamps, so
 * repeated or overlapping runs are harmless.
 */
export async function sweepDocumentExpiry(): Promise<{ employeeDocs: number; companyDocs: number }> {
  const horizon = new Date(Date.now() + HORIZON_DAYS * 86_400_000).toISOString().slice(0, 10);

  // Employee documents (passport, contract…): notify the holder, once.
  const expiring = await db
    .select({
      id: employeeDocuments.id,
      organizationId: employeeDocuments.organizationId,
      employeeUserId: employeeDocuments.employeeUserId,
      title: employeeDocuments.title,
      expiresAt: employeeDocuments.expiresAt,
    })
    .from(employeeDocuments)
    .where(
      and(
        isNull(employeeDocuments.expiryNotifiedAt),
        isNotNull(employeeDocuments.expiresAt),
        lte(employeeDocuments.expiresAt, horizon),
      ),
    )
    .limit(500);
  for (const d of expiring) {
    await db
      .update(employeeDocuments)
      .set({ expiryNotifiedAt: new Date() })
      .where(and(sql`${employeeDocuments.id} = ${d.id}`, isNull(employeeDocuments.expiryNotifiedAt)));
    if (!d.organizationId || !d.employeeUserId) continue;
    await notify({
      organizationId: d.organizationId,
      userId: d.employeeUserId,
      type: "documents.expiry",
      title: `Document expiring: ${d.title}`,
      body: `Expires ${d.expiresAt ?? "soon"}. Upload a renewed copy from Documents.`,
      link: "/documents",
    }).catch(() => {});
  }

  // Company documents: notify the uploader (admins), once.
  const expiringCompany = await db
    .select({
      id: documents.id,
      organizationId: documents.organizationId,
      uploadedBy: documents.uploadedBy,
      fileName: documents.fileName,
      expiresAt: documents.expiresAt,
    })
    .from(documents)
    .where(
      and(
        isNull(documents.expiryNotifiedAt),
        isNotNull(documents.expiresAt),
        lte(documents.expiresAt, horizon),
      ),
    )
    .limit(500);
  for (const d of expiringCompany) {
    await db
      .update(documents)
      .set({ expiryNotifiedAt: new Date() })
      .where(and(sql`${documents.id} = ${d.id}`, isNull(documents.expiryNotifiedAt)));
    if (!d.organizationId || !d.uploadedBy) continue;
    await notify({
      organizationId: d.organizationId,
      userId: d.uploadedBy,
      type: "documents.expiry",
      title: `Company document expiring: ${d.fileName}`,
      body: `Expires ${d.expiresAt ?? "soon"}. Replace it from Documents.`,
      link: "/documents",
    }).catch(() => {});
  }

  return { employeeDocs: expiring.length, companyDocs: expiringCompany.length };
}
