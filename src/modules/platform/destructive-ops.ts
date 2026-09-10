/**
 * Admin panel B-fix — two-person rule for destructive subscription ops.
 *
 * Cancelling a PAYING tenant's subscription (active + paddle-wired or on a
 * paid plan) requires a SECOND platform operator's approval. Free/trial/
 * starter orgs execute directly — there is no revenue at risk and the plan's
 * rule ("no tenant silently locked out") already governs those paths.
 * Provider-driven cancellations (Paddle webhook) bypass this by design —
 * the customer themselves cancelled.
 */
import { and, desc, eq, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import { organizations, platformDestructiveOps } from "@/db/schema";
import { requirePlatform } from "./console";
import type { AuthContext } from "@/lib/session";

export type DestructiveKind = "cancel_subscription" | "delete_tenant";

function isPaying(org: { billingStatus: string; billingProvider: string | null; plan: string }): boolean {
  return org.billingStatus === "active" && (org.billingProvider !== null || org.plan !== "starter");
}

async function orgSnapshot(orgId: string) {
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      billingStatus: organizations.billingStatus,
      billingProvider: organizations.billingProvider,
      plan: organizations.plan,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) throw ApiError.notFound("Organization not found");
  return org;
}

/** Expire stale pending requests (7 days) — idempotent, run on every read/write. */
async function expireStale(): Promise<void> {
  await db
    .update(platformDestructiveOps)
    .set({ status: "expired", resolvedAt: new Date() })
    .where(
      and(
        eq(platformDestructiveOps.status, "pending"),
        lt(platformDestructiveOps.createdAt, new Date(Date.now() - 7 * 86_400_000)),
      ),
    );
}

/**
 * The cancel entry point. Executes immediately for non-paying orgs; for
 * paying orgs it queues a two-person approval instead.
 */
export async function requestOrExecuteCancel(
  ctx: AuthContext,
  orgId: string,
  reason: string,
): Promise<{ pending: boolean; opId?: string; message: string }> {
  requirePlatform(ctx);
  await expireStale();
  const trimmed = reason.trim();
  if (trimmed.length < 5) throw ApiError.badRequest("Give a reason for the cancellation (min 5 chars)");

  const org = await orgSnapshot(orgId);
  if (org.billingStatus === "cancelled") {
    return { pending: false, message: "Subscription is already cancelled" };
  }

  // Non-paying orgs (trial / starter / no provider) — execute directly.
  if (!isPaying(org)) {
    const { setOrgPlan } = await import("@/modules/billing/service");
    await setOrgPlan(ctx, orgId, { plan: "starter", billingStatus: "cancelled" });
    return { pending: false, message: `Subscription cancelled (${org.name})` };
  }

  // Paying org — second operator required.
  const [op] = await db
    .insert(platformDestructiveOps)
    .values({
      kind: "cancel_subscription",
      orgId: org.id,
      orgName: org.name,
      orgSlug: org.slug,
      payload: { billingStatus: "cancelled", plan: "starter" },
      reason: trimmed.slice(0, 500),
      requestedBy: ctx.user.id,
    })
    .returning({ id: platformDestructiveOps.id });

  await audit({
    organizationId: null,
    actorUserId: ctx.user.id,
    action: "PLATFORM_DESTRUCTIVE_OP_REQUESTED",
    entityType: "destructive_op",
    entityId: op!.id,
    newValue: { kind: "cancel_subscription", orgName: org.name, reason: trimmed.slice(0, 200) },
  });
  return {
    pending: true,
    opId: op!.id,
    message: `${org.name} is a paying customer — cancellation queued. A second platform operator must approve it.`,
  };
}

export async function listPending(ctx: AuthContext) {
  requirePlatform(ctx);
  await expireStale();
  return db
    .select({
      id: platformDestructiveOps.id,
      kind: platformDestructiveOps.kind,
      orgId: platformDestructiveOps.orgId,
      orgName: platformDestructiveOps.orgName,
      reason: platformDestructiveOps.reason,
      requestedBy: platformDestructiveOps.requestedBy,
      requesterName: sql<string>`(SELECT u.name FROM users u WHERE u.id = ${platformDestructiveOps.requestedBy})`,
      createdAt: platformDestructiveOps.createdAt,
      payload: platformDestructiveOps.payload,
    })
    .from(platformDestructiveOps)
    .where(eq(platformDestructiveOps.status, "pending"))
    .orderBy(desc(platformDestructiveOps.createdAt))
    .limit(50);
}

/** Second operator approves — the queued mutation executes under THEIR identity. */
export async function approveDestructiveOp(ctx: AuthContext, opId: string) {
  requirePlatform(ctx);
  await expireStale();
  const [op] = await db
    .select()
    .from(platformDestructiveOps)
    .where(and(eq(platformDestructiveOps.id, opId), eq(platformDestructiveOps.status, "pending")))
    .limit(1);
  if (!op) throw ApiError.notFound("Pending operation not found (already resolved or expired)");
  if (op.requestedBy === ctx.user.id) {
    throw ApiError.conflict("Two-person rule: the requesting operator cannot approve their own request");
  }
  if (op.kind === "cancel_subscription") {
    const { setOrgPlan } = await import("@/modules/billing/service");
    const payload = op.payload as { billingStatus?: "cancelled"; plan?: string };
    await setOrgPlan(ctx, op.orgId, {
      plan: payload.plan ?? "starter",
      billingStatus: payload.billingStatus ?? "cancelled",
    });
  } else {
    throw ApiError.badRequest(`Unsupported op kind: ${op.kind}`);
  }

  await db
    .update(platformDestructiveOps)
    .set({ status: "approved", approvedBy: ctx.user.id, resolvedAt: new Date() })
    .where(eq(platformDestructiveOps.id, opId));
  await audit({
    organizationId: null,
    actorUserId: ctx.user.id,
    action: "PLATFORM_DESTRUCTIVE_OP_APPROVED",
    entityType: "destructive_op",
    entityId: opId,
    newValue: { kind: op.kind, orgName: op.orgName, requestedBy: op.requestedBy },
  });
  return { ok: true };
}

/** Requester or any other operator can reject a pending request. */
export async function rejectDestructiveOp(ctx: AuthContext, opId: string) {
  requirePlatform(ctx);
  const [op] = await db
    .select({ id: platformDestructiveOps.id, orgName: platformDestructiveOps.orgName, requestedBy: platformDestructiveOps.requestedBy })
    .from(platformDestructiveOps)
    .where(and(eq(platformDestructiveOps.id, opId), eq(platformDestructiveOps.status, "pending")))
    .limit(1);
  if (!op) throw ApiError.notFound("Pending operation not found (already resolved or expired)");

  await db
    .update(platformDestructiveOps)
    .set({ status: "rejected", resolvedAt: new Date() })
    .where(eq(platformDestructiveOps.id, opId));
  await audit({
    organizationId: null,
    actorUserId: ctx.user.id,
    action: "PLATFORM_DESTRUCTIVE_OP_REJECTED",
    entityType: "destructive_op",
    entityId: opId,
    newValue: { orgName: op.orgName, requestedBy: op.requestedBy },
  });
  return { ok: true };
}
