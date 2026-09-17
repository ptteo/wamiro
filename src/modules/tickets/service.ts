/**
 * Support tickets (Phase D6): IT service management with SLA tracking.
 * Requesters create and track; agents (tickets.manage holders) triage and resolve.
 *
 * Implementation-plan Phase 1 (native helpdesk): full SLA engine (first
 * response + resolution deadlines, breach state, one-time warning/breach
 * notifications), assignment, CSAT — a Zammad-parity helpdesk with no
 * external dependency. SLA math is pure (`slaStateOf` / `slaBucketOf`) and
 * unit-tested in `sla.test.ts`.
 */
import { and, asc, desc, eq, gt, inArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { notify } from "@/modules/notifications/service";
import { knowledgeArticles, ticketReplies, tickets, users } from "@/db/schema";
import { can } from "@/modules/iam/engine";

const CATEGORIES = new Set(["incident", "service_request", "access", "hardware", "software", "platform", "other"]);
const PRIORITIES = new Set(["low", "medium", "high", "urgent"]);
const STATUSES = new Set(["new", "open", "waiting", "resolved", "closed"]);

/** Resolution SLA windows per priority (v1 SLA_HOURS, kept). */
export const SLA_RESOLUTION_HOURS: Record<string, number> = {
  urgent: 4,
  high: 8,
  medium: 24,
  low: 48,
};

/** First-response SLA windows per priority. */
export const SLA_FIRST_RESPONSE_HOURS: Record<string, number> = {
  urgent: 1,
  high: 4,
  medium: 8,
  low: 24,
};

export type SlaState = "ok" | "at_risk" | "breached";
export type SlaBucket = "healthy" | "due_soon" | "at_risk" | "breached";

export interface SlaInput {
  status: string;
  slaDueDate: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

/**
 * Coarser SLA bucket used by the dashboard: breached (past resolution
 * deadline), at_risk (< 25% of the window left), due_soon (25–50% left),
 * healthy (rest, including resolved-on-time and closed).
 */
export function slaBucketOf(t: SlaInput, now: Date = new Date()): SlaBucket {
  if (!t.slaDueDate || t.status === "closed") return "healthy";
  if (t.status === "resolved") {
    return t.resolvedAt && t.resolvedAt.getTime() <= t.slaDueDate.getTime()
      ? "healthy"
      : "breached";
  }
  const due = t.slaDueDate.getTime();
  if (now.getTime() >= due) return "breached";
  const total = due - t.createdAt.getTime();
  const remaining = due - now.getTime();
  if (total <= 0) return "at_risk";
  const ratio = remaining / total;
  if (ratio < 0.25) return "at_risk";
  if (ratio < 0.5) return "due_soon";
  return "healthy";
}

/** Authoritative SLA state — derived on every read. */
export function slaStateOf(t: SlaInput, now: Date = new Date()): SlaState {
  const bucket = slaBucketOf(t, now);
  return bucket === "breached" ? "breached" : bucket === "at_risk" ? "at_risk" : "ok";
}

/** Persist the derived state so dashboard queries and notify-once guards work. */
async function persistSlaState(orgId: string, ticketId: string, state: SlaState): Promise<void> {
  await db
    .update(tickets)
    .set({ slaState: state })
    .where(and(eq(tickets.id, ticketId), eq(tickets.organizationId, orgId)));
}

const assigneeUsers = alias(users, "assignee_users");

/**
 * Opaque keyset cursor over (createdAt, id) — mirrors the audit trail (G-03).
 */
export interface TicketPageCursor {
  createdAt: Date;
  id: string;
}

export function encodeTicketCursor(row: { createdAt: Date | string; id: string }): string {
  return Buffer.from(JSON.stringify([new Date(row.createdAt).toISOString(), row.id]), "utf8").toString("base64url");
}

export function decodeTicketCursor(raw: string | null | undefined): TicketPageCursor | undefined {
  if (!raw) return undefined;
  try {
    const [t, id] = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as [string, string];
    const d = new Date(t);
    if (!Number.isFinite(d.getTime()) || !id) return undefined;
    return { createdAt: d, id };
  } catch {
    return undefined;
  }
}

export interface TicketListResult {
  tickets: Awaited<ReturnType<typeof mapTicketRows>>;
  /** Pass as `before` to fetch the next page; null when exhausted. */
  nextCursor: string | null;
  /** Total matching rows for the current filters (ignores the cursor). */
  total: number;
}

async function mapTicketRows(rows: {
  id: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  requesterName: string | null;
  assigneeName: string | null;
  slaDueDate: Date | null;
  firstResponseDueAt: Date | null;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  csatScore: number | null;
  createdAt: Date;
}[]) {
  return rows.map((r) => ({ ...r, slaState: slaStateOf(r) }));
}

/**
 * List tickets the viewer is authorized to see:
 * agents (tickets.manage) see the whole org queue; everyone else sees only
 * tickets they requested or are assigned to.
 *
 * G-15: keyset pagination on (createdAt, id) with a total count — the queue
 * UI no longer silently hides older tickets past the cap. The `sla` filter is
 * applied in SQL for state buckets (breached = past due, unresolved), and
 * derived states match on the page (at_risk/due_soon are ratio-derived).
 */
export async function listTickets(
  ctx: AuthContext,
  opts: { status?: string; sla?: SlaState; before?: TicketPageCursor; limit?: number } = {},
): Promise<TicketListResult> {
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
  const conds: (SQL | undefined)[] = [visibility];
  if (opts.status) conds.push(eq(tickets.status, opts.status));
  if (opts.sla === "breached") {
    conds.push(sql`${tickets.status} NOT IN ('resolved', 'closed')`);
    conds.push(sql`${tickets.slaDueDate} IS NOT NULL AND ${tickets.slaDueDate} < now()`);
  } else if (opts.sla) {
    conds.push(sql`${tickets.status} NOT IN ('resolved', 'closed')`);
  }
  if (opts.before) {
    conds.push(
      sql`(${tickets.createdAt}, ${tickets.id}) < (${opts.before.createdAt.toISOString()}::timestamptz, ${opts.before.id}::uuid)`,
    );
  }
  const limit = Math.min(Math.max(1, opts.limit ?? 50), 200);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: tickets.id,
        title: tickets.title,
        status: tickets.status,
        priority: tickets.priority,
        category: tickets.category,
        requesterName: users.name,
        assigneeName: assigneeUsers.name,
        slaDueDate: tickets.slaDueDate,
        firstResponseDueAt: tickets.firstResponseDueAt,
        firstResponseAt: tickets.firstResponseAt,
        resolvedAt: tickets.resolvedAt,
        csatScore: tickets.csatScore,
        createdAt: tickets.createdAt,
      })
      .from(tickets)
      .innerJoin(users, eq(users.id, tickets.requesterId))
      .leftJoin(assigneeUsers, eq(assigneeUsers.id, tickets.assigneeId))
      .where(and(...conds))
      .orderBy(desc(tickets.createdAt), desc(tickets.id))
      .limit(limit + 1),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(tickets)
      .where(and(...conds)),
  ]);

  const hasMore = rows.length > limit;
  if (hasMore) rows.length = limit;
  const mapped = await mapTicketRows(rows);
  const ticketsOut =
    // resolved/closed rows only matter for non-bucketed states; ratio states are derived per row
    opts.sla && opts.sla !== "breached" ? mapped.filter((r) => r.slaState === opts.sla) : mapped;
  return {
    tickets: ticketsOut,
    nextCursor: hasMore && rows.length > 0 ? encodeTicketCursor(rows[rows.length - 1]!) : null,
    total: countRows[0]?.c ?? 0,
  };
}

