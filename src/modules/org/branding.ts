/**
 * Tenant branding: logo upload/serving via the storage adapter (S3 or local).
 * Stored at tenant/{orgId}/branding/logo.{ext}; the DB records a stable
 * public URL (/api/v1/org/branding/logo) resolved on demand.
 */
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { objectExists, readObject, removeObject, saveObject } from "@/lib/storage";
import { organizations } from "@/db/schema";

const VARIANTS = [
  { ext: ".png", mime: "image/png" },
  { ext: ".jpg", mime: "image/jpeg" },
  { ext: ".webp", mime: "image/webp" },
] as const;

function logoKey(orgId: string, ext: string): string {
  return `tenant/${orgId}/branding/logo${ext}`;
}

export async function saveLogo(
  orgId: string,
  mime: string,
  data: Buffer,
): Promise<void> {
  const variant = VARIANTS.find((v) => v.mime === mime);
  if (!variant) throw new Error("unsupported logo format");
  for (const v of VARIANTS) {
    if (v.ext !== variant.ext) {
      await removeObject(logoKey(orgId, v.ext)).catch(() => {});
    }
  }
  await saveObject(logoKey(orgId, variant.ext), data);
  // cache-busting version so browsers refetch after re-upload
  await db
    .update(organizations)
    .set({ logoUrl: `/api/v1/org/branding/logo?v=${Date.now()}` })
    .where(eq(organizations.id, orgId));
}

async function locate(
  orgId: string,
): Promise<{ data: Buffer; mime: string } | null> {
  for (const v of VARIANTS) {
    try {
      const data = await readObject(logoKey(orgId, v.ext));
      return { data, mime: v.mime };
    } catch {
      continue;
    }
  }
  return null;
}

export async function hasStoredLogo(orgId: string): Promise<boolean> {
  return (await locate(orgId)) !== null;
}

/** Cheap existence probe (avoids reading bytes) — used by the orphan sweep. */
export async function hasLogoObject(orgId: string): Promise<boolean> {
  for (const v of VARIANTS) {
    if (await objectExists(logoKey(orgId, v.ext))) return true;
  }
  return false;
}

export async function readLogo(
  orgId: string,
): Promise<{ data: Buffer; contentType: string } | null> {
  const found = await locate(orgId);
  if (!found) return null;
  return { data: found.data, contentType: found.mime };
}

export async function removeLogo(orgId: string): Promise<void> {
  for (const v of VARIANTS) {
    await removeObject(logoKey(orgId, v.ext)).catch(() => {});
  }
  await db.update(organizations).set({ logoUrl: null }).where(eq(organizations.id, orgId));
}