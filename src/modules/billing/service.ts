/**
 * Billing service (multi-tenant commercialization).
 *
 * Owns the org-level subscription: plan tier, billing lifecycle state, trial
 * windows, and seat enforcement. Payment-provider wiring lives in adapter.ts
 * (Paddle). Unset credentials keep Starter self-serve and "Talk to sales".
 *
 * Lifecycle:
 *   new org → starter/active (usable immediately)
 *   platform grants trial of growth|scale → trial, trial_ends_at set
 *   self-serve checkout (Paddle) → webhook sets active + customer/sub ids
 *   sweep: trial expired →
 *       provider configured → past_due (dunning begins, provider drives)
 *       no provider         → downgrade to starter/active (grace), audit
 *   cancelled (provider webhook / platform) → access blocked at auth
 */
import { and, count, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { organizations, organizationMemberships, platformBillingInvoices as billingInvoices } from "@/db/schema";
import {
  cancelPaddleSubscription,
  createCheckoutUrl,
  createPortalUrl,
  paddleConfigured,
  priceIdForPlan,
  syncSubscriptionQuantity,
  type PaidPlanId,
} from "./adapter";
import { PLANS, effectiveSeatLimit, planOf, type PlanDef } from "./plans";
import type { BillingStatus } from "./status";

export type { BillingStatus };

export interface BillingInvoiceView {
  id: string;
  providerInvoiceId: string | null; // null for manual invoices
  amountCents: number;
  currency: string;
  status: string;
  hostedUrl: string | null;
  billedAt: string | null;
}

export interface SubscriptionView {
  plan: string;
  planName: string;
  planTagline: string;
  monthlyPerSeat: number | null;
  billingStatus: BillingStatus;
  trialEndsAt: Date | null;
  trialDaysLeft: number | null;
  seatLimit: number | null;
  activeSeats: number;
  seatsRemaining: number | null;
  seatsOverCap: boolean;
  seatOveragePolicy: "hard" | "soft";
  billingProvider: string | null;
  /** When no payment provider is wired, upgrades go through the operator. */
  upgradeUrl: string | null;
  paddleConfigured: boolean;
  hasCustomer: boolean;
  hasSubscription: boolean;
  highlights: string[];
  invoices: BillingInvoiceView[];
  plans: {
    id: string;
    name: string;
    tagline: string;
    monthlyPerSeat: number | null;
    seatLimit: number | null;
    highlights: string[];
  }[];
}

/** Active seats = active memberships in this org (invites + linked identities). */
export async function activeSeatCount(orgId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, orgId),
        eq(organizationMemberships.status, "active"),
      ),
    );
  return Number(row?.n ?? 0);
}

/** Effective seat cap for the org (NULL = unlimited). */
export async function seatLimitForOrg(orgId: string): Promise<number | null> {
  const [row] = await db
    .select({ plan: organizations.plan, seatLimit: organizations.seatLimit })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!row) return null;
  return effectiveSeatLimit(row.plan, row.seatLimit);
}

/**
 * Seat enforcement — called before creating a new membership. Hard policy
 * throws at the cap. Soft policy lets the invite through (banner + Paddle
 * quantity sync happen after).
 */
export async function assertSeatAvailable(ctx: AuthContext): Promise<void> {
  const [org] = await db
    .select({
      plan: organizations.plan,
      seatLimit: organizations.seatLimit,
      seatOveragePolicy: organizations.seatOveragePolicy,
    })
    .from(organizations)
    .where(eq(organizations.id, ctx.user.organizationId))
    .limit(1);
  if (!org) throw ApiError.notFound();
  const limit = effectiveSeatLimit(org.plan, org.seatLimit);
  if (limit === null) return; // unlimited plan
  const seats = await activeSeatCount(ctx.user.organizationId);
  if (seats >= limit) {
    if (org.seatOveragePolicy === "soft") return;
    const plan = planOf(org.plan);
    throw ApiError.conflict(
      `Your ${plan.name} plan allows up to ${limit} people (${seats} currently active). ` +
        `Upgrade in Settings → Plan & Billing, or ask your platform administrator.`,
    );
  }
}

