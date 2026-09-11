/**
 * Phase E — platform console v2 (operate 100 companies).
 *
 * Four operator capabilities, all gated by GLOBAL `platform.admin`:
 *   1. Risk & activation board — cohort health per tenant (setup, active-7d,
 *      churn risk) so "which companies are at risk this week?" is one screen.
 *   2. Impersonation WITH CONSENT + FULL AUDIT — a tenant admin must create a
 *      time-boxed grant; operators mint a session under it, a banner marks the
 *      window, and every open/stop is an immutable ledger row.
 *   3. Broadcast — product announcements fanned out to every active tenant's
 *      feed plus one in-app notification per member.
 *   4. Support queue — tenants file `platform`-category tickets; operators
 *      pull them into an escalated queue (notify-once) and resolve like any
 *      agent, reusing the native tickets engine.
 *
 * Impersonation safety model:
 *   - consent: grant rows are created ONLY by the tenant (settings page)
 *   - least privilege: the operator session takes the TENANT's admin role,
 *     never the operator's platform powers (platform.admin is stripped)
 *   - expiry: grants max 7 days; sessions die with the grant/window
 *   - audit: one row per opened window in impersonation_sessions + audit_logs
 */
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import { hashToken, newSessionToken } from "@/lib/password";
import { cookieOptions, type AuthContext } from "@/lib/session";
import {
  announcements,
  impersonationGrants,
  impersonationSessions,
  notifications,
  organizationMemberships,
  organizations,
  sessions,
  tickets,
  users,
} from "@/db/schema";
import { can } from "@/modules/iam/engine";

export function requirePlatform(ctx: AuthContext): void {
  if (!can(ctx.access, "platform.admin")) {
    throw ApiError.forbidden("Missing permission: platform.admin");
  }
}

// ===========================================================================
// 1. Risk & activation board (cohort health)
// ===========================================================================

export interface TenantRisk {
  organizationId: string;
  name: string;
  slug: string;
  plan: string;
  billingStatus: string;
  userCount: number;
  /** members active in the last 7 days */
  active7d: number;
  lastActiveAt: Date | null;
  /** hours since ANY member was last active (null = never) */
  dormantHours: number | null;
  /** risk level: high = dormant >14d or never active; medium = >7d */
  risk: "high" | "medium" | "low";
  setupDone: boolean;
  /** days left on a running trial (null when not trialing) */
  trialDaysLeft: number | null;
}

const SETUP_STEPS_SQL = sql<number>`(
  (SELECT count(*)::int FROM organization_memberships m WHERE m.organization_id = o.id AND m.status = 'active') >= 2
  AND o.logo_url IS NOT NULL
  AND EXISTS (SELECT 1 FROM announcements a WHERE a.organization_id = o.id)
  AND EXISTS (SELECT 1 FROM knowledge_articles k WHERE k.organization_id = o.id)
)::int`;

/** One screen answering: which companies are at risk this week? */
export async function tenantRiskBoard(ctx: AuthContext): Promise<TenantRisk[]> {
  requirePlatform(ctx);
  const since7d = new Date(Date.now() - 7 * 86_400_000);

  const rows = await db.execute(sql`
    SELECT o.id AS "organizationId",
           o.name,
           o.slug,
           o.plan,
           o.billing_status AS "billingStatus",
           (SELECT count(*)::int FROM users u WHERE u.organization_id = o.id) AS "userCount",
           (SELECT count(*)::int FROM users u WHERE u.organization_id = o.id AND u.last_active_at >= ${since7d}) AS "active7d",
           (SELECT max(u.last_active_at) FROM users u WHERE u.organization_id = o.id) AS "lastActiveAt",
           ${SETUP_STEPS_SQL} AS "setupDone",
           CASE WHEN o.billing_status = 'trial' AND o.trial_ends_at IS NOT NULL
                THEN GREATEST(0, CEIL(EXTRACT(EPOCH FROM (o.trial_ends_at - now())) / 86400))::int
                ELSE NULL END AS "trialDaysLeft"
    FROM organizations o
    WHERE o.slug <> '__platform'
    ORDER BY o.created_at ASC
  `);

  const now = Date.now();
  return (rows.rows as Record<string, unknown>[]).map((r) => {
    const rawLastActiveAt = r.lastActiveAt;
    const lastActiveAt =
      rawLastActiveAt instanceof Date
        ? rawLastActiveAt
        : rawLastActiveAt
          ? new Date(rawLastActiveAt as string)
          : null;
    const dormantHours = lastActiveAt
      ? Math.floor((now - lastActiveAt.getTime()) / 3_600_000)
      : null;
    const risk: TenantRisk["risk"] =
      dormantHours === null || dormantHours > 14 * 24
        ? "high"
        : dormantHours > 7 * 24
          ? "medium"
          : "low";
    return {
      organizationId: String(r.organizationId),
      name: String(r.name),
      slug: String(r.slug),
      plan: String(r.plan),
      billingStatus: String(r.billingStatus),
      userCount: Number(r.userCount ?? 0),
      active7d: Number(r.active7d ?? 0),
      lastActiveAt,
      dormantHours,
      risk,
      setupDone: Number(r.setupDone ?? 0) >= 1,
      trialDaysLeft: r.trialDaysLeft === null ? null : Number(r.trialDaysLeft),
    };
  });
}