export async function getTicket(ctx: AuthContext, id: string) {
  const [row] = await db
    .select({ ticket: tickets, requesterName: users.name, assigneeName: assigneeUsers.name })
    .from(tickets)
    .innerJoin(users, eq(users.id, tickets.requesterId))
    .leftJoin(assigneeUsers, eq(assigneeUsers.id, tickets.assigneeId))
    .where(and(eq(tickets.id, id), eq(tickets.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!row) throw ApiError.notFound();

  const isAgent = can(ctx.access, "tickets.manage");
  const canView = row.ticket.requesterId === ctx.user.id || row.ticket.assigneeId === ctx.user.id || isAgent;
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

  // F2.6 related knowledge articles (titles for the detail panel)
  const relatedKnowledge =
    row.ticket.relatedKnowledgeIds.length > 0
      ? await db
          .select({ id: knowledgeArticles.id, title: knowledgeArticles.title })
          .from(knowledgeArticles)
          .where(
            and(
              eq(knowledgeArticles.organizationId, ctx.user.organizationId),
              inArray(knowledgeArticles.id, row.ticket.relatedKnowledgeIds),
            ),
          )
          .limit(20)
      : [];

  return {
    ...row.ticket,
    requesterName: row.requesterName,
    assigneeName: row.assigneeName,
    slaState: slaStateOf(row.ticket),
    relatedKnowledge,
    replies: replies.filter((r) => !r.isInternal || isAgent),
  };
}

/** F2.6 — agents link knowledge articles to a ticket. */
export async function linkKnowledge(
  ctx: AuthContext,
  ticketId: string,
  knowledgeIds: string[],
): Promise<void> {
  if (!can(ctx.access, "tickets.manage")) throw ApiError.forbidden("Missing permission: tickets.manage");
  const [t] = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!t) throw ApiError.notFound();
  const unique = [...new Set(knowledgeIds)].slice(0, 20);
  if (unique.length) {
    const valid = await db
      .select({ id: knowledgeArticles.id })
      .from(knowledgeArticles)
      .where(and(eq(knowledgeArticles.organizationId, ctx.user.organizationId), inArray(knowledgeArticles.id, unique)));
    if (valid.length !== unique.length) throw ApiError.badRequest("Some knowledge articles are not in this organization");
  }
  await db
    .update(tickets)
    .set({ relatedKnowledgeIds: unique })
    .where(and(eq(tickets.id, ticketId), eq(tickets.organizationId, ctx.user.organizationId)));
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "TICKET_KNOWLEDGE_LINKED",
    entityType: "ticket",
    entityId: ticketId,
    newValue: { knowledgeIds: unique },
  });
}

