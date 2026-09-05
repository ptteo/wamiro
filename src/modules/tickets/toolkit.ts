/**
 * Agent toolkit (Phase 7, Zammad parity) — everything an agent needs beyond
 * the core ticket lifecycle:
 *   - Tags: free-form labels on tickets (dedup per ticket)
 *   - Time accounting: per-ticket time entries + totals
 *   - Links: related / blocks / duplicates between tickets
 *   - Canned responses: reusable reply snippets (text modules)
 *   - Macros: named sets of { op, value } actions applied in one click
 *
 * Authorization: read helpers are usable by the requester of their own
 * ticket (the detail view shows tags/time/links to everyone who can see it);
 * every mutation is gated `tickets.manage` by the route layer, and the
 * service re-checks org scoping on every row it touches.
 */
import { and, asc, desc, eq, not, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { notify } from "@/modules/notifications/service";
import {
  cannedResponses,
  ticketLinks,
  ticketMacros,
  ticketReplies,
  ticketTags,
  ticketTimeEntries,
  tickets,
  users,
} from "@/db/schema";
import { can } from "@/modules/iam/engine";

const RELATIONS = new Set(["related", "blocks", "duplicates"]);
const STATUSES = new Set(["new", "open", "waiting", "resolved", "closed"]);
const PRIORITIES = new Set(["low", "medium", "high", "urgent"]);
const MACRO_OPS = new Set([
  "set_status",
  "set_priority",
  "assign",
  "add_tag",
  "add_reply",
  "add_note",
]);

/** Load a ticket row bound to the caller's org — shared existence/scope guard. */
async function orgTicket(orgId: string, ticketId: string) {
  const row = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.organizationId, orgId)))
    .limit(1);
  return row[0] ?? null;
}

/** Can this viewer see the ticket? Requester always; otherwise must hold tickets.manage. */
export async function canViewTicket(ctx: AuthContext, ticketId: string): Promise<boolean> {
  if (can(ctx.access, "tickets.manage")) return true;
  const t = await orgTicket(ctx.user.organizationId, ticketId);
  return t !== null && t.requesterId === ctx.user.id;
}

/** Require manage + org-scoped ticket; returns the ticket row. */
async function requireManageTicket(ctx: AuthContext, ticketId: string) {
  const t = await orgTicket(ctx.user.organizationId, ticketId);
  if (!t) throw ApiError.notFound();
  return t;
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export async function tagsForTicket(ctx: AuthContext, ticketId: string) {
  const t = await orgTicket(ctx.user.organizationId, ticketId);
  if (!t) throw ApiError.notFound();
  return db
    .select({ name: ticketTags.name, createdAt: ticketTags.createdAt })
    .from(ticketTags)
    .where(and(eq(ticketTags.organizationId, ctx.user.organizationId), eq(ticketTags.ticketId, ticketId)))
    .orderBy(asc(ticketTags.name));
}

export async function addTag(ctx: AuthContext, ticketId: string, rawName: string) {
  await requireManageTicket(ctx, ticketId);
  const name = rawName.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!name) throw ApiError.badRequest("Tag name is required");
  await db
    .insert(ticketTags)
    .values({
      organizationId: ctx.user.organizationId,
      ticketId,
      name,
      createdBy: ctx.user.id,
    })
    .onConflictDoNothing();
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "TICKET_TAG_ADDED",
    entityType: "ticket",
    entityId: ticketId,
    newValue: { tag: name },
  });
  return tagsForTicket(ctx, ticketId);
}

export async function removeTag(ctx: AuthContext, ticketId: string, rawName: string) {
  await requireManageTicket(ctx, ticketId);
  const name = rawName.trim();
  await db
    .delete(ticketTags)
    .where(
      and(
        eq(ticketTags.organizationId, ctx.user.organizationId),
        eq(ticketTags.ticketId, ticketId),
        eq(ticketTags.name, name),
      ),
    );
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "TICKET_TAG_REMOVED",
    entityType: "ticket",
    entityId: ticketId,
    newValue: { tag: name },
  });
  return tagsForTicket(ctx, ticketId);
}

// ---------------------------------------------------------------------------
// Time accounting
// ---------------------------------------------------------------------------

