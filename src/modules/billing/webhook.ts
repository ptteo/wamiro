/**
 * Apply a verified Paddle webhook payload.
 *
 * Signature checks live in the route. This module is idempotent on event_id
 * and never writes an org other than the one resolved from custom_data /
 * stored provider ids.
 */
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { billingEvents, billingInvoices, organizations } from "@/db/schema";
import { planFromPriceId } from "./adapter";
import { mapPaddleSubscriptionStatus, type BillingStatus } from "./status";

export interface ApplyResult {
  replay: boolean;
  orgId: string | null;
  eventType: string | null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function nested(data: Record<string, unknown>, key: string): Record<string, unknown> | null {
  return asRecord(data[key]);
}

function organizationIdFromCustomData(data: Record<string, unknown>): string | null {
  const custom = nested(data, "custom_data");
  return asString(custom?.organizationId) ?? asString(custom?.organization_id);
}

function firstPriceId(data: Record<string, unknown>): string | null {
  const items = data.items;
  if (!Array.isArray(items)) return null;
  for (const item of items) {
    const rec = asRecord(item);
    if (!rec) continue;
    const direct = asString(rec.price_id);
    if (direct) return direct;
    const price = nested(rec, "price");
    const nestedId = asString(price?.id);
    if (nestedId) return nestedId;
  }
  return null;
}

async function resolveOrgId(data: Record<string, unknown>): Promise<string | null> {
  const fromCustom = organizationIdFromCustomData(data);
  if (fromCustom) {
    const [row] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, fromCustom))
      .limit(1);
    if (row) return row.id;
  }
  const id = asString(data.id);
  const subscriptionId = asString(data.subscription_id) ?? (id?.startsWith("sub_") ? id : null);
  const customerId = asString(data.customer_id);
  if (subscriptionId) {
    const [row] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.billingSubscriptionId, subscriptionId))
      .limit(1);
    if (row) return row.id;
  }
  if (customerId) {
    const [row] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.billingCustomerId, customerId))
      .limit(1);
    if (row) return row.id;
  }
  return null;
}