/** Best-effort: push current headcount to Paddle. Never fails the invite. */
export async function syncSeatsAfterInvite(orgId: string): Promise<void> {
  try {
    if (!paddleConfigured()) return;
    const [org] = await db
      .select({
        plan: organizations.plan,
        billingSubscriptionId: organizations.billingSubscriptionId,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!org?.billingSubscriptionId) return;
    const priceId = priceIdForPlan(org.plan);
    if (!priceId) return;
    const quantity = await activeSeatCount(orgId);
    await syncSubscriptionQuantity({
      subscriptionId: org.billingSubscriptionId,
      priceId,
      quantity,
    });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "billing_seat_sync_failed", orgId, err: String(e) }));
  }
}

export function upgradeUrlFor(): string | null {
  const raw = process.env.BILLING_UPGRADE_URL;
  return raw && raw.trim().length > 0 ? raw.trim() : null;
}

async function invoicesFor(orgId: string): Promise<BillingInvoiceView[]> {
  // The tenant reads only its OWN rows from the platform ledger (its billing
  // mirror) — never another org's, and none of the panel-only columns.
  const rows = await db
    .select()
    .from(billingInvoices)
    .where(eq(billingInvoices.orgId, orgId))
    .orderBy(desc(billingInvoices.issuedAt), desc(billingInvoices.createdAt))
    .limit(50);
  return rows.map((r) => ({
    id: r.id,
    providerInvoiceId: r.providerInvoiceId,
    amountCents: r.amountCents,
    currency: r.currency,
    status: r.status,
    hostedUrl: r.hostedUrl,
    billedAt: r.issuedAt ? r.issuedAt.toISOString() : null,
  }));
}

export async function subscriptionView(ctx: AuthContext): Promise<SubscriptionView> {
  const [org] = await db
    .select({
      plan: organizations.plan,
      billingStatus: organizations.billingStatus,
      trialEndsAt: organizations.trialEndsAt,
      seatLimit: organizations.seatLimit,
      seatOveragePolicy: organizations.seatOveragePolicy,
      billingProvider: organizations.billingProvider,
      billingCustomerId: organizations.billingCustomerId,
      billingSubscriptionId: organizations.billingSubscriptionId,
    })
    .from(organizations)
    .where(eq(organizations.id, ctx.user.organizationId))
    .limit(1);
  if (!org) throw ApiError.notFound();
  const plan: PlanDef = planOf(org.plan);
  const limit = effectiveSeatLimit(org.plan, org.seatLimit);
  const seats = await activeSeatCount(ctx.user.organizationId);
  const trialDaysLeft =
    org.trialEndsAt && org.billingStatus === "trial"
      ? Math.max(0, Math.ceil((org.trialEndsAt.getTime() - Date.now()) / 86_400_000))
      : null;
  const invoices = await invoicesFor(ctx.user.organizationId);
  return {
    plan: plan.id,
    planName: plan.name,
    planTagline: plan.tagline,
    monthlyPerSeat: plan.monthlyPerSeat,
    billingStatus: (org.billingStatus as BillingStatus) ?? "active",
    trialEndsAt: org.trialEndsAt,
    trialDaysLeft,
    seatLimit: limit,
    activeSeats: seats,
    seatsRemaining: limit === null ? null : Math.max(0, limit - seats),
    seatsOverCap: limit !== null && seats > limit,
    seatOveragePolicy: org.seatOveragePolicy === "soft" ? "soft" : "hard",
    billingProvider: org.billingProvider,
    upgradeUrl: upgradeUrlFor(),
    paddleConfigured: paddleConfigured(),
    hasCustomer: Boolean(org.billingCustomerId),
    hasSubscription: Boolean(org.billingSubscriptionId),
    highlights: plan.highlights,
    invoices,
    plans: Object.values(PLANS).map((p) => ({
      id: p.id,
      name: p.name,
      tagline: p.tagline,
      monthlyPerSeat: p.monthlyPerSeat,
      seatLimit: p.seatLimit,
      highlights: p.highlights,
    })),
  };
}

/** Home banner: over the seat cap (soft policy). Cheap — no invoice list. */
export async function seatOverageNotice(orgId: string): Promise<{
  seatsOverCap: boolean;
  activeSeats: number;
  seatLimit: number | null;
} | null> {
  const [org] = await db
    .select({ plan: organizations.plan, seatLimit: organizations.seatLimit })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return null;
  const limit = effectiveSeatLimit(org.plan, org.seatLimit);
  const seats = await activeSeatCount(orgId);
  if (limit === null || seats <= limit) return null;
  return { seatsOverCap: true, activeSeats: seats, seatLimit: limit };
}

