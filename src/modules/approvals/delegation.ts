/**
 * Approval delegation (§27): time-boxed transfer of approval authority.
 * Active delegations are checked by pendingForApprover/review in leave and
 * request services via resolveApprovalActors() — no circular imports needed.
 */
import { and, asc, eq, gt } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { approvalDelegations, users } from "@/db/schema";

export async function createDelegation(
  ctx: AuthContext,
  input: { delegateEmail: string; reason: string },
): Promise<void> {
  const [delegate] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.email, input.delegateEmail.trim().toLowerCase()),
        eq(users.organizationId, ctx.user.organizationId),
      ),
    )
    .limit(1);
  if (!delegate) throw ApiError.notFound("No user with that email");
  if (delegate.id === ctx.user.id) throw ApiError.badRequest("Cannot delegate to yourself");

  await db.insert(approvalDelegations).values({
    organizationId: ctx.user.organizationId,
    delegatorId: ctx.user.id,
    delegateId: delegate.id,
    reason: input.reason.slice(0, 300),
    startsAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
    createdBy: ctx.user.id,
  });

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "APPROVAL_DELEGATION_CREATED",
    entityType: "approval_delegation",
    entityId: delegate.id,
  });
}

export async function revokeDelegation(ctx: AuthContext, delegationId: string): Promise<void> {
  const updated = await db
    .update(approvalDelegations)
    .set({ active: false })
    .where(and(eq(approvalDelegations.id, delegationId), eq(approvalDelegations.organizationId, ctx.user.organizationId)))
    .returning({ id: approvalDelegations.id });
  if (!updated[0]) throw ApiError.notFound();
}

export async function listMyDelegations(ctx: AuthContext) {
  return db
    .select({
      id: approvalDelegations.id,
      delegateName: users.name,
      reason: approvalDelegations.reason,
      expiresAt: approvalDelegations.expiresAt,
      active: approvalDelegations.active,
    })
    .from(approvalDelegations)
    .innerJoin(users, eq(users.id, approvalDelegations.delegateId))
    .where(eq(approvalDelegations.delegatorId, ctx.user.id))
    .orderBy(asc(approvalDelegations.expiresAt));
}

/**
 * Resolve all userIds whose approval queue the caller can act on.
 * Returns [self] plus any active delegators. Used by pendingForApprover
 * in leave/request services as an OR condition on the approver filter.
 */
export async function resolveApprovalActors(ctx: AuthContext): Promise<string[]> {
  const delegations = await db
    .select({ delegatorId: approvalDelegations.delegatorId })
    .from(approvalDelegations)
    .where(
      and(
        eq(approvalDelegations.delegateId, ctx.user.id),
        eq(approvalDelegations.active, true),
        gt(approvalDelegations.expiresAt, new Date()),
      ),
    );
  return delegations.map((d) => d.delegatorId);
}