// ===========================================================================
// 2. Impersonation — consent-gated, time-boxed, fully audited
// ===========================================================================

const MAX_GRANT_DAYS = 7;

// ---------- tenant side (consent) ----------

/** The tenant's own active grant, for the settings page toggle. */
export async function myImpersonationGrant(ctx: AuthContext) {
  const [g] = await db
    .select({
      id: impersonationGrants.id,
      reason: impersonationGrants.reason,
      operatorLabel: impersonationGrants.operatorLabel,
      expiresAt: impersonationGrants.expiresAt,
      createdAt: impersonationGrants.createdAt,
    })
    .from(impersonationGrants)
    .where(
      and(
        eq(impersonationGrants.organizationId, ctx.user.organizationId),
        isNull(impersonationGrants.revokedAt),
        gt(impersonationGrants.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(impersonationGrants.createdAt))
    .limit(1);
  return g ?? null;
}

/**
 * Tenant admin grants platform support a time-boxed impersonation window.
 * Only one live grant per tenant — granting again replaces the old one.
 */
export async function grantImpersonation(
  ctx: AuthContext,
  input: { reason: string; days?: number; operatorLabel?: string },
) {
  if (!can(ctx.access, "users.manage") && !can(ctx.access, "settings.manage")) {
    throw ApiError.forbidden("Only tenant admins can grant support access");
  }
  const reason = input.reason.trim();
  if (reason.length < 5) throw ApiError.badRequest("Describe why support needs access (min 5 chars)");
  const days = Math.min(Math.max(Math.round(input.days ?? 3), 1), MAX_GRANT_DAYS);

  // revoke any live grant first (single live grant invariant)
  await db
    .update(impersonationGrants)
    .set({ revokedAt: new Date(), revokedByUserId: ctx.user.id })
    .where(
      and(
        eq(impersonationGrants.organizationId, ctx.user.organizationId),
        isNull(impersonationGrants.revokedAt),
      ),
    );

  const [g] = await db
    .insert(impersonationGrants)
    .values({
      organizationId: ctx.user.organizationId,
      grantedByUserId: ctx.user.id,
      reason: reason.slice(0, 500),
      operatorLabel: input.operatorLabel?.trim().slice(0, 120) || null,
      expiresAt: new Date(Date.now() + days * 86_400_000),
    })
    .returning({ id: impersonationGrants.id, expiresAt: impersonationGrants.expiresAt });

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "IMPERSONATION_GRANT_CREATED",
    entityType: "impersonation_grant",
    entityId: g!.id,
    newValue: { reason, days, expiresAt: g!.expiresAt.toISOString() },
  });
  return g!;
}

/** Tenant admin revokes consent; also force-ends any live impersonation session. */
export async function revokeImpersonation(ctx: AuthContext, grantId: string) {
  const [g] = await db
    .select({ id: impersonationGrants.id, organizationId: impersonationGrants.organizationId })
    .from(impersonationGrants)
    .where(
      and(
        eq(impersonationGrants.id, grantId),
        eq(impersonationGrants.organizationId, ctx.user.organizationId),
      ),
    )
    .limit(1);
  if (!g) throw ApiError.notFound();

  await db
    .update(impersonationGrants)
    .set({ revokedAt: new Date(), revokedByUserId: ctx.user.id })
    .where(eq(impersonationGrants.id, grantId));

  // end live impersonation sessions under this grant immediately
  await db
    .update(impersonationSessions)
    .set({ endedAt: new Date() })
    .where(and(eq(impersonationSessions.grantId, grantId), isNull(impersonationSessions.endedAt)));
  await db
    .delete(sessions)
    .where(sql`${sessions.tokenHash} IN (SELECT i.session_token_hash FROM impersonation_sessions i WHERE i.grant_id = ${grantId})`);

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "IMPERSONATION_GRANT_REVOKED",
    entityType: "impersonation_grant",
    entityId: grantId,
  });
}

