/**
 * Phase 4 — retention sweeps.
 *
 * Bounded cleanup of append-only / short-lived tables so they can't grow
 * without limit. Each sweep deletes at most BOUND rows per run; the jobs
 * worker re-runs on its interval, so big tables drain over multiple ticks.
 * All cutoffs are conservative — nothing user-facing is deleted early.
 */
import { sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db";

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

  // Admin panel Phase A — usage rollups (platform schema): the plan fixes a
  // 3-year retention so this table can never become the next unbounded one.
  deleted["platform.tenant_usage_daily"] = await boundedDelete(
    "platform.tenant_usage_daily",
    sql`day < ${new Date(now.getTime() - 3 * 365 * DAY).toISOString().slice(0, 10)}`,
  );

  return { deleted };
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