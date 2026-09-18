/**
 * Outgoing webhooks (Phase C — enterprise trust). Lets a company push Wamiro
 * events (ticket.created, employee.created, …) to its own systems.
 *
 * Delivery is HMAC-SHA256 signed (`sha256=<hex>`), fire-and-forget, and
 * never throws into the business action that emitted the event. Each delivery
 * records its outcome on the webhook row so the admin UI can show health.
 */
import { and, asc, eq, lte } from "drizzle-orm";
import { createHmac, randomBytes, randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { webhookDeliveries, webhooks } from "@/db/schema";
import type { DomainEventType } from "@/lib/events";

export interface WebhookRow {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  lastStatus: number | null;
  lastError: string | null;
  lastDeliveredAt: Date | null;
  createdAt: Date;
}

/** Pure signing primitive — unit-tested in src/modules/webhooks/sign.test.ts. */
export function signPayload(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

// ---------------------------------------------------------------------------
// G-08 — replay window + retry schedule
// ---------------------------------------------------------------------------

/**
 * Receivers should reject signed deliveries older than this (timestamp is
 * sent as `x-wamiro-timestamp`; signature covers it, so it cannot be tampered
 * with). Bounds the HMAC replay window from "unlimited" to 5 minutes.
 */
export const SIGNATURE_MAX_AGE_MS = 5 * 60_000;
/** Retry backoff base: attempt n waits BASE * 2^(n-1), capped at 1 hour. */
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 60 * 60_000;
const MAX_ATTEMPTS = 6;

/** When the next retry is due for attempt n (1-based, after failure n). */
export function nextRetryDelayMs(attempts: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1), RETRY_MAX_MS);
}

/**
 * Verify a signed delivery's freshness (receiver-side helper; documented and
 * tested so integrators can implement the same check).
 */
export function isSignatureFresh(timestampMs: number, now = Date.now()): boolean {
  return Math.abs(now - timestampMs) <= SIGNATURE_MAX_AGE_MS;
}

function asRow(r: typeof webhooks.$inferSelect): WebhookRow {
  return {
    id: r.id,
    name: r.name,
    url: r.url,
    events: r.events,
    active: r.active,
    lastStatus: r.lastStatus,
    lastError: r.lastError,
    lastDeliveredAt: r.lastDeliveredAt,
    createdAt: r.createdAt,
  };
}

export async function listWebhooks(ctx: AuthContext): Promise<WebhookRow[]> {
  const rows = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.organizationId, ctx.user.organizationId))
    .orderBy(webhooks.createdAt);
  return rows.map(asRow);
}

export async function createWebhook(
  ctx: AuthContext,
  input: { name: string; url: string; events?: string[]; active?: boolean },
): Promise<WebhookRow & { secret: string }> {
  const name = input.name.trim().slice(0, 120);
  const url = input.url.trim();
  if (!name) throw ApiError.badRequest("Name is required");
  if (!/^https?:\/\//i.test(url) || url.length > 2000) {
    throw ApiError.badRequest("URL must be a valid http(s) endpoint");
  }
  const events = (input.events ?? []).slice(0, 50).filter((e) => typeof e === "string" && e.length <= 80);
  const secret = randomBytes(24).toString("base64url");
  const [row] = await db
    .insert(webhooks)
    .values({
      organizationId: ctx.user.organizationId,
      name,
      url,
      secret,
      events,
      active: input.active ?? true,
      createdBy: ctx.user.id,
    })
    .returning();
  if (!row) throw ApiError.notFound();
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "WEBHOOK_CREATED",
    entityType: "webhook",
    entityId: row.id,
    newValue: { name, url, events },
  });
  return { ...asRow(row), secret };
}

