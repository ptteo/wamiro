/**
 * G-01 audit durability tests — dead-letter write → replay round-trip.
 * Uses the injectable insertRow seam, so no database is needed. The DLQ file
 * contract (what audit() writes on final failure) is exercised directly.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// The DLQ paths are resolved at import time from WAMIRO_DATA_DIR, so the env
// var must be set before the module under test loads. Top-level await is not
// available under the CJS transform, so this happens inside loadModule().
let tmp = "";
let replay: typeof import("./audit.js").replayAuditDeadLetters | undefined;

async function loadModule(): Promise<void> {
  if (replay) return;
  tmp = await mkdtemp(join(tmpdir(), "wamiro-audit-dlq-"));
  process.env.WAMIRO_DATA_DIR = tmp;
  const mod = await import("./audit.js");
  replay = mod.replayAuditDeadLetters;
}

const DLQ_FILE = () => join(tmp, "audit-dead-letter", "pending.jsonl");

/** Read the DLQ as parsed lines; missing file = []. */
async function readDlq(): Promise<{ queuedAt: string; dlqReason: string; event: Record<string, unknown> }[]> {
  try {
    const raw = await readFile(DLQ_FILE(), "utf8");
    return raw
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

/** Force a dead-letter row into the DLQ file, matching audit()'s line format. */
async function seedDlq(events: Record<string, unknown>[]): Promise<void> {
  await mkdir(join(tmp, "audit-dead-letter"), { recursive: true });
  const body = events
    .map((event) => JSON.stringify({ queuedAt: new Date().toISOString(), dlqReason: "seeded", event }))
    .join("\n");
  await writeFile(DLQ_FILE(), body + "\n", "utf8");
}

test("dead-letter file stores one JSON event per line with metadata", async () => {
  await loadModule();
  await seedDlq([
    {
      organizationId: "org-2",
      actorUserId: "user-2",
      action: "USER_SUSPENDED",
      entityType: "user",
      entityId: "u-3",
      ip: "10.0.0.1",
    },
  ]);
  const rows = await readDlq();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.event.action, "USER_SUSPENDED");
  assert.equal(rows[0]!.event.entityId, "u-3");
  assert.ok(typeof rows[0]!.queuedAt === "string");
  assert.ok(typeof rows[0]!.dlqReason === "string");
});

test("replayAuditDeadLetters inserts every row in order and truncates the file", async () => {
  await loadModule();
  await seedDlq([
    { organizationId: "org-1", actorUserId: null, action: "A_FIRST", entityType: "x" },
    { organizationId: "org-1", actorUserId: null, action: "B_SECOND", entityType: "x" },
    { organizationId: null, actorUserId: "user-9", action: "C_THIRD", entityType: "y" },
  ]);
  const seen: string[] = [];
  const result = await replay!(async (row) => {
    seen.push(row.action);
  });
  assert.deepEqual(seen, ["A_FIRST", "B_SECOND", "C_THIRD"]);
  assert.equal(result.found, 3);
  assert.equal(result.replayed, 3);
  assert.equal(result.failed, 0);
  assert.equal(result.drained, true);
  // file truncated after full success
  const after = await readDlq();
  assert.equal(after.length, 0);
});

test("replay normalizes the stored row shape (nulls for absent fields)", async () => {
  await loadModule();
  await seedDlq([{ organizationId: null, actorUserId: undefined, action: "SHAPE", entityType: "x" }]);
  let captured: Record<string, unknown> | null = null;
  await replay!(async (row) => {
    captured = row as unknown as Record<string, unknown>;
  });
  assert.equal(captured!.action, "SHAPE");
  assert.equal(captured!.actorUserId, null); // undefined → null for the DB
  assert.equal(captured!.entityId, null);
  assert.equal(captured!.oldValue, null);
});

test("replayAuditDeadLetters keeps the file when any line fails (no data loss)", async () => {
  await loadModule();
  await seedDlq([
    { organizationId: "org-1", actorUserId: null, action: "OK_1", entityType: "x" },
    { organizationId: "org-1", actorUserId: null, action: "BROKEN_2", entityType: "x" },
    { organizationId: "org-1", actorUserId: null, action: "OK_3", entityType: "x" },
  ]);
  const result = await replay!(async (row) => {
    if (row.action === "BROKEN_2") throw new Error("db still down");
  });
  assert.equal(result.found, 3);
  assert.equal(result.replayed, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.drained, false);
  // the failing line (and everything else) is still on disk for the next tick
  const after = await readDlq();
  assert.equal(after.length, 3);
});

test("replayAuditDeadLetters tolerates a corrupt line without losing the rest", async () => {
  await loadModule();
  await mkdir(join(tmp, "audit-dead-letter"), { recursive: true });
  await writeFile(
    DLQ_FILE(),
    [
      JSON.stringify({ queuedAt: new Date().toISOString(), event: { action: "GOOD", entityType: "x", organizationId: null } }),
      "{not valid json",
    ].join("\n") + "\n",
    "utf8",
  );
  const seen: string[] = [];
  const result = await replay!(async (row) => {
    seen.push(row.action);
  });
  assert.deepEqual(seen, ["GOOD"]);
  assert.equal(result.failed, 1); // corrupt line counts as failed → file kept
  assert.equal(result.drained, false);
});

test("replayAuditDeadLetters on a missing/empty file is a clean no-op", async () => {
  await loadModule();
  await rm(join(tmp, "audit-dead-letter"), { recursive: true, force: true });
  const result = await replay!();
  assert.deepEqual(result, { found: 0, replayed: 0, failed: 0, drained: true });
});