// ---------- platform side (operator) ----------

/** Grants the operator may use right now. */
export async function listAvailableGrants(ctx: AuthContext) {
  requirePlatform(ctx);
  return db
    .select({
      grantId: impersonationGrants.id,
      organizationId: impersonationGrants.organizationId,
      orgName: organizations.name,
      reason: impersonationGrants.reason,
      operatorLabel: impersonationGrants.operatorLabel,
      expiresAt: impersonationGrants.expiresAt,
      createdAt: impersonationGrants.createdAt,
    })
    .from(impersonationGrants)
    .innerJoin(organizations, eq(organizations.id, impersonationGrants.organizationId))
    .where(
      and(
        isNull(impersonationGrants.revokedAt),
        gt(impersonationGrants.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(impersonationGrants.createdAt))
    .limit(100);
}

/** Active tenant admins to impersonate (grant's org only). */
export async function listImpersonationTargets(
  ctx: AuthContext,
  grantId: string,
): Promise<{ id: string; name: string; email: string }[]> {
  requirePlatform(ctx);
  const grant = await liveGrantForPlatform(ctx, grantId);
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(
      and(
        eq(organizationMemberships.organizationId, grant.organizationId),
        eq(organizationMemberships.status, "active"),
        eq(users.status, "active"),
        sql`EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ${users.id} AND r.organization_id = ${grant.organizationId} AND r.key = 'admin')`,
      ),
    )
    .orderBy(asc(users.name))
    .limit(50);
}

async function liveGrantForPlatform(ctx: AuthContext, grantId: string) {
  const [g] = await db
    .select({
      id: impersonationGrants.id,
      organizationId: impersonationGrants.organizationId,
      expiresAt: impersonationGrants.expiresAt,
      reason: impersonationGrants.reason,
    })
    .from(impersonationGrants)
    .where(
      and(
        eq(impersonationGrants.id, grantId),
        isNull(impersonationGrants.revokedAt),
        gt(impersonationGrants.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!g) throw ApiError.notFound("No live impersonation grant for this tenant");
  return g;
}

/**
 * Open an impersonation window:
 *   1. mint a real session for the TARGET user (the operator now acts as them)
 *   2. mint a fresh "return" session for the OPERATOR and hand it back in a
 *      second httpOnly cookie — the operator's current session is destroyed
 *      (its cookie is being replaced), so restore must not depend on JS
 *   3. record the window in the ledger + audit log
 */
export async function startImpersonation(
  ctx: AuthContext,
  input: { grantId: string; targetUserId: string; reason?: string; operatorToken: string },
): Promise<{
  impersonationCookie: ReturnType<typeof cookieOptions>;
  impersonationToken: string;
  returnCookie: ReturnType<typeof cookieOptions>;
  returnToken: string;
  orgName: string;
  targetName: string;
}> {
  requirePlatform(ctx);
  const grant = await liveGrantForPlatform(ctx, input.grantId);
  if (input.targetUserId === ctx.user.id) throw ApiError.badRequest("You cannot impersonate yourself");

  const [target] = await db
    .select({ id: users.id, name: users.name, organizationId: users.organizationId })
    .from(users)
    .where(
      and(
        eq(users.id, input.targetUserId),
        eq(users.organizationId, grant.organizationId),
        eq(users.status, "active"),
      ),
    )
    .limit(1);
  if (!target) throw ApiError.badRequest("Target must be an active member of the granted tenant");
  if (target.id === ctx.user.id) throw ApiError.badRequest("You cannot impersonate yourself");

  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, grant.organizationId))
    .limit(1);

  // 1. target session — lives at most until the grant expires
  const token = newSessionToken();
  const expiresAt = new Date(Math.min(Date.now() + 8 * 3_600_000, grant.expiresAt.getTime()));
  await db.insert(sessions).values({
    userId: target.id,
    tokenHash: hashToken(token),
    expiresAt,
    ip: null,
    userAgent: `impersonation:${ctx.user.id}`,
  });

  // 2. operator return session (survives the window, capped at the grant too)
  const returnToken = newSessionToken();
  const returnExpiresAt = new Date(Math.min(Date.now() + 7 * 86_400_000, grant.expiresAt.getTime()));
  await db.insert(sessions).values({
    userId: ctx.user.id,
    tokenHash: hashToken(returnToken),
    expiresAt: returnExpiresAt,
    ip: null,
    userAgent: `impersonation-return:${ctx.user.id}`,
  });
  // the operator's current session is about to lose its cookie — retire it
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(input.operatorToken)));

  // 3. ledger + audit
  await db.insert(impersonationSessions).values({
    grantId: grant.id,
    organizationId: grant.organizationId,
    operatorUserId: ctx.user.id,
    targetUserId: target.id,
    sessionTokenHash: hashToken(token),
    operatorReturnTokenHash: hashToken(returnToken),
    reason: input.reason?.trim().slice(0, 500) || grant.reason.slice(0, 500),
  });

  await audit({
    organizationId: grant.organizationId,
    actorUserId: ctx.user.id,
    action: "IMPERSONATION_STARTED",
    entityType: "user",
    entityId: target.id,
    newValue: { grantId: grant.id, targetName: target.name, orgName: org?.name, expiresAt: expiresAt.toISOString() },
  });

  return {
    impersonationCookie: cookieOptions(expiresAt),
    impersonationToken: token,
    returnCookie: cookieOptions(returnExpiresAt),
    returnToken,
    orgName: org?.name ?? "",
    targetName: target.name,
  };
}

