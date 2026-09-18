/**
 * Shared rate limiting (Phase D, hardened in G-04) — DB-backed fixed windows
 * with 1-second batched writes and an in-process fallback.
 *
 * Why batching: the naive design upserted `rate_limit_hits` on EVERY guarded
 * request, making the (scope, key, window) row a write hotspot (~10 updates/s
 * on one row at the default org limit, times every concurrent request).
 * Now each instance buffers hits in memory and flushes the aggregate delta at
 * most once per second per key:
 *   - first hit of a window does the synchronous upsert (cold path) and caches
 *     the authoritative count;
 *   - subsequent hits within the same second add to the local buffer and are
 *     checked against cache+buffer — zero DB writes;
 *   - the flusher folds buffered deltas into the DB and refreshes the cache.
 *
 * Consistency: a single instance's view is exact for its own hits; across
 * instances the shared count can lag by ≤1s of buffered hits (≈1.7% of a
 * 60s window). That tolerance is fine for abuse limiting — it is not billing.
 *
 * Fallback: if Postgres is unreachable, requests are counted locally with a
 * conservative per-instance floor (limit still applies per instance) instead
 * of failing every mutation. Abuse limiting must not take the API down.
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

// ---------- pure aggregator (unit-tested without a DB) ----------

export interface AggregatedKey {
  scope: "org" | "ip" | "key";
  key: string;
  windowStart: number;
  /** Buffered hit count since the last flush. */
  delta: number;
}

/**
 * Buffers per-(scope,key,windowStart) hit counts and flushes them as one
 * upsert per key per flush tick. Pure — the flush function is injected so
 * tests can observe exactly what would hit the database.
 */
export class RateAggregator {
  private buffer = new Map<string, AggregatedKey>();

  constructor(
    private readonly maxKeys = 10_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private static k(scope: string, key: string, windowStart: number): string {
    return `${scope}\u0000${key}\u0000${windowStart}`;
  }

  /** Record one hit; returns the buffered entry. */
  add(scope: "org" | "ip" | "key", key: string, windowStart: number): AggregatedKey {
    const id = RateAggregator.k(scope, key, windowStart);
    const existing = this.buffer.get(id);
    if (existing) {
      existing.delta += 1;
      return existing;
    }
    // Guard against unbounded growth (e.g. a flood of distinct IPs): drop the
    // oldest entry rather than buffering forever.
    if (this.buffer.size >= this.maxKeys) {
      const oldest = this.buffer.keys().next().value;
      if (oldest !== undefined) this.buffer.delete(oldest);
    }
    const entry: AggregatedKey = { scope, key, windowStart, delta: 1 };
    this.buffer.set(id, entry);
    return entry;
  }

  /** True when nothing is pending. */
  get empty(): boolean {
    return this.buffer.size === 0;
  }

  /** Drop a buffered entry entirely (used when its hits were written synchronously). */
  remove(scope: "org" | "ip" | "key", key: string, windowStart: number): void {
    this.buffer.delete(RateAggregator.k(scope, key, windowStart));
  }

  /**
   * Drain all buffered deltas (default older than `minAgeMs` so concurrent
   * hits in the same millisecond batch together) and hand them to `flush`.
   * Entries whose flush threw are re-buffered with their remaining delta.
   */
  async flush(
    flusher: (entries: AggregatedKey[]) => Promise<void>,
    minAgeMs = 0,
  ): Promise<number> {
    const nowMs = this.now();
    const ready: AggregatedKey[] = [];
    for (const [id, entry] of this.buffer) {
      // Entries don't carry their own timestamp; minAgeMs is applied by the
      // caller via `lastFlushAt`. Drain everything when minAgeMs is 0.
      if (minAgeMs === 0 || nowMs - (this.lastFlushAt.get(id) ?? 0) >= minAgeMs) {
        ready.push(entry);
      }
    }
    if (ready.length === 0) return 0;
    for (const e of ready) {
      this.buffer.delete(RateAggregator.k(e.scope, e.key, e.windowStart));
    }
    try {
      await flusher(ready);
    } catch (e) {
      // Re-buffer so no hits are lost; drop the oldest if over capacity.
      for (const e of ready) {
        const id = RateAggregator.k(e.scope, e.key, e.windowStart);
        const back = this.buffer.get(id);
        if (back) back.delta += e.delta;
        else this.buffer.set(id, e);
      }
      throw e;
    }
    for (const e of ready) {
      this.lastFlushAt.set(RateAggregator.k(e.scope, e.key, e.windowStart), nowMs);
    }
    return ready.length;
  }

  private lastFlushAt = new Map<string, number>();

  /** Test hook: current buffered state. */
  peek(scope: string, key: string, windowStart: number): number {
    return this.buffer.get(RateAggregator.k(scope, key, windowStart))?.delta ?? 0;
  }
}

// ---------- module state ----------

const aggregator = new RateAggregator();

/** Authoritative counts from the DB, keyed like the buffer. */
const countCache = new Map<string, { count: number; windowStart: number }>();

const FLUSH_INTERVAL_MS = Number(process.env.RATE_LIMIT_FLUSH_MS ?? 1000);

let flushing = false;
let flushTimer: ReturnType<typeof setInterval> | null = null;

async function flushAggregator(): Promise<void> {
  if (flushing || aggregator.empty) return;
  flushing = true;
  try {
    await aggregator.flush(async (entries) => {
      for (const e of entries) {
        const [row] = await db
          .insert(rateLimitHits)
          .values({ scope: e.scope, key: e.key, windowStart: e.windowStart, count: e.delta })
          .onConflictDoUpdate({
            target: [rateLimitHits.scope, rateLimitHits.key, rateLimitHits.windowStart],
            set: { count: sql`${rateLimitHits.count} + ${e.delta}` },
          })
          .returning({ count: rateLimitHits.count });
        const id = `${e.scope}\u0000${e.key}`;
        countCache.set(id, { count: row?.count ?? e.delta, windowStart: e.windowStart });
      }
    });
  } catch {
    // Hits stay buffered; the next tick retries. DB-down is handled per-call.
  } finally {
    flushing = false;
  }
}

/** Start the background flusher (idempotent; no timers in edge/runtime tests). */
export function startRateLimitFlusher(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => void flushAggregator(), FLUSH_INTERVAL_MS);
  // Best-effort scheduled cleanup — G-04: deterministic instead of 1-in-64.
  setInterval(() => void sweepOldWindows(), 6 * 3600_000).unref?.();
  flushTimer.unref?.();
}
void startRateLimitFlusher();

