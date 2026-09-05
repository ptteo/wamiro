/**
 * Ticket groups + assignment rules (F2.5) — Zammad-style routing.
 * Groups give the agent queue structure; assignment rules auto-assign new
 * tickets to the group member with the fewest open tickets (deterministic
 * load balancing, no round-robin state to corrupt).
 */
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { assignmentRules, ticketGroupMembers, ticketGroups, tickets, users } from "@/db/schema";
import { can } from "@/modules/iam/engine";

const CATEGORIES = new Set(["incident", "service_request", "access", "hardware", "software", "other"]);

function requireAgent(ctx: AuthContext) {
  if (!can(ctx.access, "tickets.manage")) throw ApiError.forbidden("Missing permission: tickets.manage");
}

// ---------- groups ----------

export async function listGroups(ctx: AuthContext) {
  requireAgent(ctx);
  const rows = await db
    .select({
      id: ticketGroups.id,
      name: ticketGroups.name,
      description: ticketGroups.description,
      createdAt: ticketGroups.createdAt,
    })
    .from(ticketGroups)
    .where(eq(ticketGroups.organizationId, ctx.user.organizationId))
    .orderBy(asc(ticketGroups.name));
  const memberCounts = await db
    .select({ groupId: ticketGroupMembers.groupId, n: sql<number>`count(*)::int` })
    .from(ticketGroupMembers)
    .where(eq(ticketGroupMembers.organizationId, ctx.user.organizationId))
    .groupBy(ticketGroupMembers.groupId);
  const countMap = new Map(memberCounts.map((r) => [r.groupId, r.n]));
  return rows.map((g) => ({ ...g, memberCount: countMap.get(g.id) ?? 0 }));
}

export async function createGroup(ctx: AuthContext, input: { name: string; description?: string }) {
  requireAgent(ctx);
  const name = input.name.trim().slice(0, 100);
  if (!name) throw ApiError.badRequest("Group name required");
  const inserted = await db
    .insert(ticketGroups)
    .values({
      organizationId: ctx.user.organizationId,
      name,
      description: input.description?.trim().slice(0, 300) || null,
    })
    .onConflictDoNothing()
    .returning({ id: ticketGroups.id });
  if (!inserted[0]) throw ApiError.conflict("A group with this name already exists");
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "TICKET_GROUP_CREATED",
    entityType: "ticket_group",
    entityId: inserted[0].id,
    newValue: { name },
  });
  return inserted[0];
}

export async function updateGroup(ctx: AuthContext, id: string, input: { name: string; description?: string | null }) {
  requireAgent(ctx);
  const updated = await db
    .update(ticketGroups)
    .set({
      name: input.name.trim().slice(0, 100),
      description: input.description?.trim().slice(0, 300) || null,
    })
    .where(and(eq(ticketGroups.id, id), eq(ticketGroups.organizationId, ctx.user.organizationId)))
    .returning({ id: ticketGroups.id });
  if (!updated[0]) throw ApiError.notFound();
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "TICKET_GROUP_UPDATED",
    entityType: "ticket_group",
    entityId: id,
  });
}

export async function deleteGroup(ctx: AuthContext, id: string) {
  requireAgent(ctx);
  const deleted = await db
    .delete(ticketGroups)
    .where(and(eq(ticketGroups.id, id), eq(ticketGroups.organizationId, ctx.user.organizationId)))
    .returning({ id: ticketGroups.id });
  if (!deleted[0]) throw ApiError.notFound();
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "TICKET_GROUP_DELETED",
    entityType: "ticket_group",
    entityId: id,
  });
}

/** Replace the member set of a group (validates users are in the tenant). */
export async function setMembers(ctx: AuthContext, groupId: string, userIds: string[]) {
  requireAgent(ctx);
  const [group] = await db
    .select({ id: ticketGroups.id })
    .from(ticketGroups)
    .where(and(eq(ticketGroups.id, groupId), eq(ticketGroups.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!group) throw ApiError.notFound();
  const unique = [...new Set(userIds)].slice(0, 200);
  if (unique.length) {
    const valid = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArraySafe(users.id, unique), eq(users.organizationId, ctx.user.organizationId)));
    if (valid.length !== unique.length) throw ApiError.badRequest("Some members are not in this organization");
  }
  await db.transaction(async (tx) => {
    await tx
      .delete(ticketGroupMembers)
      .where(and(eq(ticketGroupMembers.groupId, groupId), eq(ticketGroupMembers.organizationId, ctx.user.organizationId)));
    if (unique.length) {
      await tx.insert(ticketGroupMembers).values(
        unique.map((uid) => ({ groupId, userId: uid, organizationId: ctx.user.organizationId })),
      );
    }
  });
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "TICKET_GROUP_MEMBERS_SET",
    entityType: "ticket_group",
    entityId: groupId,
    newValue: { memberCount: unique.length },
  });
}

// ---------- assignment rules ----------

export async function listRules(ctx: AuthContext) {
  requireAgent(ctx);
  return db
    .select({
      id: assignmentRules.id,
      name: assignmentRules.name,
      groupId: assignmentRules.groupId,
      groupName: ticketGroups.name,
      category: assignmentRules.category,
      active: assignmentRules.active,
      createdAt: assignmentRules.createdAt,
    })
    .from(assignmentRules)
    .leftJoin(ticketGroups, eq(ticketGroups.id, assignmentRules.groupId))
    .where(eq(assignmentRules.organizationId, ctx.user.organizationId))
    .orderBy(desc(assignmentRules.createdAt));
}

