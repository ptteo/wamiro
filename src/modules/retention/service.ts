/**
 * Phase 4 — retention sweeps.
 *
 * Bounded cleanup of append-only / short-lived tables so they can't grow
 * without limit. Each sweep deletes at most BOUND rows per run; the jobs
 * worker re-runs on its interval, so big tables drain over multiple ticks.
 * All cutoffs are conservative — nothing user-facing is deleted early.
 */
import { appendFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { inArray, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import { auditLogs } from "@/db/schema";

const BOUND = 5000;
const DAY = 86_400_000;

export interface RetentionResult {
  deleted: Record<string, number>;
}

export async function runRetentionSweep(now: Date = new Date()): Promise<RetentionResult> {
  const deleted: Record<string, number> = {};

  // Notifications older than 12 months (in-app history; email copies are gone anyway).
  deleted.notifications = await boundedDelete(
    "notifications",
    sql`created_at < ${new Date(now.getTime() - 365 * DAY)}`,
  );

  // Dead session rows (expired > 30 days ago).
  deleted.sessions = await boundedDelete(
    "sessions",
    sql`expires_at < ${new Date(now.getTime() - 30 * DAY)}`,
  );

  // Password-reset tokens: used or expired, and older than 30 days.
  const tokenCutoff = new Date(now.getTime() - 30 * DAY);
  deleted.password_reset_tokens = await boundedDelete(
    "password_reset_tokens",
    sql`(used_at IS NOT NULL OR expires_at < ${tokenCutoff}) AND created_at < ${tokenCutoff}`,
  );

  // Invitation tokens: expired (or used) and older than 30 days — active
  // 7-day invites are never touched.
  deleted.invitation_tokens = await boundedDelete(
    "invitation_tokens",
    sql`(used_at IS NOT NULL OR expires_at < ${tokenCutoff}) AND created_at < ${tokenCutoff}`,
  );

  // Idempotency replay-protection rows: keep only a week.
  deleted.idempotency_keys = await boundedDelete(
    "idempotency_keys",
    sql`created_at < ${new Date(now.getTime() - 7 * DAY)}`,
  );

  // Rate-limit fixed windows (epoch-second window_start): keep a week.
  deleted.rate_limit_hits = await boundedDelete(
    "rate_limit_hits",
    sql`window_start < ${Math.floor((now.getTime() - 7 * DAY) / 1000)}`,
  );

  // Domain-event stream: 6 months is plenty for future automation replay.
  deleted.domain_events = await boundedDelete(
    "domain_events",
    sql`created_at < ${new Date(now.getTime() - 180 * DAY)}`,
  );

  // G-08 — webhook delivery history: a 31-day tail is plenty for debugging
  // (delivered + exhausted rows alike; pending rows are never pruned).
  deleted.webhook_deliveries = await boundedDelete(
    "webhook_deliveries",
    sql`status <> 'pending' AND created_at < ${new Date(now.getTime() - 31 * DAY)}`,
  );

  // Admin panel Phase A — usage rollups (platform schema): the plan fixes a
  // 3-year retention so this table can never become the next unbounded one.
  deleted["platform.tenant_usage_daily"] = await boundedDelete(
    "platform.tenant_usage_daily",
    sql`day < ${new Date(now.getTime() - 3 * 365 * DAY).toISOString().slice(0, 10)}`,
  );

  // G-02 — audit trail: archive rows past retention to monthly JSONL files,
  // THEN delete them from the hot table. Runs last so a failure here (disk
  // full, permissions) still lets the cheap sweeps above complete, while the
  // jobs ledger marks the run failed — retention problems must be loud.
  const auditR = await archiveAndDeleteAuditLogs(now);
  if (auditR.archived > 0) {
    deleted["audit_logs.archived"] = auditR.archived;
    deleted["audit_logs.deleted"] = auditR.deleted;
  }

  return { deleted };
}

// ---------- G-02: audit retention (archive-then-delete) ----------

/** One audit_logs row as archived (column names follow the SQL table). */
export interface AuditArchiveRow {
  id: number | string; // bigserial → pg returns int8 as string
  organization_id: string | null;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value: unknown;
  new_value: unknown;
  metadata: unknown;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  created_at: Date | string;
}

export interface AuditRetentionDeps {
  /** Rows past retention, oldest first. */
  selectExpired?: (cutoff: Date, bound: number) => Promise<AuditArchiveRow[]>;
  /** Durably store one month-partition of rows. Throw = abort before delete. */
  archive?: (monthKey: string, rows: AuditArchiveRow[]) => Promise<void>;
  /** Delete exactly these ids from audit_logs (returns rows deleted). */
  deleteIds?: (ids: number[]) => Promise<number>;
}

/** Retention floor: a misconfigured env must never nuke recent history. */
export const MIN_AUDIT_RETENTION_DAYS = 30;
/**
 * AUDIT_RETENTION_DAYS — 0/unset disables audit retention entirely (keep
 * everything; the table only bloats, it never loses rows). When set, a
 * 30-day floor applies. Read at call time so tests can toggle it.
 */
export function auditRetentionDays(): number {
  const raw = process.env.AUDIT_RETENTION_DAYS;
  if (raw === undefined || raw.trim() === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    console.log(JSON.stringify({ level: "warn", msg: "audit_retention_invalid", raw }));
    return 0;
  }
  return Math.max(MIN_AUDIT_RETENTION_DAYS, Math.floor(n));
}

const AUDIT_ARCHIVE_DIR = resolve(
  process.env.WAMIRO_DATA_DIR ?? join(process.cwd(), "data"),
  "audit-archive",
);

function monthKeyOf(d: Date | string): string {
  return (typeof d === "string" ? new Date(d) : d).toISOString().slice(0, 7); // YYYY-MM
}

/** Default select: oldest-first bounded scan — `id` order matches the PK index. */
async function defaultSelectExpired(cutoff: Date, bound: number): Promise<AuditArchiveRow[]> {
  const res = await db.execute(sql`
    SELECT id, organization_id, actor_user_id, action, entity_type, entity_id,
           old_value, new_value, metadata, ip, user_agent, request_id, created_at
    FROM audit_logs
    WHERE created_at < ${cutoff.toISOString()}
    ORDER BY id ASC
    LIMIT ${bound}
  `);
  return res.rows as unknown as AuditArchiveRow[];
}

/** Default archive: append JSONL to <WAMIRO_DATA_DIR>/audit-archive/audit-YYYY-MM.jsonl. */
async function defaultArchive(monthKey: string, rows: AuditArchiveRow[]): Promise<void> {
  await mkdir(AUDIT_ARCHIVE_DIR, { recursive: true });
  const file = join(AUDIT_ARCHIVE_DIR, `audit-${monthKey}.jsonl`);
  const body =
    rows
      .map((r) => JSON.stringify({ ...r, archivedAt: new Date().toISOString() }))
      .join("\n") + "\n";
  await appendFile(file, body, "utf8");
}

/** Default delete: explicit ids in chunks (exact — no ctid drift between statements). */
async function defaultDeleteIds(ids: number[]): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 1000) {
    const res = await db.delete(auditLogs).where(inArray(auditLogs.id, ids.slice(i, i + 1000)));
    deleted += Number(res.rowCount ?? 0);
  }
  return deleted;
}

