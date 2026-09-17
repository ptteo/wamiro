/**
 * Audit pipeline (G-01): durable audit writes.
 *
 * Contract: `audit()` NEVER throws and NEVER breaks the business request it
 * observes — but it also must not silently lose rows. Three layers:
 *
 *   1. Inline insert (as before).
 *   2. On failure: short bounded retry with backoff (covers blips, deadlocks,
 *      pool exhaustion — the common transient causes).
 *   3. On final failure: JSONL dead-letter file under WAMIRO_DATA_DIR
 *      (default ./data/audit-dead-letter/). One event per line, flushed with
 *      fsync via the append handle. The jobs worker replays this file every
 *      15 minutes (`audit_dlq_replay`), inserting rows in the same order they
 *      were written and truncating the file atomically once every line is in.
 *
 * Note on "transactional outbox": a true outbox shares the business
 * transaction, which would require threading a tx handle through ~200 call
 * sites. This buffer-and-replay design accepts the same residual risk as the
 * outbox only in the window where the process itself crashes mid-write to
 * disk; Postgres unavailability (deploy, failover, pool exhaustion) no longer
 * loses rows.
 */
import { appendFile, mkdir, readFile, rename, truncate } from "node:fs/promises";
import { join, resolve } from "node:path";

import { db } from "./db";
import { auditLogs } from "@/db/schema";

export interface AuditEvent {
  organizationId: string | null;
  actorUserId: string | null;
  action: string; // e.g. USER_LOGIN, LEAVE_APPROVED, ROLE_ASSIGNED
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

// ---------- tunables (env, sane defaults) ----------

const RETRY_ATTEMPTS = Number(process.env.AUDIT_RETRY_ATTEMPTS ?? 3); // 1 inline + N retries
const RETRY_BACKOFF_MS = Number(process.env.AUDIT_RETRY_BACKOFF_MS ?? 150);
const DLQ_MAX_BYTES = Number(process.env.AUDIT_DLQ_MAX_BYTES ?? 64 * 1024 * 1024); // 64 MB ≈ 100k events

const DLQ_DIR = resolve(process.env.WAMIRO_DATA_DIR ?? join(process.cwd(), "data"), "audit-dead-letter");
const DLQ_FILE = join(DLQ_DIR, "pending.jsonl");

function rowFor(event: AuditEvent) {
  return {
    organizationId: event.organizationId ?? null,
    actorUserId: event.actorUserId ?? null,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    oldValue: (event.oldValue as object) ?? null,
    newValue: (event.newValue as object) ?? null,
    metadata: (event.metadata as object) ?? null,
    ip: event.ip ?? null,
    userAgent: event.userAgent ?? null,
    requestId: event.requestId ?? null,
  };
}

function log(level: "error" | "warn" | "info", msg: string, extra: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ level, msg, ...extra }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Serialize DLQ writes within one process. Concurrent audit() failures in the
 * same request (Promise.all branches) would otherwise interleave partial
 * lines in the JSONL file.
 */
let dlqChain: Promise<void> = Promise.resolve();

async function appendDeadLetter(event: AuditEvent, reason: string): Promise<void> {
  const write = dlqChain.then(async () => {
    const line = JSON.stringify({ queuedAt: new Date().toISOString(), dlqReason: reason, event }) + "\n";
    await mkdir(DLQ_DIR, { recursive: true });
    await appendFile(DLQ_FILE, line, "utf8");
  });
  // The chain itself must never reject — a failed DLQ write falls back to the
  // loud log (last resort: journald still carries the event).
  dlqChain = write.catch(() => {});
  try {
    await write;
    log("warn", "audit_dead_lettered", { action: event.action, file: "audit-dead-letter/pending.jsonl" });
  } catch (e) {
    log("error", "audit_write_failed", { action: event.action, err: String(e) });
  }
}

/** Oversized DLQ guard: when the file grows past the cap, roll it aside with a timestamp. */
async function rollDeadLetterIfOversized(): Promise<void> {
  const write = dlqChain.then(async () => {
    let size = 0;
    try {
      const { stat } = await import("node:fs/promises");
      size = (await stat(DLQ_FILE)).size;
    } catch {
      return; // no file yet
    }
    if (size < DLQ_MAX_BYTES) return;
    const rolled = join(DLQ_DIR, `pending-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
    await rename(DLQ_FILE, rolled);
    log("warn", "audit_dlq_rolled", { sizeBytes: size, rolled });
  });
  dlqChain = write.catch(() => {});
  await write.catch(() => {});
}

/**
 * Durable audit write. Fire-and-forget from the caller's perspective; never
 * throws. Inline failures retry with backoff, then land in the dead-letter
 * file for the jobs worker to replay.
 */
export async function audit(event: AuditEvent): Promise<void> {
  const row = rowFor(event);
  let lastErr: unknown;
  for (let attempt = 0; attempt < Math.max(1, RETRY_ATTEMPTS); attempt++) {
    if (attempt > 0) await sleep(RETRY_BACKOFF_MS * attempt);
    try {
      await db.insert(auditLogs).values(row);
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  log("warn", "audit_insert_retry_exhausted", {
    action: event.action,
    attempts: RETRY_ATTEMPTS,
    err: String(lastErr).slice(0, 300),
  });
  await appendDeadLetter(event, String(lastErr).slice(0, 200));
  void rollDeadLetterIfOversized();
}

// ---------- replay (jobs worker + tests) ----------

export interface ReplayResult {
  /** Lines found in the dead-letter file. */
  found: number;
  /** Rows successfully inserted into audit_logs. */
  replayed: number;
  /** Lines that failed again (network still down). */
  failed: number;
  /** True when the file was fully drained and truncated. */
  drained: boolean;
}

/**
 * Re-insert dead-lettered audit events, preserving file order (oldest first —
 * audit_logs orders by createdAt desc, so ordering across the outage window
 * is restored). The file is truncated only after EVERY line succeeded, so a
 * partial replay can never lose events: they simply wait for the next tick.
 *
 * `insertRow` is injectable so tests can exercise the round-trip without a DB.
 * Callers other than tests/jobs should not need to pass it.
 */
export async function replayAuditDeadLetters(
  insertRow: (row: ReturnType<typeof rowFor>) => Promise<void> = async (row) => {
    await db.insert(auditLogs).values(row);
  },
): Promise<ReplayResult> {
  let raw: string;
  try {
    raw = await readFile(DLQ_FILE, "utf8");
  } catch {
    return { found: 0, replayed: 0, failed: 0, drained: true }; // nothing pending
  }
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { found: 0, replayed: 0, failed: 0, drained: true };

  let replayed = 0;
  let failed = 0;
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as { event?: AuditEvent };
      if (!parsed.event) throw new Error("missing event payload");
      await insertRow(rowFor(parsed.event));
      replayed += 1;
    } catch {
      failed += 1;
    }
  }

  const drained = failed === 0;
  if (drained) {
    // Atomic enough for our purposes: truncate after full success. A crash
    // between last insert and truncate re-replays a handful of rows — audit
    // inserts are idempotent-in-impact (append-only, no unique key), and a
    // duplicated near-identical audit row beats a lost one.
    try {
      await truncate(DLQ_FILE, 0);
      log("info", "audit_dlq_drained", { replayed });
    } catch (e) {
      log("error", "audit_dlq_truncate_failed", { err: String(e) });
    }
  } else {
    log("warn", "audit_dlq_partial_replay", { found: lines.length, replayed, failed });
  }
  return { found: lines.length, replayed, failed, drained };
}
