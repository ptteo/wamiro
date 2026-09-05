/**
 * Billing service (multi-tenant commercialization).
 *
 * Owns the org-level subscription: plan tier, billing lifecycle state, trial
 * windows, and seat enforcement. Payment-provider wiring is deliberately
 * behind a small adapter (`billingAdapter`, below) so the product ships and
 * operates without credentials (self-serve on Starter) and Stripe/Paddle can
 * be dropped in without touching call sites.
 *
 * Lifecycle:
 *   new org → starter/active (usable immediately)
 *   platform grants trial of growth|scale → trial, trial_ends_at set
 *   sweep: trial expired →
 *       provider configured → past_due (dunning begins, provider drives)
 *       no provider         → downgrade to starter/active (grace), audit
 *   cancelled (provider webhook / platform) → access blocked at auth
 */
import { and, count, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { organizations, organizationMemberships } from "@/db/schema";
import { effectiveSeatLimit, planOf, type PlanDef } from "./plans";

export type BillingStatus = "trial" | "active" | "past_due" | "cancelled";

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
  billingProvider: string | null;
  /** When no payment provider is wired, upgrades go through the operator. */
  upgradeUrl: string | null;
  highlights: string[];
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
 * Seat enforcement — called before creating a new membership. Throws a clear
 * conflict when the org is at its plan's seat cap so admins see exactly why
 * an invite failed.
 */
export async function assertSeatAvailable(ctx: AuthContext): Promise<void> {
  const [org] = await db
    .select({ plan: organizations.plan, seatLimit: organizations.seatLimit })
    .from(organizations)
    .where(eq(organizations.id, ctx.user.organizationId))
    .limit(1);
  if (!org) throw ApiError.notFound();
  const limit = effectiveSeatLimit(org.plan, org.seatLimit);
  if (limit === null) return; // unlimited plan
  const seats = await activeSeatCount(ctx.user.organizationId);
  if (seats >= limit) {
    const plan = planOf(org.plan);
    throw ApiError.conflict(
      `Your ${plan.name} plan allows up to ${limit} people (${limit} currently active). ` +
        `Ask your platform administrator to upgrade to a larger plan.`,
    );
  }
}

export function upgradeUrlFor(): string | null {
  const raw = process.env.BILLING_UPGRADE_URL;
  return raw && raw.trim().length > 0 ? raw.trim() : null;
}

export async function subscriptionView(ctx: AuthContext): Promise<SubscriptionView> {
  const [org] = await db
    .select({
      plan: organizations.plan,
      billingStatus: organizations.billingStatus,
      trialEndsAt: organizations.trialEndsAt,
      seatLimit: organizations.seatLimit,
      billingProvider: organizations.billingProvider,
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
    billingProvider: org.billingProvider,
    upgradeUrl: upgradeUrlFor(),
    highlights: plan.highlights,
  };
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
  input: { plan?: string; billingStatus?: BillingStatus; trialDays?: number | null; seatLimit?: number | null },
): Promise<void> {
  // Read current state first so partial updates keep the untouched fields.
  const [current] = await db
    .select({ plan: organizations.plan, billingStatus: organizations.billingStatus, trialEndsAt: organizations.trialEndsAt })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!current) throw ApiError.notFound();

  const plan = input.plan !== undefined ? validatePlan(input.plan) : planOf(current.plan);
  const status = (input.billingStatus ?? current.billingStatus) as BillingStatus;
  if (!["trial", "active", "past_due", "cancelled"].includes(status)) {
    throw ApiError.badRequest("billingStatus must be trial|active|past_due|cancelled");
  }
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
          ? null // clear override → plan default applies
          : Math.max(1, Math.floor(input.seatLimit)),
      updatedAt: new Date(),
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
    // With a payment provider the plan is kept and dunning begins (the provider
    // drives the next transition). Without one, gracefully downgrade to Starter.
    const next: Record<string, unknown> = { billingStatus: org.billingProvider ? "past_due" : "active", updatedAt: now };
    if (!org.billingProvider) next.plan = "starter";
    await db.update(organizations).set(next).where(eq(organizations.id, org.id));
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
  if (billingStatus === "past_due") return "This organization has an overdue subscription. Please contact support.";
  return null;
}