export async function createTicket(
  ctx: AuthContext,
  input: { title: string; description: string; category?: string; priority?: string },
) {
  return createTicketRecord(ctx.user.organizationId, ctx.user.id, input);
}

/**
 * Core ticket creation, actor-parametrized so system flows (email ingestion,
 * approved service requests, integrations) can create on a user's behalf.
 * Runs the assignment-rule router (F2.5) — never throws on router failure.
 */
export async function createTicketRecord(
  orgId: string,
  actorUserId: string,
  input: { title: string; description: string; category?: string; priority?: string },
) {
  const category = CATEGORIES.has(input.category ?? "") ? input.category! : "other";
  const priority = PRIORITIES.has(input.priority ?? "") ? input.priority! : "medium";
  const resolutionHours = SLA_RESOLUTION_HOURS[priority] ?? 24;
  const firstResponseHours = SLA_FIRST_RESPONSE_HOURS[priority] ?? 8;
  const now = Date.now();

  const inserted = await db
    .insert(tickets)
    .values({
      organizationId: orgId,
      title: input.title.trim().slice(0, 300),
      description: input.description.trim().slice(0, 10_000),
      category,
      priority,
      requesterId: actorUserId,
      slaDueDate: new Date(now + resolutionHours * 3_600_000),
      firstResponseDueAt: new Date(now + firstResponseHours * 3_600_000),
    })
    .returning({ id: tickets.id });
  const row = inserted[0];
  if (!row) throw new Error("Insert returned no row");

  await audit({
    organizationId: orgId,
    actorUserId,
    action: "TICKET_CREATED",
    entityType: "ticket",
    entityId: row.id,
    newValue: { title: input.title, category, priority, resolutionHours, firstResponseHours },
  });

  // F2.5 assignment-rule router (best-effort)
  try {
    const { autoAssignOnCreate } = await import("@/modules/ticket-groups/service");
    await autoAssignOnCreate(orgId, row.id, category);
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "auto_assign_hook_failed", orgId, ticketId: row.id, err: String(e) }));
  }

  // Phase 8 — per-group SLA windows + business-hours calendar (best-effort,
  // runs after routing so the group is known; defaults already applied above).
  try {
    const { applyGroupSla } = await import("@/modules/tickets/policy");
    await applyGroupSla(orgId, row.id);
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "group_sla_hook_failed", orgId, ticketId: row.id, err: String(e) }));
  }

  return row;
}

