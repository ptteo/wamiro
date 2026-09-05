/**
 * Outgoing webhooks (Phase C — enterprise trust). Lets a company push Wamiro
 * events (ticket.created, employee.created, …) to its own systems.
 *
 * Delivery is HMAC-SHA256 signed (`sha256=<hex>`), fire-and-forget, and
 * never throws into the business action that emitted the event. Each delivery
 * records its outcome on the webhook row so the admin UI can show health.
 */
import { and, eq } from "drizzle-orm";
import { createHmac, randomBytes, randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { webhooks } from "@/db/schema";
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
  const outcome = await deliverOnce(wh, "webhook.test", {
    organizationId: ctx.user.organizationId,
    event: "webhook.test",
    message: "Test delivery from Wamiro",
    sentAt: new Date().toISOString(),
  });
  const [updated] = await db
    .update(webhooks)
    .set(outcome)
    .where(eq(webhooks.id, id))
    .returning();
  if (!updated) throw ApiError.notFound();
  return asRow(updated);
}

// ---------------------------------------------------------------------------
// Delivery — consumed by the event emitter (src/lib/events.ts)
// ---------------------------------------------------------------------------

async function deliverOnce(
  wh: typeof webhooks.$inferSelect,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<{ lastStatus: number | null; lastError: string | null; lastDeliveredAt: Date }> {
  const deliveryId = randomUUID();
  const body = JSON.stringify({
    id: deliveryId,
    event: eventType,
    data: payload,
    deliveredAt: new Date().toISOString(),
  });
  try {
    const res = await fetch(wh.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "wamiro-webhook/1",
        "x-wamiro-delivery": deliveryId,
        "x-wamiro-event": eventType,
        "x-wamiro-signature": signPayload(wh.secret, body),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    return {
      lastStatus: res.status,
      lastError: res.ok ? null : `HTTP ${res.status}`,
      lastDeliveredAt: new Date(),
    };
  } catch (e) {
    return { lastStatus: null, lastError: String(e).slice(0, 300), lastDeliveredAt: new Date() };
  }
}

/**
 * Fan-out one event to every active webhook in the org that subscribes to it
 * (or to all events). Called fire-and-forget by the event emitter — never
 * throws, failures land on the webhook row for the admin UI.
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
    for (const wh of hooks) {
      if (wh.events.length > 0 && !wh.events.includes(eventType)) continue;
      const outcome = await deliverOnce(wh, eventType, payload);
      await db
        .update(webhooks)
        .set(outcome)
        .where(eq(webhooks.id, wh.id));
    }
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "webhook_fanout_failed", orgId: organizationId, eventType, err: String(e) }));
  }
}

/** Re-export for the events module (avoids a hard import cycle). */
export type { DomainEventType };