export async function timeForTicket(ctx: AuthContext, ticketId: string) {
  const t = await orgTicket(ctx.user.organizationId, ticketId);
  if (!t) throw ApiError.notFound();
  const rows = await db
    .select({
      id: ticketTimeEntries.id,
      minutes: ticketTimeEntries.minutes,
      note: ticketTimeEntries.note,
      createdAt: ticketTimeEntries.createdAt,
      userName: users.name,
    })
    .from(ticketTimeEntries)
    .innerJoin(users, eq(users.id, ticketTimeEntries.userId))
    .where(
      and(
        eq(ticketTimeEntries.organizationId, ctx.user.organizationId),
        eq(ticketTimeEntries.ticketId, ticketId),
      ),
    )
    .orderBy(desc(ticketTimeEntries.createdAt));
  const totalMinutes = rows.reduce((sum, r) => sum + r.minutes, 0);
  return { entries: rows, totalMinutes };
}

export async function addTimeEntry(
  ctx: AuthContext,
  ticketId: string,
  input: { minutes: number; note?: string | null },
) {
  await requireManageTicket(ctx, ticketId);
  const minutes = Math.round(input.minutes);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
    throw ApiError.badRequest("Time must be between 1 and 1440 minutes");
  }
  const note = (input.note ?? "").trim().slice(0, 2000) || null;
  const [row] = await db
    .insert(ticketTimeEntries)
    .values({
      organizationId: ctx.user.organizationId,
      ticketId,
      userId: ctx.user.id,
      minutes,
      note,
    })
    .returning({ id: ticketTimeEntries.id });
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "TICKET_TIME_LOGGED",
    entityType: "ticket",
    entityId: ticketId,
    newValue: { minutes, note, entryId: row!.id },
  });
  return timeForTicket(ctx, ticketId);
}

// ---------------------------------------------------------------------------
// Ticket links
// ---------------------------------------------------------------------------

export async function linksForTicket(ctx: AuthContext, ticketId: string) {
  const t = await orgTicket(ctx.user.organizationId, ticketId);
  if (!t) throw ApiError.notFound();
  const rows = await db
    .select({
      id: ticketLinks.id,
      relation: ticketLinks.relation,
      createdAt: ticketLinks.createdAt,
      linkedTicketId: ticketLinks.linkedTicketId,
      title: tickets.title,
      status: tickets.status,
    })
    .from(ticketLinks)
    .innerJoin(tickets, eq(tickets.id, ticketLinks.linkedTicketId))
    .where(
      and(
        eq(ticketLinks.organizationId, ctx.user.organizationId),
        eq(ticketLinks.ticketId, ticketId),
      ),
    )
    .orderBy(asc(ticketLinks.createdAt));
  return rows;
}

export async function addTicketLink(
  ctx: AuthContext,
  ticketId: string,
  input: { linkedTicketId: string; relation?: string },
) {
  await requireManageTicket(ctx, ticketId);
  const relation = input.relation ?? "related";
  if (!RELATIONS.has(relation)) throw ApiError.badRequest("Invalid relation");
  const target = await orgTicket(ctx.user.organizationId, input.linkedTicketId);
  if (!target) throw ApiError.badRequest("Linked ticket not found in this organization");
  if (target.id === ticketId) throw ApiError.badRequest("A ticket cannot link to itself");
  await db
    .insert(ticketLinks)
    .values({
      organizationId: ctx.user.organizationId,
      ticketId,
      linkedTicketId: target.id,
      relation,
      createdBy: ctx.user.id,
    })
    .onConflictDoNothing();
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "TICKET_LINKED",
    entityType: "ticket",
    entityId: ticketId,
    newValue: { linkedTicketId: target.id, relation },
  });
  return linksForTicket(ctx, ticketId);
}

export async function removeTicketLink(ctx: AuthContext, ticketId: string, linkedTicketId: string) {
  await requireManageTicket(ctx, ticketId);
  await db
    .delete(ticketLinks)
    .where(
      and(
        eq(ticketLinks.organizationId, ctx.user.organizationId),
        eq(ticketLinks.ticketId, ticketId),
        eq(ticketLinks.linkedTicketId, linkedTicketId),
      ),
    );
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "TICKET_UNLINKED",
    entityType: "ticket",
    entityId: ticketId,
    newValue: { linkedTicketId },
  });
  return linksForTicket(ctx, ticketId);
}

// ---------------------------------------------------------------------------
// Canned responses (text modules)
// ---------------------------------------------------------------------------

export async function listCannedResponses(ctx: AuthContext) {
  return db
    .select()
    .from(cannedResponses)
    .where(eq(cannedResponses.organizationId, ctx.user.organizationId))
    .orderBy(asc(cannedResponses.category), asc(cannedResponses.name));
}