export async function updateStatus(ctx: AuthContext, ticketId: string, status: string) {
  if (!STATUSES.has(status)) throw ApiError.badRequest("Invalid status");

  const [t] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!t) throw ApiError.notFound();

  const isAgent = can(ctx.access, "tickets.manage");
  if (!isAgent && t.requesterId !== ctx.user.id) throw ApiError.forbidden();

  const resolvedAt = status === "resolved" ? (t.resolvedAt ?? new Date()) : null;
  const next: Partial<typeof t> = { status };
  if (status === "resolved") next.resolvedAt = resolvedAt;
  const nextSla = slaStateOf({ ...t, status, resolvedAt: resolvedAt ?? t.resolvedAt });
  next.slaState = nextSla;
  await db.update(tickets).set(next).where(eq(tickets.id, ticketId));

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: `TICKET_${status.toUpperCase()}`,
    entityType: "ticket",
    entityId: ticketId,
    newValue: { slaState: nextSla },
  });

  // status-change notifications (skip when the actor is the recipient)
  if (t.requesterId !== ctx.user.id) {
    await notify({
      organizationId: ctx.user.organizationId,
      userId: t.requesterId,
      type: "ticket",
      title: status === "resolved" ? `Your ticket was resolved: ${t.title}` : `Ticket updated: ${t.title}`,
      body: status === "resolved" ? "Please confirm the fix worked, or reopen with details." : `Status changed to ${status}.`,
      link: `/tickets/${ticketId}`,
    });
  }
  if (t.assigneeId && t.assigneeId !== ctx.user.id && status === "resolved") {
    await notify({
      organizationId: ctx.user.organizationId,
      userId: t.assigneeId,
      type: "ticket",
      title: `Ticket resolved: ${t.title}`,
      body: "Resolution was marked on your assigned ticket.",
      link: `/tickets/${ticketId}`,
    });
  }
}

/** Assign (or unassign) a ticket to an agent in the same tenant. */
export async function assignTicket(
  ctx: AuthContext,
  ticketId: string,
  assigneeId: string | null,
) {
  if (!can(ctx.access, "tickets.manage")) throw ApiError.forbidden("Missing permission: tickets.manage");
  const [t] = await db
    .select({ id: tickets.id, title: tickets.title })
    .from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!t) throw ApiError.notFound();

  if (assigneeId !== null) {
    const [u] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, assigneeId), eq(users.organizationId, ctx.user.organizationId)))
      .limit(1);
    if (!u) throw ApiError.badRequest("Assignee must be a member of this organization");
  }

  await db.update(tickets).set({ assigneeId }).where(eq(tickets.id, ticketId));
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: assigneeId ? "TICKET_ASSIGNED" : "TICKET_UNASSIGNED",
    entityType: "ticket",
    entityId: ticketId,
    newValue: { assigneeId },
  });
  if (assigneeId && assigneeId !== ctx.user.id) {
    await notify({
      organizationId: ctx.user.organizationId,
      userId: assigneeId,
      type: "ticket",
      title: `Ticket assigned to you: ${t.title}`,
      body: "A support ticket was assigned to you.",
      link: `/tickets/${ticketId}`,
    });
  }
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
  await addReplyRecord(
    ctx.user.organizationId,
    ctx.user.id,
    ticketId,
    body,
    isInternal && isAgent,
    isAgent,
  );
}

/**
 * Actor-parametrized core so system flows (email ingestion) can reply.
 * `isAgent` controls first-response stamping + requester notifications;
 * `internal` is the stored flag (caller decides authorization).
 */
export async function addReplyRecord(
  orgId: string,
  actorUserId: string,
  ticketId: string,
  body: string,
  internal: boolean,
  isAgent: boolean,
): Promise<void> {
  const [t] = await db
    .select({ requesterId: tickets.requesterId, assigneeId: tickets.assigneeId, title: tickets.title, firstResponseAt: tickets.firstResponseAt })
    .from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.organizationId, orgId)))
    .limit(1);
  if (!t) throw ApiError.notFound();

  await db.insert(ticketReplies).values({
    ticketId,
    userId: actorUserId,
    body: body.trim().slice(0, 10_000),
    isInternal: internal,
  });

  // first-response SLA: stamped on the first agent reply
  if (isAgent && !t.firstResponseAt) {
    await db
      .update(tickets)
      .set({ firstResponseAt: new Date() })
      .where(and(eq(tickets.id, ticketId), eq(tickets.organizationId, orgId)));
  }

  await audit({
    organizationId: orgId,
    actorUserId,
    action: "TICKET_REPLIED",
    entityType: "ticket",
    entityId: ticketId,
    newValue: { isInternal: internal },
  });

  // conversation notifications (never for internal notes)
  if (!internal) {
    if (isAgent && t.requesterId !== actorUserId) {
      await notify({
        organizationId: orgId,
        userId: t.requesterId,
        type: "ticket",
        title: `New reply on your ticket: ${t.title}`,
        body: "Support responded to your ticket.",
        link: `/tickets/${ticketId}`,
      });
    } else if (!isAgent && t.assigneeId && t.assigneeId !== actorUserId) {
      await notify({
        organizationId: orgId,
        userId: t.assigneeId,
        type: "ticket",
        title: `New reply on ticket: ${t.title}`,
        body: "The requester replied to a ticket you own.",
        link: `/tickets/${ticketId}`,
      });
    }
  }
}

