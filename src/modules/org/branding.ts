/**
 * Tenant branding: logo upload/serving via the local-disk storage adapter.
 * Stored at tenant/{orgId}/branding/logo.{ext}; the DB records a stable
 * public URL (/api/v1/org/branding/logo) resolved to disk on demand.
 */
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { organizations } from "@/db/schema";

const VARIANTS = [
  { ext: ".png", mime: "image/png" },
  { ext: ".jpg", mime: "image/jpeg" },
  { ext: ".webp", mime: "image/webp" },
] as const;

function dataRoot(): string {
  return process.env.WAMIRO_DATA_DIR
    ? path.resolve(process.env.WAMIRO_DATA_DIR)
    : path.resolve(process.cwd(), "data");
}

function safeJoin(key: string): string {
  const target = path.join(dataRoot(), key);
  if (!target.startsWith(dataRoot())) throw new Error("Invalid storage key");
  return target;
}

export async function saveLogo(
  orgId: string,
  mime: string,
  data: Buffer,
): Promise<void> {
  const variant = VARIANTS.find((v) => v.mime === mime);
  if (!variant) throw new Error("unsupported logo format");
  const dir = safeJoin(`tenant/${orgId}/branding`);
  await mkdir(dir, { recursive: true });
  for (const v of VARIANTS) {
    if (v.ext !== variant.ext)
      await unlink(path.join(dir, `logo${v.ext}`)).catch(() => {});
  }
  await writeFile(path.join(dir, `logo${variant.ext}`), data);
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
      const data = await readFile(safeJoin(`tenant/${orgId}/branding/logo${v.ext}`));
      return { data, mime: v.mime };
    } catch {
      continue;
    }
  }
  return null;
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
    await unlink(safeJoin(`tenant/${orgId}/branding/logo${v.ext}`)).catch(() => {});
  }
  await db.update(organizations).set({ logoUrl: null }).where(eq(organizations.id, orgId));
}
