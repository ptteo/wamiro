/**
 * Shared rate limiting (Phase D) — DB-backed fixed windows.
 *
 * The old limiters (login, register) were in-memory Maps, which only work on
 * a single instance. `rate_limit_hits` moves the counters into Postgres so
 * limits hold across instances, and gives us per-tenant buckets for the
 * platform-grade `/api/v1` envelope.
 *
 * Cost: one upsert per guarded request (~1 ms locally). To keep that sane the
 * route wrapper only enforces on mutating methods, and cleanup runs
 * probabilistically.
 */
import { and, eq, sql } from "drizzle-orm";

import { db } from "./db";
import { ApiError } from "./errors";
import { rateLimitHits } from "@/db/schema";

export interface RateLimitOptions {
  /** Max allowed hits inside one window. */
  limit: number;
  /** Window size in seconds. */
  windowSeconds: number;
}

/** Fixed-window epoch start for `nowSec`. */
function windowStart(nowSec: number, windowSeconds: number): number {
  return Math.floor(nowSec / windowSeconds) * windowSeconds;
}

let cleanupCounter = 0;

async function sweepOldWindows(): Promise<void> {
  // Best-effort, rare: keeps the counters table bounded.
  try {
    await db.delete(rateLimitHits).where(
      sql`${rateLimitHits.windowStart} < ${Math.floor(Date.now() / 1000) - 48 * 3600}`,
    );
  } catch {
    /* non-fatal */
  }
}

/**
 * Record one hit for (scope, key) and throw 429 when the window is exceeded.
 * Returns the current count when within budget.
 */
export async function enforceRateLimit(
  scope: "org" | "ip" | "key",
  key: string,
  opts: RateLimitOptions,
): Promise<number> {
  const nowSec = Math.floor(Date.now() / 1000);
  const start = windowStart(nowSec, opts.windowSeconds);

  const [row] = await db
    .insert(rateLimitHits)
    .values({ scope, key, windowStart: start, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitHits.scope, rateLimitHits.key, rateLimitHits.windowStart],
      set: { count: sql`${rateLimitHits.count} + 1` },
    })
    .returning({ count: rateLimitHits.count });

  const count = row?.count ?? 1;
  if (count > opts.limit) throw ApiError.rateLimited();
  return count;
}

/** Read current usage without recording (for status UIs / tests). */
export async function peekRateLimit(
  scope: "org" | "ip" | "key",
  key: string,
  opts: RateLimitOptions,
): Promise<number> {
  const start = windowStart(Math.floor(Date.now() / 1000), opts.windowSeconds);
  const rows = await db
    .select({ count: rateLimitHits.count })
    .from(rateLimitHits)
    .where(and(eq(rateLimitHits.scope, scope), eq(rateLimitHits.key, key), eq(rateLimitHits.windowStart, start)));
  return rows[0]?.count ?? 0;
}

/** Fire a probabilistic sweep (call inside enforce on a slow-path basis). */
export function maybeSweep(): void {
  cleanupCounter += 1;
  if (cleanupCounter % 64 === 0) void sweepOldWindows();
}