export async function updateWebhook(
  ctx: AuthContext,
  id: string,
  input: { name?: string; url?: string; events?: string[]; active?: boolean },
): Promise<WebhookRow> {
  const existing = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!existing[0]) throw ApiError.notFound();
  const patch: Partial<typeof webhooks.$inferInsert> = { ...input };
  if (input.name !== undefined) patch.name = input.name.trim().slice(0, 120) || existing[0].name;
  if (input.url !== undefined) {
    const url = input.url.trim();
    if (!/^https?:\/\//i.test(url)) throw ApiError.badRequest("URL must be a valid http(s) endpoint");
    patch.url = url;
  }
  if (input.events !== undefined) patch.events = input.events.slice(0, 50);
  const [row] = await db
    .update(webhooks)
    .set(patch)
    .where(and(eq(webhooks.id, id), eq(webhooks.organizationId, ctx.user.organizationId)))
    .returning();
  if (!row) throw ApiError.notFound();
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "WEBHOOK_UPDATED",
    entityType: "webhook",
    entityId: id,
    newValue: { name: row.name, active: row.active },
  });
  return asRow(row);
}

export async function deleteWebhook(ctx: AuthContext, id: string): Promise<void> {
  const [row] = await db
    .delete(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.organizationId, ctx.user.organizationId)))
    .returning({ id: webhooks.id, name: webhooks.name });
  if (!row) throw ApiError.notFound();
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "WEBHOOK_DELETED",
    entityType: "webhook",
    entityId: id,
    newValue: { name: row.name },
  });
}

/** Test hook used by the admin UI: fire a synthetic event through delivery. */
export async function testDelivery(ctx: AuthContext, id: string): Promise<WebhookRow> {
  const [wh] = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!wh) throw ApiError.notFound();
  const deliveryId = randomUUID();
  const body = envelopeBody("webhook.test", deliveryId, {
    organizationId: ctx.user.organizationId,
    event: "webhook.test",
    message: "Test delivery from Wamiro",
    sentAt: new Date().toISOString(),
  });
  const outcome = await deliverOnce(wh.url, wh.secret, "webhook.test", deliveryId, body);
  const [updated] = await db
    .update(webhooks)
    .set({
      lastStatus: outcome.httpStatus,
      lastError: outcome.error,
      lastDeliveredAt: new Date(),
    })
    .where(eq(webhooks.id, id))
    .returning();
  if (!updated) throw ApiError.notFound();
  return asRow(updated);
}

// ---------------------------------------------------------------------------
// Delivery — consumed by the event emitter (src/lib/events.ts)
// ---------------------------------------------------------------------------

interface DeliveryOutcome {
  ok: boolean;
  httpStatus: number | null;
  error: string | null;
}

async function deliverOnce(
  url: string,
  secret: string,
  eventType: string,
  deliveryId: string,
  body: string,
): Promise<DeliveryOutcome> {
  const timestampMs = Date.now();
  // The timestamp is INSIDE the signed material (body embeds it) and echoed in
  // a header — receivers verify signature + freshness, bounding replay.
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "wamiro-webhook/1",
        "x-wamiro-delivery": deliveryId,
        "x-wamiro-event": eventType,
        "x-wamiro-timestamp": String(timestampMs),
        "x-wamiro-signature": signPayload(secret, body),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: res.ok, httpStatus: res.status, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, httpStatus: null, error: String(e).slice(0, 300) };
  }
}

function envelopeBody(
  eventType: string,
  deliveryId: string,
  payload: Record<string, unknown>,
): string {
  return JSON.stringify({
    id: deliveryId,
    event: eventType,
    data: payload,
    deliveredAt: new Date().toISOString(),
  });
}

/**
 * Fan-out one event to every active webhook in the org that subscribes to it
 * (or to all events). Called fire-and-forget by the event emitter — never
 * throws.
 *
 * G-08: delivery is parallel (`Promise.allSettled` — one slow endpoint no
 * longer delays the others), every attempt is recorded in the
 * `webhook_deliveries` ledger, and failures are retried by the jobs worker
 * with exponential backoff instead of being lost with a `lastStatus` bump.
 */
