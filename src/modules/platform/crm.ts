/**
 * Admin panel Phase C — CRM-lite: tenant notes + touchpoints + timeline.
 *
 * Tables are OPERATIONAL class (§2.2): hard FK CASCADE — they belong to the
 * tenant relationship and die with the tenant. System touchpoints auto-log
 * platform-side comms (broadcasts received, dunning emails) so the timeline
 * answers "what have we sent this tenant lately?" without extra plumbing.
 *
 * The merged timeline (§4.1) joins CRM rows with platform-level audit events
 * (plan changes, impersonation windows, suspend/reactivate, billing status).
 * Tenant-facing surfaces never read the platform schema.
 */
import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import { organizations, platformTenantNotes, platformTenantTouchpoints, users } from "@/db/schema";
import { requirePlatform } from "./console";
import type { AuthContext } from "@/lib/session";

export const TOUCHPOINT_KINDS = ["call", "email", "meeting", "demo"] as const;
export type TouchpointKind = (typeof TOUCHPOINT_KINDS)[number];

function assertTouchpointKind(kind: string): asserts kind is TouchpointKind {
  if (!(TOUCHPOINT_KINDS as readonly string[]).includes(kind)) {
    throw ApiError.badRequest("kind must be call|email|meeting|demo");
  }
}

async function orgExists(orgId: string): Promise<boolean> {
  const [row] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return Boolean(row);
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

/** Operator notes on a tenant (pinned notes float to the top). */
export async function listNotes(ctx: AuthContext, orgId: string) {
  requirePlatform(ctx);
  const rows = await db
    .select({
      id: platformTenantNotes.id,
      body: platformTenantNotes.body,
      pinned: platformTenantNotes.pinned,
      createdByName: users.name,
      createdAt: platformTenantNotes.createdAt,
    })
    .from(platformTenantNotes)
    .leftJoin(users, eq(users.id, platformTenantNotes.createdBy))
    .where(eq(platformTenantNotes.orgId, orgId))
    .orderBy(desc(platformTenantNotes.pinned), desc(platformTenantNotes.createdAt))
    .limit(200);
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    pinned: r.pinned,
    createdByName: r.createdByName ?? "—",
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function createNote(ctx: AuthContext, orgId: string, input: { body: string; pinned?: boolean }) {
  requirePlatform(ctx);
  const body = String(input.body ?? "").trim();
  if (body.length < 2) throw ApiError.badRequest("Note body is required");
  if (!(await orgExists(orgId))) throw ApiError.notFound("Organization not found");

  const [row] = await db
    .insert(platformTenantNotes)
    .values({ orgId, body: body.slice(0, 5000), pinned: Boolean(input.pinned), createdBy: ctx.user.id })
    .returning();

  await audit({
    organizationId: null,
    actorUserId: ctx.user.id,
    action: "PLATFORM_TENANT_NOTE_CREATED",
    entityType: "platform_tenant_note",
    entityId: row!.id,
    newValue: { orgId, pinned: Boolean(input.pinned) },
  });
  return { id: row!.id, createdAt: row!.createdAt.toISOString() };
}

export async function updateNote(ctx: AuthContext, noteId: string, input: { pinned?: boolean; body?: string }) {
  requirePlatform(ctx);
  const patch: { pinned?: boolean; body?: string } = {};
  if (input.pinned !== undefined) patch.pinned = Boolean(input.pinned);
  if (input.body !== undefined) {
    const body = String(input.body ?? "").trim();
    if (body.length < 2) throw ApiError.badRequest("Note body is required");
    patch.body = body.slice(0, 5000);
  }
  if (Object.keys(patch).length === 0) throw ApiError.badRequest("Nothing to update");

  const updated = await db
    .update(platformTenantNotes)
    .set(patch)
    .where(eq(platformTenantNotes.id, noteId))
    .returning({ id: platformTenantNotes.id });
  if (!updated[0]) throw ApiError.notFound("Note not found");

  await audit({
    organizationId: null,
    actorUserId: ctx.user.id,
    action: "PLATFORM_TENANT_NOTE_UPDATED",
    entityType: "platform_tenant_note",
    entityId: noteId,
    newValue: patch,
  });
}

export async function deleteNote(ctx: AuthContext, noteId: string) {
  requirePlatform(ctx);
  const deleted = await db
    .delete(platformTenantNotes)
    .where(eq(platformTenantNotes.id, noteId))
    .returning({ id: platformTenantNotes.id });
  if (!deleted[0]) throw ApiError.notFound("Note not found");

  await audit({
    organizationId: null,
    actorUserId: ctx.user.id,
    action: "PLATFORM_TENANT_NOTE_DELETED",
    entityType: "platform_tenant_note",
    entityId: noteId,
  });
}

// ---------------------------------------------------------------------------
// Touchpoints
// ---------------------------------------------------------------------------

/** CRM touchpoints: calls, emails, meetings, demos (operator- or system-logged). */
export async function listTouchpoints(ctx: AuthContext, orgId: string) {
  requirePlatform(ctx);
  const rows = await db
    .select({
      id: platformTenantTouchpoints.id,
      kind: platformTenantTouchpoints.kind,
      summary: platformTenantTouchpoints.summary,
      source: platformTenantTouchpoints.source,
      occurredAt: platformTenantTouchpoints.occurredAt,
      createdByName: users.name,
    })
    .from(platformTenantTouchpoints)
    .leftJoin(users, eq(users.id, platformTenantTouchpoints.createdBy))
    .where(eq(platformTenantTouchpoints.orgId, orgId))
    .orderBy(desc(platformTenantTouchpoints.occurredAt))
    .limit(200);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    summary: r.summary,
    source: r.source,
    occurredAt: r.occurredAt.toISOString(),
    createdByName: r.createdByName ?? (r.source === "system" ? "system" : "—"),
  }));
}