// ---------------------------------------------------------------------------
// Lifecycle transitions — platform operators (platform.admin) + sweep
// ---------------------------------------------------------------------------

function validatePlan(plan: string): PlanDef {
  const p = planOf(plan);
  if (p.id !== plan) throw ApiError.badRequest("plan must be starter, growth or scale");
  return p;
}

/** Grant a paid plan (optionally a trial) to an org. Platform/admin only. */
export async function setOrgPlan(
  ctx: AuthContext,
  orgId: string,
  input: {
    plan?: string;
    billingStatus?: BillingStatus;
    trialDays?: number | null;
    seatLimit?: number | null;
    seatOveragePolicy?: "hard" | "soft";
  },
): Promise<void> {
  const [current] = await db
    .select({
      plan: organizations.plan,
      billingStatus: organizations.billingStatus,
      trialEndsAt: organizations.trialEndsAt,
      seatOveragePolicy: organizations.seatOveragePolicy,
      billingStatusChangedAt: organizations.billingStatusChangedAt,
      dunningStage: organizations.dunningStage,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!current) throw ApiError.notFound();

  const plan = input.plan !== undefined ? validatePlan(input.plan) : planOf(current.plan);
  const status = (input.billingStatus ?? current.billingStatus) as BillingStatus;
  if (!["trial", "active", "past_due", "cancelled"].includes(status)) {
    throw ApiError.badRequest("billingStatus must be trial|active|past_due|cancelled");
  }
  if (input.seatOveragePolicy && input.seatOveragePolicy !== "hard" && input.seatOveragePolicy !== "soft") {
    throw ApiError.badRequest("seatOveragePolicy must be hard or soft");
  }
  const statusChanged = status !== current.billingStatus;
  const now = new Date();
  const patch = await db
    .update(organizations)
    .set({
      plan: plan.id,
      billingStatus: status,
      trialEndsAt:
        status === "trial"
          ? new Date(Date.now() + (input.trialDays ?? (plan.trialDays || 14)) * 86_400_000)
          : null,
      seatLimit:
        input.seatLimit === undefined || input.seatLimit === null
          ? null
          : Math.max(1, Math.floor(input.seatLimit)),
      seatOveragePolicy: input.seatOveragePolicy ?? current.seatOveragePolicy,
      billingStatusChangedAt: statusChanged ? now : current.billingStatusChangedAt,
      dunningStage: statusChanged ? 0 : current.dunningStage,
      updatedAt: now,
    })
    .where(eq(organizations.id, orgId))
    .returning({ id: organizations.id, name: organizations.name });
  if (!patch[0]) throw ApiError.notFound();
  await audit({
    organizationId: null,
    actorUserId: ctx.user.id,
    action: "ORG_PLAN_CHANGED",
    entityType: "organization",
    entityId: orgId,
    newValue: {
      plan: plan.id,
      billingStatus: status,
      seatLimit: input.seatLimit === undefined ? null : input.seatLimit,
      seatOveragePolicy: input.seatOveragePolicy ?? current.seatOveragePolicy,
    },
  });
}

/** Shortcut used by the platform console: grant a trial of a paid plan. */
export async function startTrial(ctx: AuthContext, orgId: string, plan = "growth"): Promise<void> {
  const p = validatePlan(plan);
  await setOrgPlan(ctx, orgId, { plan: p.id, billingStatus: "trial", trialDays: p.trialDays || 14 });
}

/**
 * Trial-expiry sweep. Idempotent; safe to run on a schedule or during admin
 * reads. Expired trials:
 *   - with a payment provider → past_due (provider dunning owns the next step)
 *   - without a provider     → graceful downgrade to starter/active so a team
 *     that never entered payment details is never locked out silently.
 */
export async function sweepExpiredTrials(now: Date = new Date()): Promise<number> {
  const expired = await db
    .select({ id: organizations.id, billingProvider: organizations.billingProvider })
    .from(organizations)
    .where(and(eq(organizations.billingStatus, "trial"), sql`${organizations.trialEndsAt} < ${now}`));
  let changed = 0;
  for (const org of expired) {
    const nextStatus = org.billingProvider ? "past_due" : "active";
    await db
      .update(organizations)
      .set(
        org.billingProvider
          ? { billingStatus: nextStatus, billingStatusChangedAt: now, dunningStage: 0, updatedAt: now }
          : {
              billingStatus: nextStatus,
              plan: "starter",
              billingStatusChangedAt: now,
              dunningStage: 0,
              updatedAt: now,
            },
      )
      .where(eq(organizations.id, org.id));
    changed += 1;
  }
  return changed;
}

/** True when the org's subscription still permits access. */
export function billingBlocksAccess(billingStatus: string | null | undefined): boolean {
  return billingStatus === "cancelled";
}

/** Surface the org's billing state for the session gate message. */
export function billingBlockReason(billingStatus: string | null | undefined): string | null {
  if (billingStatus === "cancelled") return "This organization's subscription has ended.";
  if (billingStatus === "past_due") return "This organization has an overdue subscription. Please update billing.";
  return null;
}

async function loadOrgBilling(orgId: string) {
  const [org] = await db
    .select({
      id: organizations.id,
      plan: organizations.plan,
      billingCustomerId: organizations.billingCustomerId,
      billingSubscriptionId: organizations.billingSubscriptionId,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) throw ApiError.notFound();
  return org;
}

/** Start Paddle checkout, or switch the existing subscription's price in place. */
export async function startCheckout(ctx: AuthContext, plan: PaidPlanId): Promise<{ url: string | null; changed: boolean }> {
  if (plan !== "growth" && plan !== "scale") {
    throw ApiError.badRequest("Choose Growth or Scale");
  }
  if (!paddleConfigured() || !priceIdForPlan(plan)) {
    throw ApiError.unavailable("Self-serve billing is not configured. Contact sales to upgrade.");
  }
  const org = await loadOrgBilling(ctx.user.organizationId);
  const quantity = Math.max(1, await activeSeatCount(ctx.user.organizationId));
  if (org.billingSubscriptionId) {
    const priceId = priceIdForPlan(plan);
    if (!priceId) throw ApiError.unavailable("No Paddle price is configured for that plan.");
    await syncSubscriptionQuantity({
      subscriptionId: org.billingSubscriptionId,
      priceId,
      quantity,
    });
    await db
      .update(organizations)
      .set({ plan, updatedAt: new Date() })
      .where(eq(organizations.id, org.id));
    await audit({
      organizationId: ctx.user.organizationId,
      actorUserId: ctx.user.id,
      action: "BILLING_PLAN_CHANGED",
      entityType: "organization",
      entityId: org.id,
      newValue: { plan, via: "paddle_patch" },
    });
    return { url: null, changed: true };
  }
  const url = await createCheckoutUrl({
    orgId: org.id,
    plan,
    quantity,
    email: ctx.user.email,
    customerId: org.billingCustomerId,
  });
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "BILLING_CHECKOUT_STARTED",
    entityType: "organization",
    entityId: org.id,
    newValue: { plan, quantity },
  });
  return { url, changed: false };
}