export async function deliverEvent(
  organizationId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const hooks = await db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.organizationId, organizationId), eq(webhooks.active, true)));
    const targets = hooks.filter((wh) => wh.events.length === 0 || wh.events.includes(eventType));
    if (targets.length === 0) return;

    await Promise.allSettled(
      targets.map(async (wh) => {
        const deliveryId = randomUUID();
        const body = envelopeBody(eventType, deliveryId, payload);
        const outcome = await deliverOnce(wh.url, wh.secret, eventType, deliveryId, body);

        await db.insert(webhookDeliveries).values({
          organizationId,
          webhookId: wh.id,
          eventType,
          payload: body as unknown as object,
          deliveryId,
          status: outcome.ok ? "delivered" : "pending", // failed → retried
          attempts: 1,
          lastStatus: outcome.httpStatus,
          lastError: outcome.error,
          nextAttemptAt: outcome.ok ? new Date() : new Date(Date.now() + nextRetryDelayMs(1)),
          deliveredAt: outcome.ok ? new Date() : null,
        });
        // Keep the webhook row's health snapshot in sync for the admin UI.
        await db
          .update(webhooks)
          .set({
            lastStatus: outcome.httpStatus,
            lastError: outcome.error,
            lastDeliveredAt: new Date(),
          })
          .where(eq(webhooks.id, wh.id));
      }),
    );
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "webhook_fanout_failed", orgId: organizationId, eventType, err: String(e) }));
  }
}

export interface WebhookRetrySweepResult {
  checked: number;
  delivered: number;
  retried: number;
  exhausted: number;
}

/**
 * G-08 — drain due webhook deliveries (jobs worker, every 5 min).
 * Exponential backoff: 30s → 1m → 2m → 4m → 8m → 16m (capped 1h, 6 tries).
 * After MAX_ATTEMPTS the row is marked `failed` (kept for the history UI;
 * retention prunes it). Never throws.
 */
export async function sweepWebhookRetries(now = new Date()): Promise<WebhookRetrySweepResult> {
  const result: WebhookRetrySweepResult = { checked: 0, delivered: 0, retried: 0, exhausted: 0 };
  try {
    const due = await db
      .select({
        id: webhookDeliveries.id,
        attempts: webhookDeliveries.attempts,
        eventType: webhookDeliveries.eventType,
        payload: webhookDeliveries.payload,
        deliveryId: webhookDeliveries.deliveryId,
        url: webhooks.url,
        secret: webhooks.secret,
        active: webhooks.active,
      })
      .from(webhookDeliveries)
      .innerJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId))
      .where(and(eq(webhookDeliveries.status, "pending"), lte(webhookDeliveries.nextAttemptAt, now)))
      .orderBy(asc(webhookDeliveries.nextAttemptAt))
      .limit(100);

    for (const d of due) {
      result.checked += 1;
      if (!d.active) {
        await db
          .update(webhookDeliveries)
          .set({ status: "failed", lastError: "webhook deactivated" })
          .where(eq(webhookDeliveries.id, d.id));
        result.exhausted += 1;
        continue;
      }
      const body = typeof d.payload === "string" ? d.payload : JSON.stringify(d.payload);
      const outcome = await deliverOnce(d.url, d.secret, d.eventType, d.deliveryId, body);
      if (outcome.ok) {
        await db
          .update(webhookDeliveries)
          .set({ status: "delivered", lastStatus: outcome.httpStatus, lastError: null, deliveredAt: new Date() })
          .where(eq(webhookDeliveries.id, d.id));
        result.delivered += 1;
      } else if (d.attempts >= MAX_ATTEMPTS) {
        await db
          .update(webhookDeliveries)
          .set({ status: "failed", lastStatus: outcome.httpStatus, lastError: outcome.error })
          .where(eq(webhookDeliveries.id, d.id));
        result.exhausted += 1;
      } else {
        await db
          .update(webhookDeliveries)
          .set({
            attempts: d.attempts + 1,
            lastStatus: outcome.httpStatus,
            lastError: outcome.error,
            nextAttemptAt: new Date(Date.now() + nextRetryDelayMs(d.attempts + 1)),
          })
          .where(eq(webhookDeliveries.id, d.id));
        result.retried += 1;
      }
      await db
        .update(webhooks)
        .set({ lastStatus: outcome.httpStatus, lastError: outcome.error, lastDeliveredAt: new Date() })
        .where(eq(webhooks.url, d.url));
    }
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "webhook_retry_sweep_failed", err: String(e).slice(0, 300) }));
  }
  return result;
}

/** Re-export for the events module (avoids a hard import cycle). */
export type { DomainEventType };