/** CSAT: requester rates their resolved/closed ticket (1–5 stars + comment). */
export async function submitCsat(
  ctx: AuthContext,
  ticketId: string,
  score: number,
  comment?: string,
) {
  const [t] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!t) throw ApiError.notFound();
  if (t.requesterId !== ctx.user.id) throw ApiError.forbidden("Only the requester can rate this ticket");
  if (!["resolved", "closed"].includes(t.status)) {
    throw ApiError.badRequest("CSAT is available after the ticket is resolved");
  }
  const s = Math.round(Number(score));
  if (!Number.isInteger(s) || s < 1 || s > 5) throw ApiError.badRequest("Score must be 1–5");

  await db
    .update(tickets)
    .set({ csatScore: s, csatComment: comment?.trim().slice(0, 1000) || null })
    .where(eq(tickets.id, ticketId));
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "TICKET_CSAT_SUBMITTED",
    entityType: "ticket",
    entityId: ticketId,
    newValue: { score: s },
  });
}

/**
 * Agent-only SLA sweep: recompute persisted state for open tickets and fire
 * the one-time at-risk / breached notifications. Called by the SLA dashboard
 * on load and available as a script hook later.
 */
export async function sweepSlaStates(ctx: AuthContext): Promise<{
  checked: number;
  updated: number;
  warned: number;
  breached: number;
}> {
  if (!can(ctx.access, "tickets.manage")) throw ApiError.forbidden("Missing permission: tickets.manage");
  return sweepOrgSlaStates(ctx.user.organizationId);
}

/**
 * Phase F: org-agnostic SLA sweep used by the background jobs worker.
 * Notify-once guards (sla_warning_notified_at / breach_notified_at) make it
 * idempotent, so overlapping or repeated runs are harmless.
 *
 * G-14 — notification batching: instead of one `notify()` per ticket (a mass
 * breach after an outage would flood recipients AND the worker), warnings and
 * breaches are grouped per recipient into one digest notification each, and
 * the per-run send volume is capped (`SLA_NOTIFY_CAP_PER_RUN`). The notify-once
 * stamps are written when the batch is built, so capped-out tickets stay
 * idempotent and are NOT re-notified on the next tick — a second digest for
 * the remainder only fires if a NEW ticket crosses the threshold later.
 */
const SLA_NOTIFY_CAP_PER_RUN = Number(process.env.SLA_NOTIFY_CAP_PER_RUN ?? 50);

