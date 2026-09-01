/**
 * Idempotency replay (§51): clients send `Idempotency-Key` on retried POSTs;
 * the first response is stored and replayed for duplicates, so retries never
 * create duplicate side effects. Entries expire after 24h.
 */
import { and, eq, lt } from "drizzle-orm";

import { db } from "@/lib/db";
import { idempotencyKeys } from "@/db/schema";

const TTL_MS = 24 * 60 * 60 * 1000;

export interface StoredResponse {
  status: number;
  body: unknown;
}

/** Returns the stored response for a duplicate key, or null to proceed. */
export async function checkReplay(
  userId: string,
  key: string,
): Promise<StoredResponse | null> {
  const [row] = await db
    .select({ status: idempotencyKeys.responseStatus, body: idempotencyKeys.responseBody })
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.key, `${userId}:${key}`), eq(idempotencyKeys.userId, userId)))
    .limit(1);
  if (!row) return null;
  return { status: row.status, body: row.body };
}

export async function record(
  userId: string,
  key: string,
  response: StoredResponse,
): Promise<void> {
  await db
    .insert(idempotencyKeys)
    .values({
      key: `${userId}:${key}`,
      userId,
      responseStatus: response.status,
      responseBody: (response.body as object) ?? null,
    })
    .onConflictDoNothing();
}

/** Housekeeping: purge expired keys (call opportunistically from cron/health). */
export async function purgeExpired(): Promise<void> {
  await db.delete(idempotencyKeys).where(lt(idempotencyKeys.createdAt, new Date(Date.now() - TTL_MS)));
}