export async function startPortal(ctx: AuthContext): Promise<{ url: string }> {
  if (!paddleConfigured()) {
    throw ApiError.unavailable("Self-serve billing is not configured.");
  }
  const org = await loadOrgBilling(ctx.user.organizationId);
  if (!org.billingCustomerId) {
    throw ApiError.badRequest("No billing customer yet. Upgrade a plan first.");
  }
  const url = await createPortalUrl({
    customerId: org.billingCustomerId,
    subscriptionId: org.billingSubscriptionId,
  });
  return { url };
}

export async function cancelSelfServe(ctx: AuthContext): Promise<{ scheduled: boolean }> {
  if (!paddleConfigured()) {
    throw ApiError.unavailable("Self-serve billing is not configured. Ask the platform operator to cancel.");
  }
  const org = await loadOrgBilling(ctx.user.organizationId);
  if (!org.billingSubscriptionId) {
    throw ApiError.badRequest("There is no paid subscription to cancel.");
  }
  await cancelPaddleSubscription({ subscriptionId: org.billingSubscriptionId });
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "BILLING_CANCEL_REQUESTED",
    entityType: "organization",
    entityId: org.id,
    newValue: { via: "paddle", effectiveFrom: "next_billing_period" },
  });
  return { scheduled: true };
}
