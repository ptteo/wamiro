/**
 * Phase 4 — orphaned-object sweep.
 *
 * Deletes stored objects whose DB row is gone (upload failed mid-way, row
 * deleted without the byte, etc.). Walks each tenant's prefix, collects the
 * known keys from the DB metadata tables, and removes anything else.
 *
 * Bounded per run (org count + object cap per org) so the daily job stays
 * predictable; tenants with a pending deletion request are skipped — the
 * deletion sweep purges them wholesale.
 */
import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { listObjects, removeObject } from "@/lib/storage";
import { hasLogoObject } from "@/modules/org/branding";
import { documents, employeeDocuments, organizations, ticketAttachments } from "@/db/schema";

const MAX_ORGS_PER_RUN = 200;
const MAX_OBJECTS_PER_ORG = 5000;

export async function sweepOrphanedObjects(): Promise<{
  orgsChecked: number;
  objectsChecked: number;
  removed: number;
}> {
  const tenants = await db
    .select({ id: organizations.id, logoUrl: organizations.logoUrl })
    .from(organizations)
    .where(sql`${organizations.slug} <> '__platform' AND ${organizations.deletionRequestedAt} IS NULL`)
    .limit(MAX_ORGS_PER_RUN);

  let objectsChecked = 0;
  let removed = 0;
  for (const org of tenants) {
    const orgId = org.id;
    const [docKeys, hrKeys, attKeys] = await Promise.all([
      db
        .select({ key: documents.storageKey })
        .from(documents)
        .where(eq(documents.organizationId, orgId)),
      db
        .select({ key: employeeDocuments.fileKey })
        .from(employeeDocuments)
        .where(eq(employeeDocuments.organizationId, orgId)),
      db
        .select({ key: ticketAttachments.fileKey })
        .from(ticketAttachments)
        .where(eq(ticketAttachments.organizationId, orgId)),
    ]);
    const known = new Set<string>([
      ...docKeys.map((r) => r.key),
      ...hrKeys.map((r) => r.key),
      ...attKeys.map((r) => r.key),
    ]);
    // Branding files are keyed by convention, not a DB row — treat them as
    // known only while the org advertises a logo.
    if (org.logoUrl && (await hasLogoObject(orgId))) {
      known.add(`tenant/${orgId}/branding/logo.png`);
      known.add(`tenant/${orgId}/branding/logo.jpg`);
      known.add(`tenant/${orgId}/branding/logo.webp`);
    }

    const objects = await listObjects(`tenant/${orgId}/`, { limit: MAX_OBJECTS_PER_ORG });
    objectsChecked += objects.length;
    for (const o of objects) {
      if (known.has(o.key)) continue;
      await removeObject(o.key).catch(() => {});
      removed += 1;
    }
  }
  return { orgsChecked: tenants.length, objectsChecked, removed };
}