/**
 * G-02 — move audit rows past retention into durable archive files, then
 * delete them from the hot table. Safety order is absolute: EVERY row is on
 * disk before the first delete runs; any archive failure aborts the whole
 * sweep with nothing deleted. Bounded at BOUND rows/run — the 12h sweep
 * drains a backlog over multiple ticks without long locks.
 *
 * Deps are injectable so tests exercise the ordering/guarantees without a DB.
 */
export async function archiveAndDeleteAuditLogs(
  now: Date = new Date(),
  deps: AuditRetentionDeps = {},
): Promise<{ archived: number; deleted: number; monthFiles: string[] }> {
  const days = auditRetentionDays();
  if (days <= 0) return { archived: 0, deleted: 0, monthFiles: [] }; // disabled

  const cutoff = new Date(now.getTime() - days * DAY);
  const rows = await (deps.selectExpired ?? defaultSelectExpired)(cutoff, BOUND);
  if (rows.length === 0) return { archived: 0, deleted: 0, monthFiles: [] };

  // Group into month partitions so operators can grep/zip/retire per month.
  const byMonth = new Map<string, AuditArchiveRow[]>();
  for (const r of rows) {
    const key = monthKeyOf(r.created_at);
    const group = byMonth.get(key);
    if (group) group.push(r);
    else byMonth.set(key, [r]);
  }

  const archive = deps.archive ?? defaultArchive;
  const monthFiles = [...byMonth.keys()];
  for (const [key, group] of byMonth) {
    await archive(key, group); // throw here = nothing deleted (fail-safe)
  }

  const ids = rows.map((r) => Number(r.id));
  const deleted = await (deps.deleteIds ?? defaultDeleteIds)(ids);
  return { archived: rows.length, deleted, monthFiles };
}

/**
 * DELETE … WHERE ctid IN (SELECT ctid … LIMIT BOUND) — bounded and works for
 * every table shape (idempotency_keys keys on `key`, rate_limit_hits has a
 * composite PK, the rest use `id`). ctid is stable within a single statement.
 */
async function boundedDelete(table: string, where: SQL): Promise<number> {
  const res = await db.execute(sql`
    DELETE FROM ${sql.raw(table)}
    WHERE ctid IN (SELECT ctid FROM ${sql.raw(table)} WHERE ${where} LIMIT ${BOUND})
  `);
  return Number(res.rowCount ?? 0);
}