/**
 * Push subscriptions + fan-out (Phase D).
 *
 * Subscriptions are stored per (org, user) — same tenancy rules as every
 * other table. `notify` (see notifications/service.ts) calls
 * `deliverPushNotifications` after the in-app row is written; dead endpoints
 * (404/410 from the push service) are pruned automatically.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { isPushConfigured, pushConfig, sendWebPush, type PushMessage } from "@/lib/push";
import { pushSubscriptions } from "@/db/schema";

export interface SubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

function validSubscription(input: SubscriptionInput): boolean {
  if (!input.endpoint.startsWith("https://") && !input.endpoint.startsWith("http://localhost")) return false;
  if (!/^[A-Za-z0-9_-]{60,}$/.test(input.p256dh)) return false;
  if (!/^[A-Za-z0-9_-]{16,32}$/.test(input.auth)) return false;
  return true;
}

/** Register (upsert) a push subscription for the signed-in user. */
export async function subscribe(
  ctx: AuthContext,
  input: SubscriptionInput,
  userAgent?: string | null,
): Promise<{ ok: boolean; count: number }> {
  if (!validSubscription(input)) {
    throw ApiError.badRequest("Subscription has an invalid shape (endpoint/p256dh/auth)");
  }
  // Same endpoint re-registered (e.g. after a service-worker update): move it
  // to this user instead of erroring. Unique constraint on endpoint.
  const [existing] = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, input.endpoint))
    .limit(1);

  if (existing) {
    const [row] = await db
      .update(pushSubscriptions)
      .set({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: userAgent ?? null,
        updatedAt: new Date(),
      })
      .where(eq(pushSubscriptions.id, existing.id))
      .returning({ id: pushSubscriptions.id });
    if (!row) throw ApiError.notFound();
  } else {
    await db.insert(pushSubscriptions).values({
      organizationId: ctx.user.organizationId,
      userId: ctx.user.id,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: userAgent ?? null,
    });
  }

  const count = await countFor(ctx);
  return { ok: true, count };
}

export async function unsubscribe(ctx: AuthContext, endpoint: string): Promise<{ ok: boolean }> {
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, endpoint),
        eq(pushSubscriptions.organizationId, ctx.user.organizationId),
        eq(pushSubscriptions.userId, ctx.user.id),
      ),
    );
  return { ok: true };
}

export async function countFor(ctx: AuthContext): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.organizationId, ctx.user.organizationId),
        eq(pushSubscriptions.userId, ctx.user.id),
      ),
    );
  return row?.count ?? 0;
}

export interface PushStatus {
  configured: boolean;
  publicKey: string | null;
  count: number;
}

/** For the settings UI: is push wired up, and how many devices is this user on? */
export async function status(ctx: AuthContext): Promise<PushStatus> {
  const configured = isPushConfigured();
  return {
    configured,
    publicKey: configured ? (pushConfig().publicKey ?? null) : null,
    count: await countFor(ctx),
  };
}

/** Fire the in-app notification to the user's push devices (best-effort). */
export async function deliverPushNotifications(input: {
  organizationId: string;
  userId: string;
  message: PushMessage;
}): Promise<void> {
  if (!isPushConfigured()) return;
  const subs = await db
    .select({
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.organizationId, input.organizationId),
        eq(pushSubscriptions.userId, input.userId),
      ),
    )
    .orderBy(desc(pushSubscriptions.createdAt));
  if (subs.length === 0) return;

  const remove: string[] = [];
  for (const sub of subs) {
    const result = await sendWebPush(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      input.message,
    );
    if (!result.ok && result.reason === "gone") remove.push(sub.endpoint);
    else if (!result.ok && result.reason === "http") {
      // 413 payload too large / 429 throttled: drop and continue
      if (result.status === 413 || result.status === 429) continue;
    }
  }
  if (remove.length > 0) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, remove));
  }
}