async function patchOrg(
  orgId: string,
  patch: {
    billingStatus?: BillingStatus;
    plan?: string;
    billingCustomerId?: string | null;
    billingSubscriptionId?: string | null;
  },
): Promise<void> {
  const [current] = await db
    .select({
      billingStatus: organizations.billingStatus,
      plan: organizations.plan,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!current) return;

  const nextStatus = patch.billingStatus ?? (current.billingStatus as BillingStatus);
  const statusChanged = nextStatus !== current.billingStatus;
  const now = new Date();
  await db
    .update(organizations)
    .set({
      plan: patch.plan ?? current.plan,
      billingStatus: nextStatus,
      billingProvider: "paddle",
      ...(patch.billingCustomerId !== undefined ? { billingCustomerId: patch.billingCustomerId } : {}),
      ...(patch.billingSubscriptionId !== undefined ? { billingSubscriptionId: patch.billingSubscriptionId } : {}),
      ...(nextStatus !== "trial" ? { trialEndsAt: null } : {}),
      ...(statusChanged ? { billingStatusChangedAt: now, dunningStage: 0 } : {}),
      updatedAt: now,
    })
    .where(eq(organizations.id, orgId));
}

function invoiceAmountCents(data: Record<string, unknown>): number {
  const details = nested(data, "details");
  const totals = details ? nested(details, "totals") : null;
  const raw = asString(totals?.grand_total) ?? asString(totals?.total) ?? asString(data.grand_total);
  const n = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

async function upsertInvoice(orgId: string, data: Record<string, unknown>, occurredAt: string | null): Promise<void> {
  const providerInvoiceId = asString(data.invoice_id) ?? asString(data.id);
  if (!providerInvoiceId) return;
  const checkout = nested(data, "checkout");
  const billedAtRaw = asString(data.billed_at) ?? asString(data.created_at) ?? occurredAt;
  const billedAt = billedAtRaw ? new Date(billedAtRaw) : new Date();
  const status = asString(data.status) ?? "paid";
  await db
    .insert(billingInvoices)
    .values({
      organizationId: orgId,
      providerInvoiceId,
      amountCents: invoiceAmountCents(data),
      currency: asString(data.currency_code) ?? "USD",
      status,
      hostedUrl: asString(checkout?.url),
      billedAt: Number.isNaN(billedAt.getTime()) ? new Date() : billedAt,
    })
    .onConflictDoUpdate({
      target: billingInvoices.providerInvoiceId,
      set: {
        amountCents: invoiceAmountCents(data),
        currency: asString(data.currency_code) ?? "USD",
        status,
        hostedUrl: asString(checkout?.url),
        billedAt: Number.isNaN(billedAt.getTime()) ? new Date() : billedAt,
      },
    });
}

async function applySubscription(orgId: string, eventType: string, data: Record<string, unknown>): Promise<void> {
  const forced =
    eventType === "subscription.canceled" || eventType === "subscription.cancelled"
      ? ("cancelled" as const)
      : eventType === "subscription.past_due"
        ? ("past_due" as const)
        : null;
  const mapped = forced ?? mapPaddleSubscriptionStatus(asString(data.status));
  const priceId = firstPriceId(data);
  const plan = planFromPriceId(priceId) ?? undefined;
  const customerId = asString(data.customer_id);
  const subscriptionId = asString(data.id);
  await patchOrg(orgId, {
    billingStatus: mapped ?? undefined,
    plan,
    billingCustomerId: customerId,
    billingSubscriptionId: subscriptionId,
  });
}

async function applyTransaction(orgId: string, data: Record<string, unknown>, occurredAt: string | null): Promise<void> {
  const customerId = asString(data.customer_id);
  const subscriptionId = asString(data.subscription_id);
  const priceId = firstPriceId(data);
  const plan = planFromPriceId(priceId) ?? undefined;
  await patchOrg(orgId, {
    billingStatus: "active",
    plan,
    billingCustomerId: customerId,
    billingSubscriptionId: subscriptionId,
  });
  await upsertInvoice(orgId, data, occurredAt);
}

export async function applyPaddleEvent(raw: unknown): Promise<ApplyResult> {
  const body = asRecord(raw);
  const eventId = asString(body?.event_id) ?? asString(body?.notification_id);
  const eventType = asString(body?.event_type);
  if (!eventId || !eventType) {
    return { replay: false, orgId: null, eventType: eventType };
  }
  const data = asRecord(body?.data) ?? {};
  const occurredAt = asString(body?.occurred_at);

  const inserted = await db
    .insert(billingEvents)
    .values({
      eventId,
      eventType,
      organizationId: null,
      payload: body ?? {},
    })
    .onConflictDoNothing()
    .returning({ eventId: billingEvents.eventId });

  if (inserted.length === 0) {
    return { replay: true, orgId: null, eventType };
  }

  const orgId = await resolveOrgId(data);
  if (orgId) {
    await db.update(billingEvents).set({ organizationId: orgId }).where(eq(billingEvents.eventId, eventId));
    if (eventType.startsWith("subscription.")) {
      await applySubscription(orgId, eventType, data);
    } else if (eventType === "transaction.completed" || eventType === "transaction.paid") {
      await applyTransaction(orgId, data, occurredAt);
    }
  }

  return { replay: false, orgId, eventType };
}

/** Isolation helper: event for org A must not have written org B. */
export async function orgBillingSnapshot(orgId: string) {
  const [row] = await db
    .select({
      plan: organizations.plan,
      billingStatus: organizations.billingStatus,
      billingProvider: organizations.billingProvider,
      billingCustomerId: organizations.billingCustomerId,
      billingSubscriptionId: organizations.billingSubscriptionId,
      dunningStage: organizations.dunningStage,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return row ?? null;
}

export async function invoiceCountForOrg(orgId: string): Promise<number> {
  const rows = await db
    .select({ id: billingInvoices.id })
    .from(billingInvoices)
    .where(eq(billingInvoices.organizationId, orgId));
  return rows.length;
}

/** Used by isolation tests to assert a replay did not insert a second event row. */
export async function billingEventExists(eventId: string): Promise<boolean> {
  const [row] = await db
    .select({ eventId: billingEvents.eventId })
    .from(billingEvents)
    .where(eq(billingEvents.eventId, eventId))
    .limit(1);
  return Boolean(row);
}
