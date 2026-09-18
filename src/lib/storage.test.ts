import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

type StorageModule = typeof import("@/lib/storage");

let storage: StorageModule;
let tempRoot: string;

// Force the local-disk backend into a throwaway dir BEFORE importing the
// module (ROOT and the S3 config are read at module load / first access).
// Empty-string S3 vars block the .env loader from re-populating them.
test.before(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), "wamiro-storage-test-"));
  process.env.WAMIRO_DATA_DIR = tempRoot;
  process.env.S3_ENDPOINT = "";
  process.env.S3_BUCKET = "";
  process.env.S3_ACCESS_KEY_ID = "";
  process.env.S3_SECRET_ACCESS_KEY = "";
  storage = await import("@/lib/storage");
});

test("documentKey namespaces per tenant and sanitizes file names", () => {
  const k1 = storage.documentKey("org-a", "Report Q3 2026.pdf");
  const k2 = storage.documentKey("org-b", "Report Q3 2026.pdf");
  assert.ok(k1.startsWith("tenant/org-a/documents/"));
  assert.ok(k2.startsWith("tenant/org-b/documents/"));
  assert.notEqual(k1, k2, "keys must be unique (uuid suffix)");
  assert.ok(!/Report Q3/.test(k1), "spaces and uppercase are sanitized");
  assert.ok(/\.pdf$/.test(k1), "extension is preserved");
});

test("save/read/remove roundtrip on the local backend", async () => {
  const key = storage.documentKey("org-a", "hello.txt");
  await storage.saveObject(key, Buffer.from("hello world"));
  assert.equal((await storage.readObject(key)).toString(), "hello world");
  assert.equal(await storage.objectExists(key), true);
  await storage.removeObject(key);
  assert.equal(await storage.objectExists(key), false);
  await assert.rejects(() => storage.readObject(key), "read after delete throws");
});

test("listObjects + usageForOrg group bytes per category", async () => {
  const org = "org-usage";
  await storage.saveObject(`tenant/${org}/documents/a.pdf`, Buffer.alloc(100));
  await storage.saveObject(`tenant/${org}/documents/b.pdf`, Buffer.alloc(50));
  await storage.saveObject(`tenant/${org}/hr-documents/c.pdf`, Buffer.alloc(25));

  const all = await storage.listObjects(`tenant/${org}/`);
  assert.equal(all.length, 3);
  assert.equal(all.reduce((n, o) => n + o.sizeBytes, 0), 175);

  const usage = await storage.usageForOrg(org);
  assert.equal(usage.totalObjects, 3);
  assert.equal(usage.totalBytes, 175);
  assert.deepEqual(
    usage.byCategory.map((c) => [c.category, c.objectCount, c.sizeBytes]),
    [
      ["documents", 2, 150],
      ["hr-documents", 1, 25],
    ],
  );

  // prefix-scoped list
  const hrOnly = await storage.listObjects(`tenant/${org}/hr-documents/`);
  assert.equal(hrOnly.length, 1);
  assert.equal(hrOnly[0]!.key, `tenant/${org}/hr-documents/c.pdf`);
});

test("removeObjectsByPrefix deletes an entire tenant prefix", async () => {
  const org = "org-delete";
  await storage.saveObject(`tenant/${org}/documents/a.pdf`, Buffer.alloc(10));
  await storage.saveObject(`tenant/${org}/branding/logo.png`, Buffer.alloc(10));
  const removed = await storage.removeObjectsByPrefix(`tenant/${org}/`);
  assert.equal(removed, 2);
  assert.equal((await storage.usageForOrg(org)).totalObjects, 0);
  // removeObject on a missing key is a no-op (already-gone is fine)
  await storage.removeObject(`tenant/${org}/documents/a.pdf`);
});

test("G-22 — traversal keys that escape ROOT are rejected on every primitive", async () => {
  // Keys whose RESOLVED path escapes ROOT must throw (or be a no-op for the
  // soft primitives) — never touch disk outside ROOT. Keys that merely
  // contain `..` but resolve back inside ROOT are unusual but sandboxed, so
  // they are allowed (same semantics S3 gives odd-but-legal keys).
  const escapes = [
    "../outside.txt",
    "tenant/x/documents/../../../../outside.txt",
    "tenant/../../outside",
    "/etc/passwd",
  ];
  for (const key of escapes) {
    await assert.rejects(() => storage.saveObject(key, Buffer.from("x")), "saveObject must reject");
    await assert.rejects(() => storage.readObject(key), "readObject must reject");
    assert.throws(() => storage.resolveLocalKey(key), "resolveLocalKey must throw");
    // soft primitives: rejected keys are no-ops, not crashes
    assert.equal(await storage.objectExists(key), false);
    assert.deepEqual(await storage.listObjects(key), []);
    assert.equal(await storage.removeObjectsByPrefix(key), 0);
    await assert.rejects(() => storage.removeObject(key), "removeObject must reject bad keys");
  }
  // a `..` key that stays INSIDE the sandbox resolves fine
  const inside = storage.resolveLocalKey("tenant/a/../documents/x.pdf");
  assert.ok(resolve(inside).startsWith(resolve(tempRoot)), "sandboxed key stays inside ROOT");
  // and a normal key still round-trips
  const ok = storage.resolveLocalKey("tenant/org-a/documents/x.pdf");
  assert.ok(resolve(ok).startsWith(resolve(tempRoot)), "valid key stays inside ROOT");
});

test.after(async () => {
  await rm(tempRoot, { recursive: true, force: true });
  // sanity: the temp dir really is gone
  await assert.rejects(() => readFile(join(tempRoot, "tenant")), "temp root removed");
});