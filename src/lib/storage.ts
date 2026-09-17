/**
 * Storage adapter (Phase 4 — object storage).
 *
 * v2 = Cloudflare R2 / any S3-compatible endpoint when the S3_* env vars are
 * set; v1 local disk under WAMIRO_DATA_DIR (default ./data) remains the
 * fallback so dev, tests and self-hosted setups run without credentials.
 *
 * Keys are namespaced per tenant: tenant/{organizationId}/{category}/{uuid}-{name}.
 * Callers only ever see save/read/remove by key — swapping the backend never
 * touches a call site.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { env } from "./env";

const ROOT = resolve(
  process.env.WAMIRO_DATA_DIR ?? join(process.cwd(), "data"),
);

/**
 * G-22 — resolve a storage key to a local path and prove it stays inside
 * ROOT. The old `target.startsWith(ROOT)` guard fails on sibling prefixes
 * (e.g. ROOT=/data blocks nothing for /data-evil via crafted keys) and on
 * Windows' different separator normalization. `path.relative` from ROOT to
 * the RESOLVED target must not escape upward (start with `..`) and must not
 * be absolute — that covers `..`, mixed separators and encoded traversal
 * alike, on every platform.
 */
export function resolveLocalKey(key: string): string {
  const target = resolve(ROOT, key);
  const rel = relative(ROOT, target);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("Invalid storage key");
  }
  return target;
}

export function documentKey(organizationId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  return `tenant/${organizationId}/documents/${randomUUID()}-${safe}`;
}

// ---------- S3 (primary backend when configured) ----------

let cachedClient: S3Client | null = null;

interface S3Config {
  endpoint: string;
  bucket: string;
  region: string;
  forcePathStyle: boolean;
}

function s3Config(): S3Config | null {
  const endpoint = env.S3_ENDPOINT;
  const bucket = env.S3_BUCKET;
  const accessKeyId = env.S3_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint,
    bucket,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  };
}

function s3Client(): S3Client | null {
  const cfg = s3Config();
  if (!cfg) return null;
  if (!cachedClient) {
    cachedClient = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      forcePathStyle: cfg.forcePathStyle,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      },
    });
  }
  return cachedClient;
}

/** True when the S3_* vars are configured (stats/cleanup pages can say so). */
export function isObjectStorageConfigured(): boolean {
  return s3Config() !== null;
}

// ---------- primitives ----------

export async function saveObject(key: string, data: Buffer): Promise<void> {
  const client = s3Client();
  if (client) {
    await client.send(
      new PutObjectCommand({ Bucket: s3Config()!.bucket, Key: key, Body: data }),
    );
    return;
  }
  const target = resolveLocalKey(key);
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, data);
}

export async function readObject(key: string): Promise<Buffer> {
  const client = s3Client();
  if (client) {
    const res = await client.send(
      new GetObjectCommand({ Bucket: s3Config()!.bucket, Key: key }),
    );
    if (!res.Body) throw new Error("Empty object body");
    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) chunks.push(chunk);
    return Buffer.concat(chunks);
  }
  const target = resolveLocalKey(key);
  return readFile(target);
}

export async function removeObject(key: string): Promise<void> {
  const client = s3Client();
  if (client) {
    await client.send(
      new DeleteObjectCommand({ Bucket: s3Config()!.bucket, Key: key }),
    );
    return;
  }
  const target = resolveLocalKey(key);
  await unlink(target).catch(() => {}); // already gone is fine
}

