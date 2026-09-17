import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

// The archive dir is resolved at module import from WAMIRO_DATA_DIR; point it
// at a temp dir before loading the module under test. Default deps (the SQL)
// are swapped for injectable fakes, so no database is needed.
let archiveAndDeleteAuditLogs: typeof import("./service.js").archiveAndDeleteAuditLogs | undefined;
let auditRetentionDays: typeof import("./service.js").auditRetentionDays | undefined;
let MIN_AUDIT_RETENTION_DAYS: typeof import("./service.js").MIN_AUDIT_RETENTION_DAYS | undefined;

const tmpRoots: string[] = [];
after(async () => {
  await Promise.all(tmpRoots.map((t) => rm(t, { recursive: true, force: true })));
});

/** Load the module with WAMIRO_DATA_DIR set to a fresh temp dir. */
let moduleTmp = "";
async function loadModule(): Promise<void> {
  if (archiveAndDeleteAuditLogs) return;
  moduleTmp = await mkdtemp(join(tmpdir(), "wamiro-audit-retention-"));
  tmpRoots.push(moduleTmp);
  process.env.WAMIRO_DATA_DIR = moduleTmp;
  const mod = await import("./service.js");
  archiveAndDeleteAuditLogs = mod.archiveAndDeleteAuditLogs;
  auditRetentionDays = mod.auditRetentionDays;
  MIN_AUDIT_RETENTION_DAYS = mod.MIN_AUDIT_RETENTION_DAYS;
}

/** Set/unset AUDIT_RETENTION_DAYS around a test. */
async function withRetention(days: string | null, fn: () => Promise<void>): Promise<void> {
  const original = process.env.AUDIT_RETENTION_DAYS;
  if (days === null) delete process.env.AUDIT_RETENTION_DAYS;
  else process.env.AUDIT_RETENTION_DAYS = days;
  try {
    await fn();
  } finally {
    if (original === undefined) delete process.env.AUDIT_RETENTION_DAYS;
    else process.env.AUDIT_RETENTION_DAYS = original;
  }
}

/** A row `daysOld` days old. */
function row(id: number, daysOld: number): import("./service.js").AuditArchiveRow {
  return {
    id,
    organization_id: "org-1",
    actor_user_id: "user-1",
    action: "USER_LOGIN",
    entity_type: "user",
    entity_id: "u-1",
    old_value: null,
    new_value: { ok: true },
    metadata: null,
    ip: "10.0.0.1",
    user_agent: "test-agent",
    request_id: null,
    created_at: new Date(Date.now() - daysOld * 86_400_000),
  };
}

test("archive-then-delete: archive runs BEFORE delete, delete receives every id", async () => {
  await loadModule();
  await withRetention("30", async () => {
    const calls: string[] = [];
    const result = await archiveAndDeleteAuditLogs!(new Date(), {
      selectExpired: async () => [row(1, 40), row(2, 41)],
      archive: async (monthKey) => {
        calls.push(`archive:${monthKey}`);
      },
      deleteIds: async (ids) => {
        calls.push(`delete:${ids.join(",")}`);
        return ids.length;
      },
    });
    const expectedMonth = new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 7);
    assert.deepEqual(calls, [`archive:${expectedMonth}`, "delete:1,2"]);
    assert.equal(result.archived, 2);
    assert.equal(result.deleted, 2);
  });
});

test("archive failure aborts before ANY delete (no data without a copy)", async () => {
  await loadModule();
  await withRetention("30", async () => {
    let deleteCalls = 0;
    await assert.rejects(
      () =>
        archiveAndDeleteAuditLogs!(new Date(), {
          selectExpired: async () => [row(1, 40)],
          archive: async () => {
            throw new Error("disk full");
          },
          deleteIds: async () => {
            deleteCalls += 1;
            return 1;
          },
        }),
      /disk full/,
    );
    assert.equal(deleteCalls, 0);
  });
});

test("AUDIT_RETENTION_DAYS unset/0 disables the sweep entirely", async () => {
  await loadModule();
  await withRetention(null, async () => {
    const result = await archiveAndDeleteAuditLogs!(new Date(), {
      selectExpired: async () => {
        throw new Error("must not be called when disabled");
      },
    });
    assert.deepEqual(result, { archived: 0, deleted: 0, monthFiles: [] });
  });
});

test("retention floor: AUDIT_RETENTION_DAYS=7 is clamped to 30", async () => {
  await loadModule();
  await withRetention("7", async () => {
    assert.equal(auditRetentionDays!(), MIN_AUDIT_RETENTION_DAYS!);
    assert.equal(MIN_AUDIT_RETENTION_DAYS!, 30);
  });
});

test("rows are grouped into one archive file per month", async () => {
  await loadModule();
  // The archive dir was resolved at import time from moduleTmp — same dir.
  const tmp = moduleTmp;
  await withRetention("30", async () => {
    const jan = new Date("2025-01-15T12:00:00.000Z");
    const feb = new Date("2025-02-03T12:00:00.000Z");
    const result = await archiveAndDeleteAuditLogs!(new Date(), {
      selectExpired: async () => [
        { ...row(1, 400), created_at: jan },
        { ...row(2, 401), created_at: jan },
        { ...row(3, 402), created_at: feb },
      ],
      deleteIds: async (ids) => ids.length,
    });
    assert.equal(result.archived, 3);
    assert.deepEqual(result.monthFiles.sort(), ["2025-01", "2025-02"]);

    const dir = join(tmp, "audit-archive");
    const files = (await readdir(dir)).sort();
    assert.deepEqual(files, ["audit-2025-01.jsonl", "audit-2025-02.jsonl"]);
    const janFile = await readFile(join(dir, "audit-2025-01.jsonl"), "utf8");
    const lines = janFile.split("\n").filter((l) => l.trim().length > 0);
    assert.equal(lines.length, 2);
    const first = JSON.parse(lines[0]!) as { id: number; action: string; archivedAt: string };
    assert.equal(first.id, 1);
    assert.equal(first.action, "USER_LOGIN");
    assert.ok(typeof first.archivedAt === "string");
  });
});