export async function createTouchpoint(
  ctx: AuthContext,
  orgId: string,
  input: { kind: string; summary: string; occurredAt?: string | null },
) {
  requirePlatform(ctx);
  assertTouchpointKind(input.kind);
  const summary = String(input.summary ?? "").trim();
  if (summary.length < 2) throw ApiError.badRequest("Summary is required");
  if (!(await orgExists(orgId))) throw ApiError.notFound("Organization not found");

  let occurredAt = new Date();
  if (input.occurredAt) {
    const parsed = new Date(input.occurredAt);
    if (Number.isNaN(parsed.getTime())) throw ApiError.badRequest("Invalid occurredAt");
    occurredAt = parsed;
  }

  const [row] = await db
    .insert(platformTenantTouchpoints)
    .values({
      orgId,
      kind: input.kind,
      summary: summary.slice(0, 2000),
      source: "operator",
      occurredAt,
      createdBy: ctx.user.id,
    })
    .returning({ id: platformTenantTouchpoints.id });

  await audit({
    organizationId: null,
    actorUserId: ctx.user.id,
    action: "PLATFORM_TOUCHPOINT_LOGGED",
    entityType: "platform_touchpoint",
    entityId: row!.id,
    newValue: { orgId, kind: input.kind },
  });
  return { id: row!.id };
}

// ---------------------------------------------------------------------------
// System touchpoints (auto-logged platform comms)
// ---------------------------------------------------------------------------

/** Write a system touchpoint WITHOUT an AuthContext (jobs/webhooks). */
async function systemTouchpoint(orgId: string, kind: TouchpointKind, summary: string): Promise<void> {
  await db.insert(platformTenantTouchpoints).values({
    orgId,
    kind,
    summary: summary.slice(0, 2000),
    source: "system",
  });
}

/** Called by the broadcast fan-out: one email touchpoint per receiving tenant. */
export async function logBroadcastTouchpoint(orgId: string, title: string): Promise<void> {
  try {
    await systemTouchpoint(orgId, "email", `Broadcast received: ${title.slice(0, 200)}`);
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "broadcast_touchpoint_failed", orgId, err: String(e) }));
  }
}

/** Called by the dunning sweep: records that a dunning email went out. */
export async function logDunningTouchpoint(orgId: string, stage: number): Promise<void> {
  try {
    await systemTouchpoint(orgId, "email", `Dunning email sent (stage ${stage})`);
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "dunning_touchpoint_failed", orgId, err: String(e) }));
  }
}