export async function createRule(
  ctx: AuthContext,
  input: { name: string; groupId?: string | null; category?: string },
) {
  requireAgent(ctx);
  const category = input.category && CATEGORIES.has(input.category) ? input.category : null;
  const groupId = input.groupId ?? null;
  if (groupId) {
    const [g] = await db
      .select({ id: ticketGroups.id })
      .from(ticketGroups)
      .where(and(eq(ticketGroups.id, groupId), eq(ticketGroups.organizationId, ctx.user.organizationId)))
      .limit(1);
    if (!g) throw ApiError.badRequest("Group not found");
  }
  const inserted = await db
    .insert(assignmentRules)
    .values({
      organizationId: ctx.user.organizationId,
      name: input.name.trim().slice(0, 100),
      groupId,
      category,
    })
    .returning({ id: assignmentRules.id });
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "ASSIGNMENT_RULE_CREATED",
    entityType: "assignment_rule",
    entityId: inserted[0]!.id,
    newValue: { name: input.name, category },
  });
  return inserted[0]!;
}

export async function updateRule(
  ctx: AuthContext,
  id: string,
  input: { active?: boolean; category?: string | null; groupId?: string | null },
) {
  requireAgent(ctx);
  const patch: Partial<typeof assignmentRules.$inferSelect> = {};
  if (input.active !== undefined) patch.active = input.active;
  if (input.category !== undefined) {
    patch.category = input.category && CATEGORIES.has(input.category) ? input.category : null;
  }
  if (input.groupId !== undefined) patch.groupId = input.groupId;
  const updated = await db
    .update(assignmentRules)
    .set(patch)
    .where(and(eq(assignmentRules.id, id), eq(assignmentRules.organizationId, ctx.user.organizationId)))
    .returning({ id: assignmentRules.id });
  if (!updated[0]) throw ApiError.notFound();
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "ASSIGNMENT_RULE_UPDATED",
    entityType: "assignment_rule",
    entityId: id,
    newValue: { ...patch },
  });
}

export async function deleteRule(ctx: AuthContext, id: string) {
  requireAgent(ctx);
  const deleted = await db
    .delete(assignmentRules)
    .where(and(eq(assignmentRules.id, id), eq(assignmentRules.organizationId, ctx.user.organizationId)))
    .returning({ id: assignmentRules.id });
  if (!deleted[0]) throw ApiError.notFound();
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "ASSIGNMENT_RULE_DELETED",
    entityType: "assignment_rule",
    entityId: id,
  });
}

// ---------- auto-assignment on create ----------

/**
 * Server-side routing: pick the first active rule whose category matches the
 * new ticket (rules without a category apply to everything), assign its group
 * and the member with the fewest open tickets. Never throws — a failed rule
 * must not break ticket creation.
 */
export async function autoAssignOnCreate(
  orgId: string,
  ticketId: string,
  category: string,
): Promise<void> {
  try {
    const rules = await db
      .select({ id: assignmentRules.id, groupId: assignmentRules.groupId })
      .from(assignmentRules)
      .where(
        and(
          eq(assignmentRules.organizationId, orgId),
          eq(assignmentRules.active, true),
          or(isNull(assignmentRules.category), eq(assignmentRules.category, category)),
        ),
      )
      .orderBy(asc(assignmentRules.createdAt))
      .limit(5);
    const rule = rules.find((r) => r.groupId !== null) ?? rules[0];
    if (!rule?.groupId) return;

    const members = await db
      .select({ userId: ticketGroupMembers.userId })
      .from(ticketGroupMembers)
      .where(and(eq(ticketGroupMembers.groupId, rule.groupId), eq(ticketGroupMembers.organizationId, orgId)));
    if (!members.length) return;

    // pick the member with the fewest open tickets
    const openCounts = await db
      .select({ assigneeId: tickets.assigneeId, n: sql<number>`count(*)::int` })
      .from(tickets)
      .where(
        and(
          eq(tickets.organizationId, orgId),
          sql`${tickets.status} NOT IN ('resolved', 'closed')`,
          inArraySafe(tickets.assigneeId, members.map((m) => m.userId)),
        ),
      )
      .groupBy(tickets.assigneeId);
    const countMap = new Map(openCounts.map((r) => [r.assigneeId, r.n]));
    let best = members[0]!.userId;
    let bestCount = Number.MAX_SAFE_INTEGER;
    for (const m of members) {
      const c = countMap.get(m.userId) ?? 0;
      if (c < bestCount) {
        bestCount = c;
        best = m.userId;
      }
    }

    await db
      .update(tickets)
      .set({ assigneeId: best, groupId: rule.groupId })
      .where(and(eq(tickets.id, ticketId), eq(tickets.organizationId, orgId)));
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "auto_assign_failed", orgId, ticketId, err: String(e) }));
  }
}

// small helper: drizzle inArray needs non-empty arrays
function inArraySafe(col: Parameters<typeof inArray>[0], values: string[]) {
  return values.length ? inArray(col, values) : sql`false`;
}