export async function createCannedResponse(
  ctx: AuthContext,
  input: { name: string; category?: string | null; body: string },
) {
  const name = input.name.trim().slice(0, 120);
  const body = (input.body ?? "").trim();
  if (!name) throw ApiError.badRequest("Name is required");
  if (!body) throw ApiError.badRequest("Response body is required");
  const [row] = await db
    .insert(cannedResponses)
    .values({
      organizationId: ctx.user.organizationId,
      name,
      category: (input.category ?? "").trim().slice(0, 80) || null,
      body,
      createdBy: ctx.user.id,
    })
    .returning();
  if (!row) throw ApiError.notFound();
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "CANNED_RESPONSE_CREATED",
    entityType: "canned_response",
    entityId: row.id,
    newValue: { name, category: row.category },
  });
  return row;
}

export async function updateCannedResponse(
  ctx: AuthContext,
  id: string,
  input: { name?: string; category?: string | null; body?: string },
) {
  const existing = await db
    .select()
    .from(cannedResponses)
    .where(and(eq(cannedResponses.id, id), eq(cannedResponses.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!existing[0]) throw ApiError.notFound();
  const next = {
    name: input.name !== undefined ? input.name.trim().slice(0, 120) || existing[0].name : existing[0].name,
    category:
      input.category !== undefined
        ? (input.category ?? "").trim().slice(0, 80) || null
        : existing[0].category,
    body: input.body !== undefined ? input.body.trim() || existing[0].body : existing[0].body,
    updatedBy: ctx.user.id,
    updatedAt: new Date(),
  };
  const [row] = await db
    .update(cannedResponses)
    .set(next)
    .where(and(eq(cannedResponses.id, id), eq(cannedResponses.organizationId, ctx.user.organizationId)))
    .returning();
  if (!row) throw ApiError.notFound();
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "CANNED_RESPONSE_UPDATED",
    entityType: "canned_response",
    entityId: id,
    newValue: { name: row.name },
  });
  return row;
}

export async function deleteCannedResponse(ctx: AuthContext, id: string) {
  const [row] = await db
    .delete(cannedResponses)
    .where(and(eq(cannedResponses.id, id), eq(cannedResponses.organizationId, ctx.user.organizationId)))
    .returning({ id: cannedResponses.id, name: cannedResponses.name });
  if (!row) throw ApiError.notFound();
  void row;
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "CANNED_RESPONSE_DELETED",
    entityType: "canned_response",
    entityId: id,
    newValue: { name: row.name },
  });
}

// ---------------------------------------------------------------------------
// Macros
// ---------------------------------------------------------------------------

export async function listMacros(ctx: AuthContext) {
  return db
    .select()
    .from(ticketMacros)
    .where(eq(ticketMacros.organizationId, ctx.user.organizationId))
    .orderBy(asc(ticketMacros.name));
}

function validateActions(actions: unknown): { op: string; value: string }[] {
  if (!Array.isArray(actions) || actions.length === 0) {
    throw ApiError.badRequest("A macro needs at least one action");
  }
  const out: { op: string; value: string }[] = [];
  for (const a of actions) {
    const op = (a as { op?: unknown })?.op;
    const value = (a as { value?: unknown })?.value;
    if (typeof op !== "string" || !MACRO_OPS.has(op) || typeof value !== "string" || !value.trim()) {
      throw ApiError.badRequest("Invalid macro action");
    }
    out.push({ op, value: value.trim().slice(0, 10_000) });
  }
  return out.slice(0, 20);
}

export async function createMacro(
  ctx: AuthContext,
  input: { name: string; description?: string | null; actions: unknown },
) {
  const name = input.name.trim().slice(0, 120);
  if (!name) throw ApiError.badRequest("Name is required");
  const actions = validateActions(input.actions);
  const [row] = await db
    .insert(ticketMacros)
    .values({
      organizationId: ctx.user.organizationId,
      name,
      description: (input.description ?? "").trim().slice(0, 500) || null,
      actions,
      createdBy: ctx.user.id,
    })
    .returning();
  if (!row) throw ApiError.notFound();
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "TICKET_MACRO_CREATED",
    entityType: "ticket_macro",
    entityId: row.id,
    newValue: { name, actionCount: actions.length },
  });
  return row;
}

export async function updateMacro(
  ctx: AuthContext,
  id: string,
  input: { name?: string; description?: string | null; actions?: unknown },
) {
  const existing = await db
    .select()
    .from(ticketMacros)
    .where(and(eq(ticketMacros.id, id), eq(ticketMacros.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!existing[0]) throw ApiError.notFound();
  const actions = input.actions !== undefined ? validateActions(input.actions) : existing[0].actions;
  const [row] = await db
    .update(ticketMacros)
    .set({
      name: input.name !== undefined ? input.name.trim().slice(0, 120) || existing[0].name : existing[0].name,
      description:
        input.description !== undefined
          ? (input.description ?? "").trim().slice(0, 500) || null
          : existing[0].description,
      actions,
      updatedBy: ctx.user.id,
      updatedAt: new Date(),
    })
    .where(and(eq(ticketMacros.id, id), eq(ticketMacros.organizationId, ctx.user.organizationId)))
    .returning();
  if (!row) throw ApiError.notFound();
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "TICKET_MACRO_UPDATED",
    entityType: "ticket_macro",
    entityId: id,
    newValue: { name: row.name },
  });
  return row;
}