/** Called by the [Email tenant] quick action: the operator's direct email. */
export async function logOperatorEmailTouchpoint(orgId: string, subject: string, emailed: number): Promise<void> {
  try {
    await systemTouchpoint(orgId, "email", `Operator email: ${subject.slice(0, 180)}${emailed > 0 ? ` (${emailed} sent)` : " (send failed)"}`);
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "operator_email_touchpoint_failed", orgId, err: String(e) }));
  }
}

// ---------------------------------------------------------------------------
// Merged tenant timeline (§4.1)
// ---------------------------------------------------------------------------

export type TimelineEntryKind = "note" | "touchpoint" | "audit";

export interface TimelineEntry {
  id: string;
  kind: TimelineEntryKind;
  /** touchpoint kind / audit action / "note" */
  label: string;
  summary: string;
  actor: string | null;
  at: string;
}

/**
 * One feed per tenant: operator notes + touchpoints + platform audit events
 * (plan changes, impersonation, suspend/reactivate, billing status changes,
 * manual invoices/credits, destructive-op requests). Audit rows are filtered
 * by the event ids recorded in the platform audit log (organization_id NULL).
 *
 * The audit side is filtered in SQL to the handful of PLATFORM_* / ORG_* /
 * IMPERSONATION_* / BILLING_* actions that matter to operators; entity_id
 * carries the org id for those actions.
 */
export async function tenantTimeline(ctx: AuthContext, orgId: string, limit = 100): Promise<TimelineEntry[]> {
  requirePlatform(ctx);
  const res = await db.execute(sql`
    (
      SELECT n.id::text AS id, 'note' AS kind, 'note' AS label, n.body AS summary,
             COALESCE(u.name, '—') AS actor, n.created_at AS at
      FROM platform.tenant_notes n
      LEFT JOIN users u ON u.id = n.created_by
      WHERE n.org_id = ${orgId}
    )
    UNION ALL
    (
      SELECT t.id::text AS id, 'touchpoint' AS kind, t.kind AS label, t.summary AS summary,
             COALESCE(u.name, CASE WHEN t.source = 'system' THEN 'system' END) AS actor,
             t.occurred_at AS at
      FROM platform.tenant_touchpoints t
      LEFT JOIN users u ON u.id = t.created_by
      WHERE t.org_id = ${orgId}
    )
    UNION ALL
    (
      SELECT a.entity_id AS id, 'audit' AS kind, a.action AS label,
             COALESCE(a.new_value ->> 'reason', a.new_value ->> 'plan', a.new_value ->> 'title', a.action) AS summary,
             COALESCE(u.name, 'system') AS actor,
             a.created_at AS at
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE a.organization_id IS NULL
        AND a.entity_id = ${orgId}
        AND (
          a.action LIKE 'PLATFORM_%'
          OR a.action IN ('ORG_PLAN_CHANGED', 'ORG_SUSPENDED', 'ORG_REACTIVATED', 'IMPERSONATION_STARTED', 'IMPERSONATION_ENDED')
          OR (a.action = 'BILLING_STATUS_CHANGED')
        )
    )
    ORDER BY at DESC
    LIMIT ${Math.min(Math.max(limit, 1), 200)}
  `);
  return (res.rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    kind: r.kind as TimelineEntryKind,
    label: String(r.label),
    summary: String(r.summary ?? ""),
    actor: (r.actor as string | null) ?? null,
    at: new Date(r.at as string).toISOString(),
  }));
}

/** Whether the org has any CRM rows (used by tests + empty states). */
export async function crmRowCounts(orgId: string): Promise<{ notes: number; touchpoints: number }> {
  const [notes] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(platformTenantNotes)
    .where(eq(platformTenantNotes.orgId, orgId));
  const [tps] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(platformTenantTouchpoints)
    .where(eq(platformTenantTouchpoints.orgId, orgId));
  return { notes: Number(notes?.n ?? 0), touchpoints: Number(tps?.n ?? 0) };
}