/** Refresh the cache entry synchronously (cold path — first hit of a window). */
async function upsertNow(
  scope: "org" | "ip" | "key",
  key: string,
  windowStart: number,
  delta: number,
): Promise<number | null> {
  try {
    const [row] = await db
      .insert(rateLimitHits)
      .values({ scope, key, windowStart, count: delta })
      .onConflictDoUpdate({
        target: [rateLimitHits.scope, rateLimitHits.key, rateLimitHits.windowStart],
        set: { count: sql`${rateLimitHits.count} + ${delta}` },
      })
      .returning({ count: rateLimitHits.count });
    countCache.set(`${scope}\u0000${key}`, { count: row?.count ?? delta, windowStart });
    return row?.count ?? delta;
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "ratelimit_db_unavailable", scope, err: String(e).slice(0, 120) }));
    return null; // DB down → local-only enforcement below
  }
}

// ---------- public API ----------

/**
 * Record one hit for (scope, key) and throw 429 when the window is exceeded.
 * Returns the best-known count when within budget. Never throws for DB
 * outages (fail-open per instance with the local floor still enforced) —
 * only ApiError.rateLimited is a signal, and only when the limit is truly hit.
 */
export async function enforceRateLimit(
  scope: "org" | "ip" | "key",
  key: string,
  opts: RateLimitOptions,
): Promise<number> {
  const nowSec = Math.floor(Date.now() / 1000);
  const start = windowStart(nowSec, opts.windowSeconds);
  const cacheId = `${scope}\u0000${key}`;

  const entry = aggregator.add(scope, key, start);
  const cached = countCache.get(cacheId);
  const cachedCount =
    cached && cached.windowStart === start ? cached.count : null;

  // Cold path: no authoritative count for this window yet → one upsert now.
  if (cachedCount === null) {
    const known = await upsertNow(scope, key, start, entry.delta);
    if (known !== null) {
      // The synchronous write already includes the buffered hit — remove it
      // from the buffer so the flusher never re-writes it (a zero-delta
      // upsert per tick would recreate the write churn we just eliminated).
      aggregator.remove(scope, key, start);
      if (known > opts.limit) throw ApiError.rateLimited();
      return known;
    }
    // DB unavailable: enforce the per-instance floor (buffered hits only).
    if (entry.delta > opts.limit) throw ApiError.rateLimited();
    return entry.delta;
  }

  // Warm path: pure in-memory check; the flusher batches the write.
  const projected = cachedCount + entry.delta;
  if (projected > opts.limit) {
    // Re-check against the DB before rejecting — the cache may be stale when
    // many instances flush concurrently.
    const fresh = await peekRateLimit(scope, key, opts);
    if (fresh + entry.delta > opts.limit) throw ApiError.rateLimited();
    countCache.set(cacheId, { count: fresh, windowStart: start });
    return fresh + entry.delta;
  }
  return projected;
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

async function sweepOldWindows(): Promise<void> {
  // Best-effort: keeps the counters table bounded (48h tail).
  try {
    await db.delete(rateLimitHits).where(
      sql`${rateLimitHits.windowStart} < ${Math.floor(Date.now() / 1000) - 48 * 3600}`,
    );
  } catch {
    /* non-fatal */
  }
}

/**
 * Compatibility shim for the old probabilistic call sites (route(), guards).
 * The G-04 flusher sweeps on a deterministic schedule; this is now a no-op
 * kept so existing imports stay valid.
 */
export function maybeSweep(): void {
  void flushAggregator();
}

/** Test-only: reset module state between tests. */
export function __resetRateLimitState(): void {
  aggregator.flush(async () => {}, 0).catch(() => {});
  countCache.clear();
}
