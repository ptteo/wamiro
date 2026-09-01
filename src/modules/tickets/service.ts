/**
 * Support tickets (Phase D6): IT service management with SLA tracking.
 * Requesters create and track; agents (tickets.manage holders) triage and resolve.
 */
import { and, asc, desc, eq, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { ticketReplies, tickets, users } from "@/db/schema";
import { can } from "@/modules/iam/engine";

const CATEGORIES = new Set(["incident", "service_request", "access", "hardware", "software", "other"]);
const PRIORITIES = new Set(["low", "medium", "high", "urgent"]);
const STATUSES = new Set(["new", "open", "waiting", "resolved", "closed"]);

const SLA_HOURS: Record<string, number> = { urgent: 4, high: 8, medium: 24, low: 48 };

/**
 * List tickets the viewer is authorized to see:
 * agents (tickets.manage) see the whole org queue; everyone else sees only
 * tickets they requested or are assigned to.
 */
export async function listTickets(ctx: AuthContext) {
  const isAgent = can(ctx.access, "tickets.manage");
  const visibility = isAgent
    ? eq(tickets.organizationId, ctx.user.organizationId)
    : and(
        eq(tickets.organizationId, ctx.user.organizationId),
        or(
          eq(tickets.requesterId, ctx.user.id),
          eq(tickets.assigneeId, ctx.user.id),
        ),
      );
  return db
    .select({
      id: tickets.id,
      title: tickets.title,
      status: tickets.status,
      priority: tickets.priority,
      category: tickets.category,
      requesterName: users.name,
      slaDueDate: tickets.slaDueDate,
      createdAt: tickets.createdAt,
    })
    .from(tickets)
    .innerJoin(users, eq(users.id, tickets.requesterId))
    .where(visibility)
    .orderBy(desc(tickets.createdAt))
    .limit(100);
}

export async function getTicket(ctx: AuthContext, id: string) {
  const [t] = await db.select().from(tickets).where(and(eq(tickets.id, id), eq(tickets.organizationId, ctx.user.organizationId))).limit(1);
  if (!t) throw ApiError.notFound();

  const isAgent = can(ctx.access, "tickets.manage");
  const canView = t.requesterId === ctx.user.id || t.assigneeId === ctx.user.id || isAgent;
  if (!canView) throw ApiError.forbidden();

  const replies = await db
    .select({
      id: ticketReplies.id,
      body: ticketReplies.body,
      isInternal: ticketReplies.isInternal,
      userName: users.name,
      createdAt: ticketReplies.createdAt,
    })
    .from(ticketReplies)
    .innerJoin(users, eq(users.id, ticketReplies.userId))
    .where(eq(ticketReplies.ticketId, id))
    .orderBy(asc(ticketReplies.createdAt));

  return { ...t, replies: replies.filter((r) => !r.isInternal || isAgent) };
}

export async function createTicket(
  ctx: AuthContext,
  input: { title: string; description: string; category?: string; priority?: string },
) {
  const orgId = ctx.user.organizationId;
  const category = CATEGORIES.has(input.category ?? "") ? input.category! : "other";
  const priority = PRIORITIES.has(input.priority ?? "") ? input.priority! : "medium";
  const slaHours = SLA_HOURS[priority] ?? 24;

  const inserted = await db
    .insert(tickets)
    .values({
      organizationId: orgId,
      title: input.title.trim().slice(0, 300),
      description: input.description.trim().slice(0, 10_000),
      category,
      priority,
      requesterId: ctx.user.id,
      slaDueDate: new Date(Date.now() + slaHours * 3_600_000),
    })
    .returning({ id: tickets.id });
  const row = inserted[0];
  if (!row) throw new Error("Insert returned no row");

  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: "TICKET_CREATED",
    entityType: "ticket",
    entityId: row.id,
    newValue: { title: input.title, category, priority },
  });

  return row;
}

export async function updateStatus(ctx: AuthContext, ticketId: string, status: string) {
  if (!STATUSES.has(status)) throw ApiError.badRequest("Invalid status");

  const [t] = await db
    .select({ requesterId: tickets.requesterId })
    .from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!t) throw ApiError.notFound();

  const isAgent = can(ctx.access, "tickets.manage");
  if (!isAgent && t.requesterId !== ctx.user.id) throw ApiError.forbidden();

  await db.update(tickets).set({ status }).where(eq(tickets.id, ticketId));

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: `TICKET_${status.toUpperCase()}`,
    entityType: "ticket",
    entityId: ticketId,
  });
}

export async function addReply(
  ctx: AuthContext,
  ticketId: string,
  body: string,
  isInternal: boolean,
) {
  const [t] = await db
    .select({ requesterId: tickets.requesterId })
    .from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!t) throw ApiError.notFound();

  const isAgent = can(ctx.access, "tickets.manage");
  if (!isAgent && t.requesterId !== ctx.user.id) throw ApiError.forbidden();
  if (isInternal && !isAgent) isInternal = false;

  await db.insert(ticketReplies).values({
    ticketId,
    userId: ctx.user.id,
    body: body.trim().slice(0, 10_000),
    isInternal,
  });
}
