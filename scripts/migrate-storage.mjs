/**
 * Phase 4 — one-time storage migration: local disk → S3/R2.
 *
 * Walks the local data root (WAMIRO_DATA_DIR, default ./data) and uploads
 * every object under tenant/… to the configured S3 bucket, preserving keys.
 *
 * Modes:
 *   node scripts/migrate-storage.mjs            copy local → S3 (idempotent)
 *   node scripts/migrate-storage.mjs --dry-run  report what WOULD be uploaded
 *   node scripts/migrate-storage.mjs --verify   confirm every local object exists in S3
 *   node scripts/migrate-storage.mjs --verify --missing-only   print missing keys
 *
 * Reads S3_ENDPOINT / S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY
 * from .env (or the environment). Exit code 0 = all objects present.
 */
import { readFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

// ---- env ---------------------------------------------------------------

function readEnv() {
  try {
    for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* .env optional */
  }
}

readEnv();

const ENDPOINT = process.env.S3_ENDPOINT?.trim();
const BUCKET = process.env.S3_BUCKET?.trim();
const ACCESS_KEY = process.env.S3_ACCESS_KEY_ID;
const SECRET = process.env.S3_SECRET_ACCESS_KEY;
const REGION = process.env.S3_REGION?.trim() || "auto";
const FORCE_PATH_STYLE = !["0", "false"].includes((process.env.S3_FORCE_PATH_STYLE ?? "").trim().toLowerCase());

if (!ENDPOINT || !BUCKET || !ACCESS_KEY || !SECRET) {
  console.error("S3_ENDPOINT / S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are required (.env or environment).");
  process.exit(1);
}

const dataRoot = resolve(process.env.WAMIRO_DATA_DIR ?? join(process.cwd(), "data"));
const dryRun = process.argv.includes("--dry-run");
const verify = process.argv.includes("--verify");
const missingOnly = process.argv.includes("--missing-only");

const client = new S3Client({
  endpoint: ENDPOINT,
  region: REGION,
  forcePathStyle: FORCE_PATH_STYLE,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET },
});

// ---- local walk --------------------------------------------------------

async function listLocal(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out; // missing data dir = nothing to migrate
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await listLocal(full)));
    } else {
      out.push(full);
    }
  }
  return out;
}

// ---- S3 helpers --------------------------------------------------------

async function headKey(key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

// ---- main --------------------------------------------------------------

const localFiles = (await listLocal(dataRoot))
  .map((f) => ({ abs: f, key: relative(dataRoot, f).replace(/\\/g, "/") }))
  .filter((f) => f.key.startsWith("tenant/"));

console.log(`data root: ${dataRoot}`);
console.log(`objects on local disk: ${localFiles.length}`);
console.log(`target: ${BUCKET} @ ${ENDPOINT} (${verify ? "verify" : dryRun ? "dry-run" : "copy"})`);

let uploaded = 0;
let already = 0;
let missing = 0;
let failed = 0;

for (const [i, f] of localFiles.entries()) {
  if (verify) {
    const ok = await headKey(f.key);
    if (ok) already += 1;
    else {
      missing += 1;
      if (!missingOnly) console.log(`  missing ${f.key}`);
      else console.log(f.key);
    }
  } else if (dryRun) {
    console.log(`  would upload ${f.key}`);
    uploaded += 1;
  } else {
    const exists = await headKey(f.key);
    if (exists) {
      already += 1;
    } else {
      const data = await readFileSync(f.abs);
      try {
        await client.send(
          new PutObjectCommand({ Bucket: BUCKET, Key: f.key, Body: data }),
        );
        uploaded += 1;
        if ((i + 1) % 50 === 0) console.log(`  … ${i + 1}/${localFiles.length}`);
      } catch (e) {
        failed += 1;
        console.error(`  FAILED ${f.key}: ${String(e).slice(0, 200)}`);
      }
    }
  }
}

console.log(
  verify
    ? `verify complete: present=${already} missing=${missing}`
    : `migration complete: uploaded=${uploaded} alreadyPresent=${already} failed=${failed}`,
);
process.exit(verify ? (missing === 0 ? 0 : 2) : failed === 0 ? 0 : 1);