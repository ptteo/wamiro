import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * Storage adapter. v1 = local disk under WAMIRO_DATA_DIR (default ./data),
 * keys namespaced per tenant: tenant/{organizationId}/documents/{uuid}-{name}.
 *
 * ponytail: swap this file for an S3/MinIO implementation when the blueprint's
 * object-storage phase lands — callers only see save/read/remove by key.
 */

const ROOT = resolve(
  process.env.WAMIRO_DATA_DIR ?? join(process.cwd(), "data"),
);

export function documentKey(organizationId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  return `tenant/${organizationId}/documents/${randomUUID()}-${safe}`;
}

export async function saveObject(key: string, data: Buffer): Promise<void> {
  const target = join(ROOT, key);
  if (!target.startsWith(ROOT)) throw new Error("Invalid storage key"); // path traversal guard
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, data);
}

export async function readObject(key: string): Promise<Buffer> {
  const target = join(ROOT, key);
  if (!target.startsWith(ROOT)) throw new Error("Invalid storage key");
  return readFile(target);
}

export async function removeObject(key: string): Promise<void> {
  const target = join(ROOT, key);
  if (!target.startsWith(ROOT)) throw new Error("Invalid storage key");
  await unlink(target).catch(() => {}); // already gone is fine
}