/** End an impersonation window: ledger + kill the minted session. */
export async function stopImpersonation(ctx: AuthContext, impersonationToken: string): Promise<void> {
  const tokenHash = hashToken(impersonationToken);
  const [rec] = await db
    .select({
      id: impersonationSessions.id,
      grantId: impersonationSessions.grantId,
      organizationId: impersonationSessions.organizationId,
      targetUserId: impersonationSessions.targetUserId,
    })
    .from(impersonationSessions)
    .where(and(eq(impersonationSessions.sessionTokenHash, tokenHash), isNull(impersonationSessions.endedAt)))
    .limit(1);
  if (!rec) return; // not a live impersonation session — nothing to do

  await db
    .update(impersonationSessions)
    .set({ endedAt: new Date() })
    .where(eq(impersonationSessions.id, rec.id));
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));

  await audit({
    organizationId: rec.organizationId,
    actorUserId: ctx.user.id,
    action: "IMPERSONATION_ENDED",
    entityType: "user",
    entityId: rec.targetUserId,
    newValue: { grantId: rec.grantId },
  });
}

/** Ledger view for the operator console. */
export async function listImpersonationLedger(ctx: AuthContext) {
  requirePlatform(ctx);
  return db
    .select({
      id: impersonationSessions.id,
      orgName: organizations.name,
      operatorName: users.name,
      targetUserId: impersonationSessions.targetUserId,
      reason: impersonationSessions.reason,
      startedAt: impersonationSessions.startedAt,
      endedAt: impersonationSessions.endedAt,
    })
    .from(impersonationSessions)
    .innerJoin(organizations, eq(organizations.id, impersonationSessions.organizationId))
    .innerJoin(users, eq(users.id, impersonationSessions.operatorUserId))
    .orderBy(desc(impersonationSessions.startedAt))
    .limit(100);
}

// ===========================================================================
// 3. Broadcast — announcement to every active tenant
// ===========================================================================

/** Fan a platform announcement into every active tenant + notify members. */
export async function broadcastAnnouncement(
  ctx: AuthContext,
  input: { title: string; body: string },
): Promise<{ orgs: number; notified: number }> {
  requirePlatform(ctx);
  const title = input.title.trim().slice(0, 300);
  const body = input.body.trim().slice(0, 10_000);
  if (!title || !body) throw ApiError.badRequest("Title and body are required");

  const orgRows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.status, "active"), sql`${organizations.slug} <> '__platform'`));

  let notified = 0;
  for (const org of orgRows) {
    await db.insert(announcements).values({
      organizationId: org.id,
      authorUserId: ctx.user.id,
      title: `📣 ${title}`,
      body,
    });
    // Phase C — broadcast comms auto-log as a system touchpoint (CRM-lite).
    const { logBroadcastTouchpoint } = await import("./crm");
    await logBroadcastTouchpoint(org.id, title);
    const members = await db
      .select({ userId: organizationMemberships.userId })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, org.id),
          eq(organizationMemberships.status, "active"),
        ),
      );
    if (members.length > 0) {
      await db.insert(notifications).values(
        members.map((m) => ({
          organizationId: org.id,
          userId: m.userId,
          type: "announcement",
          title: `📣 ${title}`,
          body: body.slice(0, 200),
          link: "/announcements",
        })),
      );
      notified += members.length;
    }
  }

  await audit({
    organizationId: null,
    actorUserId: ctx.user.id,
    action: "PLATFORM_BROADCAST",
    entityType: "announcement",
    entityId: null,
    newValue: { title, orgs: orgRows.length, notified },
  });
  return { orgs: orgRows.length, notified };
}