export async function sweepOrgSlaStates(orgId: string): Promise<{
  checked: number;
  updated: number;
  warned: number;
  breached: number;
}> {
  const orgIdScope = orgId;
  const result = { checked: 0, updated: 0, warned: 0, breached: 0 };
  const now = new Date();
  const PAGE = 200;
  const MAX_PAGES = 50; // 10k open tickets/org per tick; remainder waits for the next run
  let afterId: string | undefined;

  // G-14 — per-recipient batches built during the scan, flushed once at the end.
  const warnBatch = new Map<string, string[]>(); // userId → ticket titles
  const breachBatch = new Map<string, string[]>();
  let sendCount = 0;
  let cappedOut = false;

  const pushTo = (batch: Map<string, string[]>, userId: string | null | undefined, title: string) => {
    if (!userId) return;
    if (sendCount >= SLA_NOTIFY_CAP_PER_RUN) {
      cappedOut = true;
      return; // cap reached: skip notification, keep the state stamp
    }
    const list = batch.get(userId) ?? [];
    if (list.length >= 20) return; // per-recipient digest size cap
    list.push(title);
    batch.set(userId, list);
    sendCount += 1;
  };

  for (let page = 0; page < MAX_PAGES; page++) {
    const open = await db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.organizationId, orgIdScope),
          sql`${tickets.status} NOT IN ('resolved', 'closed')`,
          afterId ? gt(tickets.id, afterId) : undefined,
        ),
      )
      .orderBy(asc(tickets.id))
      .limit(PAGE);
    if (open.length === 0) break;
    afterId = open[open.length - 1]!.id;
    result.checked += open.length;
    for (const t of open) {
      const state = slaStateOf(t, now);
      if (state !== t.slaState) {
        await persistSlaState(orgIdScope, t.id, state);
        result.updated++;
      }
      if (state === "at_risk" && !t.slaWarningNotifiedAt) {
        await db
          .update(tickets)
          .set({ slaWarningNotifiedAt: now })
          .where(and(eq(tickets.id, t.id), eq(tickets.organizationId, orgIdScope)));
        result.warned++;
        pushTo(warnBatch, t.assigneeId ?? t.requesterId, t.title);
      } else if (state === "breached" && !t.breachNotifiedAt) {
        await db
          .update(tickets)
          .set({ breachNotifiedAt: now })
          .where(and(eq(tickets.id, t.id), eq(tickets.organizationId, orgIdScope)));
        result.breached++;
        // recipient set per ticket: assignee first, requester second (deduped)
        for (const userId of new Set([t.assigneeId, t.requesterId].filter((id): id is string => !!id))) {
          pushTo(breachBatch, userId, t.title);
        }
      }
    }
  }

  // G-14 — flush one digest notification per recipient per severity.
  const flush = async (
    batch: Map<string, string[]>,
    kind: "at risk" | "breached",
    bodyFor: (n: number) => string,
    link: string,
  ) => {
    for (const [userId, titles] of batch) {
      if (titles.length === 0) continue;
      const first = titles[0]!;
      const rest = titles.length - 1;
      try {
        await notify({
          organizationId: orgIdScope,
          userId,
          type: "ticket",
          title:
            titles.length === 1
              ? `SLA ${kind}: ${first}`
              : `${titles.length} tickets ${kind === "at risk" ? "approaching" : "past"} SLA`,
          body: titles.length === 1 ? bodyFor(1) + first : `${bodyFor(titles.length)} ${first}${rest > 0 ? ` and ${rest} more` : ""}`,
          link,
        });
      } catch (e) {
        console.error(JSON.stringify({ level: "error", msg: "sla_digest_notify_failed", orgId: orgIdScope, userId, err: String(e).slice(0, 150) }));
      }
    }
  };
  await flush(warnBatch, "at risk", (n) => (n === 1 ? "Resolution is due soon. " : "Resolution is due soon for"), "/tickets");
  await flush(breachBatch, "breached", (n) => (n === 1 ? "Resolution is overdue. " : `${n} tickets are overdue, including`), "/tickets");
  if (cappedOut) {
    console.log(JSON.stringify({ level: "warn", msg: "sla_notify_cap_reached", orgId: orgIdScope, cap: SLA_NOTIFY_CAP_PER_RUN }));
  }
  return result;
}

/** Agent-only open-ticket queue for the SLA dashboard, worst deadline first. */
export async function listOpenForSla(ctx: AuthContext) {
  if (!can(ctx.access, "tickets.manage")) throw ApiError.forbidden("Missing permission: tickets.manage");
  return db
    .select({
      id: tickets.id,
      title: tickets.title,
      status: tickets.status,
      priority: tickets.priority,
      category: tickets.category,
      requesterName: users.name,
      assigneeName: assigneeUsers.name,
      slaDueDate: tickets.slaDueDate,
      resolvedAt: tickets.resolvedAt,
      createdAt: tickets.createdAt,
    })
    .from(tickets)
    .innerJoin(users, eq(users.id, tickets.requesterId))
    .leftJoin(assigneeUsers, eq(assigneeUsers.id, tickets.assigneeId))
    .where(
      and(
        eq(tickets.organizationId, ctx.user.organizationId),
        sql`${tickets.status} NOT IN ('resolved', 'closed')`,
      ),
    )
    .orderBy(asc(tickets.slaDueDate))
    .limit(300);
}

/** Active org members for the agent assignee picker (same tenant only). */
export async function listAssignableUsers(ctx: AuthContext) {
  if (!can(ctx.access, "tickets.manage")) throw ApiError.forbidden("Missing permission: tickets.manage");
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.organizationId, ctx.user.organizationId), eq(users.status, "active")))
    .orderBy(asc(users.name))
    .limit(200);
}