export async function objectExists(key: string): Promise<boolean> {
  const client = s3Client();
  if (client) {
    try {
      await client.send(
        new HeadObjectCommand({ Bucket: s3Config()!.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }
  let target: string;
  try {
    target = resolveLocalKey(key);
  } catch {
    return false;
  }
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

// ---------- listing / stats / bulk removal (Phase 4) ----------

export interface StoredObject {
  key: string;
  sizeBytes: number;
  lastModified: Date | null;
}

/**
 * Every stored object under a prefix (keyset-paginated, bounded by `limit`).
 * Used by storage stats and the orphan sweep.
 */
export async function listObjects(
  prefix: string,
  opts: { limit?: number } = {},
): Promise<StoredObject[]> {
  const client = s3Client();
  const limit = opts.limit ?? Infinity;
  if (client) {
    const bucket = s3Config()!.bucket;
    const out: StoredObject[] = [];
    let token: string | undefined;
    do {
      const res = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: token,
          MaxKeys: Math.min(1000, limit - out.length),
        }),
      );
      for (const o of res.Contents ?? []) {
        if (o.Key === undefined) continue;
        out.push({ key: o.Key, sizeBytes: o.Size ?? 0, lastModified: o.LastModified ?? null });
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token && out.length < limit);
    return out;
  }
  let base: string;
  try {
    base = resolveLocalKey(prefix.endsWith("/") ? prefix.slice(0, -1) : prefix);
  } catch {
    return [];
  }
  // Windows join keeps a trailing separator — strip it so the slice below
  // doesn't eat the first character of the first child name.
  const baseKey = base.endsWith(sep) ? base.slice(0, -1) : base;
  const out: StoredObject[] = [];
  await walkLocal(base, baseKey.length + 1, prefix.replace(/\/$/, ""), out, limit);
  return out;
}

async function walkLocal(
  dir: string,
  baseLen: number,
  prefixKey: string,
  out: StoredObject[],
  limit: number,
): Promise<void> {
  if (out.length >= limit) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // missing dir = no objects
  }
  for (const e of entries) {
    if (out.length >= limit) return;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      await walkLocal(full, baseLen, prefixKey, out, limit);
    } else {
      const rel = full.slice(baseLen).replace(/\\/g, "/");
      out.push({ key: `${prefixKey}/${rel}`, sizeBytes: 0, lastModified: null });
      try {
        const st = await stat(full);
        out[out.length - 1]!.sizeBytes = st.size;
        out[out.length - 1]!.lastModified = st.mtime;
      } catch {
        // raced with a delete — drop the entry
        out.pop();
      }
    }
  }
}

/** Delete every object under a prefix (used by tenant deletion). Returns count. */
export async function removeObjectsByPrefix(prefix: string): Promise<number> {
  const client = s3Client();
  if (client) {
    const bucket = s3Config()!.bucket;
    let removed = 0;
    let token: string | undefined;
    do {
      const res = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: token,
          MaxKeys: 1000,
        }),
      );
      const keys = (res.Contents ?? [])
        .map((o) => o.Key)
        .filter((k): k is string => !!k);
      if (keys.length > 0) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })) },
          }),
        );
        removed += keys.length;
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return removed;
  }
  let base: string;
  try {
    base = resolveLocalKey(prefix.endsWith("/") ? prefix.slice(0, -1) : prefix);
  } catch {
    return 0;
  }
  return removeLocalTree(base);
}

async function removeLocalTree(dir: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let removed = 0;
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      removed += await removeLocalTree(full);
    } else {
      await unlink(full).catch(() => {});
      removed += 1;
    }
  }
  await rmdir(dir).catch(() => {});
  return removed;
}

// ---------- per-tenant usage ----------

export interface CategoryUsage {
  category: string;
  objectCount: number;
  sizeBytes: number;
}

export interface OrgUsage {
  totalBytes: number;
  totalObjects: number;
  byCategory: CategoryUsage[];
}

/**
 * Default object-listing cap for usage views (G-09). A 500k-object tenant
 * would otherwise time out the admin page and hammer S3 ListObjects; above
 * the cap the result is an honest under-count (`truncated: true`) instead of
 * an outage.
 */
export const USAGE_LIST_CAP = 10_000;

/**
 * Byte usage for one tenant, grouped by category (the 3rd path segment:
 * documents | hr-documents | branding | …). Listing is the source of truth —
 * it includes objects whose DB rows are gone (orphans show up as a real cost).
 * G-09: bounded at USAGE_LIST_CAP objects by default; when the cap is hit,
 * `truncated` is true and totals are an under-count (callers surface this).
 */
export async function usageForOrg(
  orgId: string,
  opts: { limit?: number } = {},
): Promise<OrgUsage & { truncated: boolean }> {
  const limit = opts.limit ?? USAGE_LIST_CAP;
  const objects = await listObjects(`tenant/${orgId}/`, { limit: limit + 1 });
  const truncated = objects.length > limit;
  if (truncated) objects.length = limit;
  const map = new Map<string, CategoryUsage>();
  let totalBytes = 0;
  for (const o of objects) {
    totalBytes += o.sizeBytes;
    const category = o.key.split("/")[2] ?? "other";
    const cur = map.get(category) ?? { category, objectCount: 0, sizeBytes: 0 };
    cur.objectCount += 1;
    cur.sizeBytes += o.sizeBytes;
    map.set(category, cur);
  }
  return {
    totalBytes,
    totalObjects: objects.length,
    byCategory: [...map.values()].sort((a, b) => b.sizeBytes - a.sizeBytes),
    truncated,
  };
}