// ===========================================================================
// 4. Support queue — platform-escalated tickets
// ===========================================================================

const ESCALATION_PRIORITY_HOURS: Record<string, number> = {
  urgent: 8,
  high: 24,
  medium: 48,
  low: 96,
};

/**
 * Tickets routed into the platform support queue (category 'platform', not
 * resolved/closed). Rows awaiting operator pickup have escalated_at = null;
 * acknowledging a ticket stamps escalated_at + sets a response window.
 * Cross-tenant BY DESIGN — rows carry org names so operators see who needs
 * help. platform.admin is the only key; tenant data stays inside the ticket.
 */
export async function platformSupportQueue(ctx: AuthContext) {
  requirePlatform(ctx);
  const PAGE = 200;
  const MAX = 1000;
  const collected: {
    id: string;
    organizationId: string;
    orgName: string;
    title: string;
    status: string;
    priority: string;
    slaState: string;
    slaDueDate: Date | null;
    escalatedAt: Date | null;
    createdAt: Date;
    requesterName: string;
  }[] = [];
  let afterId: string | undefined;
  while (collected.length < MAX) {
    const batch = await db
      .select({
        id: tickets.id,
        organizationId: tickets.organizationId,
        orgName: organizations.name,
        title: tickets.title,
        status: tickets.status,
        priority: tickets.priority,
        slaState: tickets.slaState,
        slaDueDate: tickets.slaDueDate,
        escalatedAt: tickets.escalatedAt,
        createdAt: tickets.createdAt,
        requesterName: users.name,
      })
      .from(tickets)
      .innerJoin(organizations, eq(organizations.id, tickets.organizationId))
      .innerJoin(users, eq(users.id, tickets.requesterId))
      .where(
        and(
          eq(tickets.category, "platform"),
          sql`${tickets.status} NOT IN ('resolved', 'closed')`,
          afterId ? gt(tickets.id, afterId) : undefined,
        ),
      )
      .orderBy(asc(tickets.id))
      .limit(Math.min(PAGE, MAX - collected.length));
    if (batch.length === 0) break;
    collected.push(...batch);
    afterId = batch[batch.length - 1]!.id;
  }
  collected.sort((a, b) => {
    if (a.escalatedAt && b.escalatedAt) return b.escalatedAt.getTime() - a.escalatedAt.getTime();
    if (a.escalatedAt) return -1;
    if (b.escalatedAt) return 1;
    const ad = a.slaDueDate?.getTime() ?? Number.POSITIVE_INFINITY;
    const bd = b.slaDueDate?.getTime() ?? Number.POSITIVE_INFINITY;
    return ad - bd;
  });
  return collected;
}

/**
 * Pull a tenant ticket into the platform queue (operator action from the
 * console's tenant list, or the tenant's own agent). Notify-once via the
 * escalated_at stamp; sets a priority-based response window.
 */
export async function escalateTicket(ctx: AuthContext, ticketId: string): Promise<void> {
  requirePlatform(ctx);
  const [t] = await db
    .select({ id: tickets.id, escalatedAt: tickets.escalatedAt, priority: tickets.priority, organizationId: tickets.organizationId })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1);
  if (!t) throw ApiError.notFound();
  if (t.escalatedAt) return; // already queued

  const hours = ESCALATION_PRIORITY_HOURS[t.priority] ?? 48;
  await db
    .update(tickets)
    .set({ escalatedAt: new Date(), firstResponseDueAt: new Date(Date.now() + hours * 3_600_000) })
    .where(eq(tickets.id, ticketId));

  await audit({
    organizationId: t.organizationId,
    actorUserId: ctx.user.id,
    action: "TICKET_ESCALATED_PLATFORM",
    entityType: "ticket",
    entityId: ticketId,
    newValue: { responseWindowHours: hours },
  });
}

/** Platform operators reply to an escalated ticket as their operator identity. */
export async function platformTicketReply(
  ctx: AuthContext,
  ticketId: string,
  body: string,
): Promise<void> {
  requirePlatform(ctx);
  // the ticket lives in the tenant's org — scope by the ticket, not the operator
  const [t] = await db
    .select({ id: tickets.id, organizationId: tickets.organizationId, category: tickets.category })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1);
  if (!t) throw ApiError.notFound();
  if (t.category !== "platform") throw ApiError.badRequest("Only platform support tickets can be answered here");

  const { addReplyRecord } = await import("@/modules/tickets/service");
  // isAgent=true → first-response stamping + requester notification fire
  await addReplyRecord(t.organizationId, ctx.user.id, ticketId, body, false, true);
}
