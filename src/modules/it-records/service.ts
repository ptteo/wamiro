/**
 * IT records (F2.4) — D6 §15. Incident / Problem / Change management on top
 * of the native helpdesk. Records are agent-managed (tickets.manage) and can
 * be linked to any tenant ticket. The UI stays Wamiro-native.
 */
import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { itRecords, tickets, users } from "@/db/schema";
import { can } from "@/modules/iam/engine";

export const IT_TYPES = ["incident", "problem", "change"] as const;
export type ItType = (typeof IT_TYPES)[number];

export const STATUS_BY_TYPE: Record<ItType, string[]> = {
  incident: ["new", "investigating", "identified", "monitoring", "resolved", "closed"],
  problem: ["open", "investigating", "root_cause_identified", "known_error", "closed"],
  change: ["draft", "planned", "approved", "implemented", "verified", "rolled_back"],
};

export const PRIORITIES = new Set(["low", "medium", "high", "urgent"]);

function requireAgent(ctx: AuthContext) {
  if (!can(ctx.access, "tickets.manage")) throw ApiError.forbidden("Missing permission: tickets.manage");
}

function validStatus(type: ItType, status: string): boolean {
  return (STATUS_BY_TYPE[type] as readonly string[]).includes(status);
}

export async function listRecords(ctx: AuthContext, type: ItType) {
  requireAgent(ctx);
  return db
    .select({
      id: itRecords.id,
      type: itRecords.type,
      title: itRecords.title,
      impact: itRecords.impact,
      priority: itRecords.priority,
      status: itRecords.status,
      affectedService: itRecords.affectedService,
      ownerName: users.name,
      ticketCount: itRecords.ticketIds,
      createdAt: itRecords.createdAt,
      updatedAt: itRecords.updatedAt,
    })
    .from(itRecords)
    .leftJoin(users, eq(users.id, itRecords.ownerId))
    .where(and(eq(itRecords.organizationId, ctx.user.organizationId), eq(itRecords.type, type)))
    .orderBy(desc(itRecords.updatedAt))
    .limit(200);
}

const creatorUsers = alias(users, "it_record_creators");

export async function getRecord(ctx: AuthContext, id: string) {
  requireAgent(ctx);
  const [row] = await db
    .select({ r: itRecords, ownerName: users.name, createdByName: creatorUsers.name })
    .from(itRecords)
    .leftJoin(users, eq(users.id, itRecords.ownerId))
    .leftJoin(creatorUsers, eq(creatorUsers.id, itRecords.createdBy))
    .where(and(eq(itRecords.id, id), eq(itRecords.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!row) throw ApiError.notFound();
  return { ...row.r, ownerName: row.ownerName, createdByName: row.createdByName };
}

export async function createRecord(
  ctx: AuthContext,
  input: {
    type: ItType;
    title: string;
    description?: string;
    impact?: string;
    priority?: string;
    affectedService?: string;
    windowStart?: string;
    windowEnd?: string;
    risk?: string;
  },
) {
  requireAgent(ctx);
  if (!IT_TYPES.includes(input.type)) throw ApiError.badRequest("Invalid record type");
  const priority = PRIORITIES.has(input.priority ?? "") ? input.priority! : "medium";
  const inserted = await db
    .insert(itRecords)
    .values({
      organizationId: ctx.user.organizationId,
      type: input.type,
      title: input.title.trim().slice(0, 200),
      description: input.description?.trim().slice(0, 5000) || null,
      impact: input.impact?.trim().slice(0, 500) || null,
      priority,
      affectedService: input.affectedService?.trim().slice(0, 200) || null,
      windowStart: input.windowStart ? new Date(input.windowStart) : null,
      windowEnd: input.windowEnd ? new Date(input.windowEnd) : null,
      risk: input.risk?.trim().slice(0, 500) || null,
      createdBy: ctx.user.id,
    })
    .returning({ id: itRecords.id });
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: `IT_RECORD_CREATED`,
    entityType: `it_record`,
    entityId: inserted[0]!.id,
    newValue: { type: input.type, title: input.title, priority },
  });
  return inserted[0]!;
}

export async function updateStatus(ctx: AuthContext, id: string, status: string) {
  requireAgent(ctx);
  const [row] = await db
    .select({ id: itRecords.id, type: itRecords.type })
    .from(itRecords)
    .where(and(eq(itRecords.id, id), eq(itRecords.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!row) throw ApiError.notFound();
  if (!validStatus(row.type as ItType, status)) throw ApiError.badRequest(`Invalid status for ${row.type}`);
  await db
    .update(itRecords)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(itRecords.id, id), eq(itRecords.organizationId, ctx.user.organizationId)));
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: `IT_RECORD_STATUS_${status.toUpperCase()}`,
    entityType: "it_record",
    entityId: id,
    newValue: { status },
  });
}

export async function setOwner(ctx: AuthContext, id: string, ownerId: string | null) {
  requireAgent(ctx);
  const [row] = await db
    .select({ id: itRecords.id })
    .from(itRecords)
    .where(and(eq(itRecords.id, id), eq(itRecords.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!row) throw ApiError.notFound();
  if (ownerId !== null) {
    const [u] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, ownerId), eq(users.organizationId, ctx.user.organizationId)))
      .limit(1);
    if (!u) throw ApiError.badRequest("Owner must be a member of this organization");
  }
  await db
    .update(itRecords)
    .set({ ownerId, updatedAt: new Date() })
    .where(and(eq(itRecords.id, id), eq(itRecords.organizationId, ctx.user.organizationId)));
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "IT_RECORD_OWNER_SET",
    entityType: "it_record",
    entityId: id,
    newValue: { ownerId },
  });
}

export async function linkTicket(ctx: AuthContext, id: string, ticketId: string) {
  requireAgent(ctx);
  const [record] = await db
    .select({ id: itRecords.id, ticketIds: itRecords.ticketIds })
    .from(itRecords)
    .where(and(eq(itRecords.id, id), eq(itRecords.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!record) throw ApiError.notFound();
  const [t] = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!t) throw ApiError.badRequest("Ticket not found in this organization");
  const ids = record.ticketIds.includes(ticketId) ? record.ticketIds : [...record.ticketIds, ticketId];
  await db
    .update(itRecords)
    .set({ ticketIds: ids, updatedAt: new Date() })
    .where(and(eq(itRecords.id, id), eq(itRecords.organizationId, ctx.user.organizationId)));
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "IT_RECORD_TICKET_LINKED",
    entityType: "it_record",
    entityId: id,
    newValue: { ticketId },
  });
}

export async function unlinkTicket(ctx: AuthContext, id: string, ticketId: string) {
  requireAgent(ctx);
  const [record] = await db
    .select({ id: itRecords.id, ticketIds: itRecords.ticketIds })
    .from(itRecords)
    .where(and(eq(itRecords.id, id), eq(itRecords.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!record) throw ApiError.notFound();
  const ids = record.ticketIds.filter((x) => x !== ticketId);
  await db
    .update(itRecords)
    .set({ ticketIds: ids, updatedAt: new Date() })
    .where(and(eq(itRecords.id, id), eq(itRecords.organizationId, ctx.user.organizationId)));
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "IT_RECORD_TICKET_UNLINKED",
    entityType: "it_record",
    entityId: id,
    newValue: { ticketId },
  });
}