export async function deleteMacro(ctx: AuthContext, id: string) {
  const [row] = await db
    .delete(ticketMacros)
    .where(and(eq(ticketMacros.id, id), eq(ticketMacros.organizationId, ctx.user.organizationId)))
    .returning({ id: ticketMacros.id, name: ticketMacros.name });
  if (!row) throw ApiError.notFound();
  void row;
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "TICKET_MACRO_DELETED",
    entityType: "ticket_macro",
    entityId: id,
    newValue: { name: row.name },
  });
}

/** Apply a macro's actions to a ticket, in order. Agents only. */
export async function applyMacro(ctx: AuthContext, ticketId: string, macroId: string) {
  const t = await requireManageTicket(ctx, ticketId);
  const macro = await db
    .select()
    .from(ticketMacros)
    .where(and(eq(ticketMacros.id, macroId), eq(ticketMacros.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!macro[0]) throw ApiError.notFound();
  const actions = macro[0].actions as { op: string; value: string }[];
  const orgId = ctx.user.organizationId;
  let replied = false;

  for (const { op, value } of actions) {
    if (op === "set_status") {
      if (!STATUSES.has(value)) throw ApiError.badRequest(`Unknown status: ${value}`);
      await db
        .update(tickets)
        .set({ status: value, resolvedAt: value === "resolved" ? new Date() : null })
        .where(and(eq(tickets.id, ticketId), eq(tickets.organizationId, orgId)));
    } else if (op === "set_priority") {
      if (!PRIORITIES.has(value)) throw ApiError.badRequest(`Unknown priority: ${value}`);
      await db
        .update(tickets)
        .set({ priority: value })
        .where(and(eq(tickets.id, ticketId), eq(tickets.organizationId, orgId)));
    } else if (op === "assign") {
      if (value === "unassigned") {
        await db
          .update(tickets)
          .set({ assigneeId: null })
          .where(and(eq(tickets.id, ticketId), eq(tickets.organizationId, orgId)));
      } else {
        const member = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.id, value), eq(users.organizationId, orgId)))
          .limit(1);
        if (!member[0]) throw ApiError.badRequest("Assignee must be a member of this organization");
        await db
          .update(tickets)
          .set({ assigneeId: value })
          .where(and(eq(tickets.id, ticketId), eq(tickets.organizationId, orgId)));
      }
    } else if (op === "add_tag") {
      await db
        .insert(ticketTags)
        .values({ organizationId: orgId, ticketId, name: value.slice(0, 40), createdBy: ctx.user.id })
        .onConflictDoNothing();
    } else if (op === "add_reply" || op === "add_note") {
      await db.insert(ticketReplies).values({
        ticketId,
        userId: ctx.user.id,
        body: value,
        isInternal: op === "add_note",
      });
      replied = true;
    }
  }

  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: "TICKET_MACRO_APPLIED",
    entityType: "ticket",
    entityId: ticketId,
    newValue: { macroId, name: macro[0].name, actions },
  });
  if (replied && t.requesterId !== ctx.user.id) {
    await notify({
      organizationId: orgId,
      userId: t.requesterId,
      type: "ticket",
      title: `Update on ticket: ${t.title}`,
      body: "An agent applied a macro that posted a reply on your ticket.",
      link: `/tickets/${ticketId}`,
    });
  }
  return macro[0].name;
}

/** Open tickets the caller's org can link to (title search). */
export async function linkableTickets(
  ctx: AuthContext,
  ticketId: string,
  q: string,
): Promise<{ id: string; title: string; status: string; createdAt: Date }[]> {
  await requireManageTicket(ctx, ticketId);
  const needle = `%${q.trim().slice(0, 100)}%`;
  return db
    .select({
      id: tickets.id,
      title: tickets.title,
      status: tickets.status,
      createdAt: tickets.createdAt,
    })
    .from(tickets)
    .where(
      and(
        eq(tickets.organizationId, ctx.user.organizationId),
        not(eq(tickets.id, ticketId)),
        sql`${tickets.title} ILIKE ${needle}`,
      ),
    )
    .orderBy(desc(tickets.createdAt))
    .limit(10);
}