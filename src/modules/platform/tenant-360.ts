/**
 * Admin panel Phase C — Tenant 360 (§4.1), the console's centerpiece page.
 *
 * One read-model per tab, all gated by platform.admin. Reads platform-owned
 * data (usage rollups, billing ledger) plus existing platform-visible tenant
 * metadata. Never writes tenant tables; never leaks panel data to tenants.
 */
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import {
  impersonationGrants,
  impersonationSessions,
  organizations,
  organizationMemberships,
  platformBillingCredits,
  platformTenantTouchpoints,
  platformBillingInvoices,
  platformTenantUsageDaily,
  roles,
  ssoConfigs,
  tickets,
  userRoles,
  users,
} from "@/db/schema";
import { planOf, effectiveSeatLimit } from "@/modules/billing/plans";
import { healthHistory } from "./health";
import { requirePlatform } from "./console";
import type { AuthContext } from "@/lib/session";

function isoOrNull(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

/** Effective seat cap for the 360 usage tab (plan limit + explicit override). */
async function seatLimitFor360(orgId: string): Promise<number | null> {
  const [row] = await db
    .select({ plan: organizations.plan, seatLimit: organizations.seatLimit })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!row) return null;
  return effectiveSeatLimit(row.plan, row.seatLimit);
}

/** Overview tab: identity card + 30d active-user sparkline + headline counts. */
export async function tenantOverview(ctx: AuthContext, orgId: string) {
  requirePlatform(ctx);
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      status: organizations.status,
      plan: organizations.plan,
      billingStatus: organizations.billingStatus,
      trialEndsAt: organizations.trialEndsAt,
      timezone: organizations.timezone,
      currency: organizations.currency,
      createdAt: organizations.createdAt,
      onboardingState: organizations.onboardingState,
      customDomain: organizations.customDomain,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) throw ApiError.notFound("Organization not found");

  const [members, userCount, owner, liveGrant, openTickets, usage, credits] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(organizationMemberships)
      .where(and(eq(organizationMemberships.organizationId, orgId), eq(organizationMemberships.status, "active"))),
    db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.organizationId, orgId)),
    db
      .select({ name: users.name, email: users.email })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(eq(users.organizationId, orgId), eq(roles.organizationId, orgId), eq(roles.key, "admin")))
      .orderBy(desc(users.lastActiveAt))
      .limit(1),
    db
      .select({
        id: impersonationGrants.id,
        reason: impersonationGrants.reason,
        operatorLabel: impersonationGrants.operatorLabel,
        expiresAt: impersonationGrants.expiresAt,
      })
      .from(impersonationGrants)
      .where(and(eq(impersonationGrants.organizationId, orgId), sql`${impersonationGrants.revokedAt} IS NULL`))
      .orderBy(desc(impersonationGrants.createdAt))
      .limit(1),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(tickets)
      .where(and(eq(tickets.organizationId, orgId), sql`${tickets.status} NOT IN ('resolved','closed')`)),
    db
      .select({
        day: platformTenantUsageDaily.day,
        activeUsers: platformTenantUsageDaily.activeUsers,
      })
      .from(platformTenantUsageDaily)
      .where(and(eq(platformTenantUsageDaily.orgId, orgId), sql`${platformTenantUsageDaily.day} >= (current_date - 29)`))
      .orderBy(platformTenantUsageDaily.day),
    db
      .select({ total: sql<number>`COALESCE(sum(${platformBillingCredits.amountCents}), 0)::bigint` })
      .from(platformBillingCredits)
      .where(eq(platformBillingCredits.orgId, orgId)),
  ]);

  const plan = planOf(org.plan);
  const base = {
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.status,
    plan: org.plan,
    planName: plan.name,
    billingStatus: org.billingStatus,
    trialEndsAt: isoOrNull(org.trialEndsAt),
    onboardingState: org.onboardingState,
    region: org.timezone,
    currency: org.currency,
    customDomain: org.customDomain,
    createdAt: org.createdAt.toISOString(),
    seatsActive: Number(members[0]?.n ?? 0),
    seatLimit: plan.seatLimit,
    userCount: Number(userCount[0]?.n ?? 0),
    owner: owner[0] ?? null,
    openTickets: Number(openTickets[0]?.n ?? 0),
    liveGrant: liveGrant[0]
      ? {
          id: liveGrant[0].id,
          reason: liveGrant[0].reason,
          operatorLabel: liveGrant[0].operatorLabel,
          expiresAt: isoOrNull(liveGrant[0].expiresAt),
        }
      : null,
    creditsTotalCents: Number(credits[0]?.total ?? 0),
    /** Sparkline: active (audited) users per day, last 30 rolled-up days. */
    usage30d: usage.map((u) => ({ day: String(u.day), activeUsers: u.activeUsers })),
  };

  // Phase D fold-in #6 — 90-day health score history next to the grade badge.
  const history = await healthHistory(orgId).catch(() => []);
  const latest = history[history.length - 1] ?? null;

  return {
    ...base,
    health: latest ? { score: latest.score, grade: latest.grade, history } : { score: null, grade: null, history },
  };
}

/** Usage tab: per-module 30d totals + activity counters + last 10 logins. */
export async function tenantUsageTab(ctx: AuthContext, orgId: string) {
  requirePlatform(ctx);
  const seatLimit = await seatLimitFor360(orgId);
  const [byModule, totals, recentLogins] = await Promise.all([
    db.execute(sql`
      SELECT by_module
      FROM platform.tenant_usage_daily
      WHERE org_id = ${orgId} AND day >= (current_date - 29)
      ORDER BY day DESC
    `),
    db
      .select({
        actions30d: sql<number>`COALESCE(sum(${platformTenantUsageDaily.actions}), 0)::int`,
        logins30d: sql<number>`COALESCE(sum(${platformTenantUsageDaily.logins}), 0)::int`,
        mutations30d: sql<number>`COALESCE(sum(${platformTenantUsageDaily.mutations}), 0)::int`,
        seatsActive: sql<number>`COALESCE(max(${platformTenantUsageDaily.seatsActive}), 0)::int`,
        storageBytes: sql<number>`COALESCE(max(${platformTenantUsageDaily.storageBytes}), 0)::bigint`,
        documentsStored: sql<number>`COALESCE(max(${platformTenantUsageDaily.documentsStored}), 0)::int`,
      })
      .from(platformTenantUsageDaily)
      .where(and(eq(platformTenantUsageDaily.orgId, orgId), sql`${platformTenantUsageDaily.day} >= (current_date - 29)`)),
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(eq(users.organizationId, orgId))
      .orderBy(desc(users.lastLoginAt))
      .limit(10),
  ]);

  const modules: Record<string, number> = {};
  for (const r of byModule.rows as { by_module: Record<string, number> }[]) {
    for (const [k, v] of Object.entries(r.by_module ?? {})) {
      modules[k] = (modules[k] ?? 0) + v;
    }
  }

  // DAU/WAU/MAU + seat-utilization trend (§4.1 Usage tab): rolling distinct
  // active-user windows over the daily snapshots.
  const windows = await db.execute(sql`
    SELECT
      (SELECT COALESCE(sum(active_users), 0)::int FROM platform.tenant_usage_daily
        WHERE org_id = ${orgId} AND day >= (current_date - 0)) AS dau,
      (SELECT COALESCE(sum(active_users), 0)::int FROM platform.tenant_usage_daily
        WHERE org_id = ${orgId} AND day >= (current_date - 6)) AS wau,
      (SELECT COALESCE(sum(active_users), 0)::int FROM platform.tenant_usage_daily
        WHERE org_id = ${orgId} AND day >= (current_date - 29)) AS mau
  `);
  const w = (windows.rows[0] ?? {}) as { dau?: number; wau?: number; mau?: number };

  return {
    modules,
    totals: {
      actions30d: Number(totals[0]?.actions30d ?? 0),
      logins30d: Number(totals[0]?.logins30d ?? 0),
      mutations30d: Number(totals[0]?.mutations30d ?? 0),
      seatsActive: Number(totals[0]?.seatsActive ?? 0),
      storageBytes: Number(totals[0]?.storageBytes ?? 0),
      documentsStored: Number(totals[0]?.documentsStored ?? 0),
    },
    dau: Number(w.dau ?? 0),
    wau: Number(w.wau ?? 0),
    mau: Number(w.mau ?? 0),
    /** seats ÷ cap over the last 8 weeks — utilization trend (§4.1). */
    seatUtilization: (
      await db.execute(sql`
        SELECT min(day)::text AS week,
               max(seats_active)::int AS seats
        FROM platform.tenant_usage_daily
        WHERE org_id = ${orgId} AND day >= (current_date - 56)
        GROUP BY (EXTRACT(EPOCH FROM day)::bigint / 604800)
        ORDER BY week ASC
        LIMIT 8
      `)
    ).rows.map((r) => {
      const row = r as { week: string; seats: number };
      return {
        week: String(row.week),
        seats: Number(row.seats),
        pct: seatLimit ? Math.min(100, Math.round((Number(row.seats) / seatLimit) * 100)) : null,
      };
    }),
    recentLogins: recentLogins.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      lastLoginAt: isoOrNull(u.lastLoginAt),
    })),
  };
}

/** Billing tab: this tenant's ledger invoices + credits. */
export async function tenantBillingTab(ctx: AuthContext, orgId: string) {
  requirePlatform(ctx);
  const [invoices, credits] = await Promise.all([
    db
      .select({
        id: platformBillingInvoices.id,
        number: platformBillingInvoices.number,
        amountCents: platformBillingInvoices.amountCents,
        currency: platformBillingInvoices.currency,
        status: platformBillingInvoices.status,
        source: platformBillingInvoices.source,
        issuedAt: platformBillingInvoices.issuedAt,
        paidAt: platformBillingInvoices.paidAt,
        dueAt: platformBillingInvoices.dueAt,
      })
      .from(platformBillingInvoices)
      .where(eq(platformBillingInvoices.orgId, orgId))
      .orderBy(desc(platformBillingInvoices.issuedAt))
      .limit(50),
    db
      .select({
        id: platformBillingCredits.id,
        amountCents: platformBillingCredits.amountCents,
        reason: platformBillingCredits.reason,
        expiresAt: platformBillingCredits.expiresAt,
        createdAt: platformBillingCredits.createdAt,
      })
      .from(platformBillingCredits)
      .where(eq(platformBillingCredits.orgId, orgId))
      .orderBy(desc(platformBillingCredits.createdAt))
      .limit(50),
  ]);
  // Dunning history comes from the system touchpoints the sweep auto-logs
  // ("Dunning email sent (stage N)") — one source of truth for comms.
  const dunning = await db
    .select({
      occurredAt: platformTenantTouchpoints.occurredAt,
      summary: platformTenantTouchpoints.summary,
    })
    .from(platformTenantTouchpoints)
    .where(and(eq(platformTenantTouchpoints.orgId, orgId), sql`${platformTenantTouchpoints.summary} LIKE 'Dunning email sent%'`))
    .orderBy(desc(platformTenantTouchpoints.occurredAt))
    .limit(10);

  return {
    invoices: invoices.map((i) => ({
      id: i.id,
      number: i.number,
      amountCents: i.amountCents,
      currency: i.currency,
      status: i.status,
      source: i.source,
      issuedAt: i.issuedAt.toISOString(),
      paidAt: isoOrNull(i.paidAt),
      dueAt: isoOrNull(i.dueAt),
    })),
    credits: credits.map((c) => ({
      id: c.id,
      amountCents: c.amountCents,
      reason: c.reason,
      expiresAt: isoOrNull(c.expiresAt),
      createdAt: c.createdAt.toISOString(),
    })),
    dunningHistory: dunning.map((d) => ({
      at: d.occurredAt.toISOString(),
      stage: Number((d.summary.match(/stage (\d+)/)?.[1] ?? 0)),
      summary: d.summary,
    })),
    /** Next invoice: earliest open manual invoice due in the future (§4.1). */
    nextInvoice: (() => {
      const open = invoices
        .filter((i) => i.status === "open" && i.dueAt !== null && i.dueAt.getTime() > Date.now())
        .sort((a, b) => (a.dueAt as Date).getTime() - (b.dueAt as Date).getTime())[0];
      return open && open.dueAt
        ? { number: open.number, amountCents: open.amountCents, currency: open.currency, dueAt: open.dueAt.toISOString() }
        : null;
    })(),
  };
}

/** Support tab: open/escalated tickets, FRT compliance, CSAT (90-day window). */
export async function tenantSupportTab(ctx: AuthContext, orgId: string) {
  requirePlatform(ctx);
  const res = await db.execute(sql`
    SELECT count(*) FILTER (WHERE status NOT IN ('resolved','closed'))::int AS open,
           count(*) FILTER (WHERE category = 'platform' AND status NOT IN ('resolved','closed'))::int AS escalated_open,
           count(*) FILTER (
             WHERE first_response_at IS NOT NULL AND first_response_due_at IS NOT NULL
           )::int AS frt_count,
           count(*) FILTER (
             WHERE first_response_at IS NOT NULL AND first_response_due_at IS NOT NULL
               AND first_response_at <= first_response_due_at
           )::int AS frt_met,
           round(avg(csat_score) FILTER (WHERE csat_score IS NOT NULL), 2)::float8 AS csat_avg,
           count(csat_score)::int AS csat_count
    FROM tickets
    WHERE organization_id = ${orgId}
      AND created_at >= now() - interval '90 days'
  `);
  const r = res.rows[0] as
    | { open: number; escalated_open: number; frt_count: number; frt_met: number; csat_avg: number | null; csat_count: number }
    | undefined;

  const openTickets = await db
    .select({
      id: tickets.id,
      title: tickets.title,
      status: tickets.status,
      priority: tickets.priority,
      slaState: tickets.slaState,
      createdAt: tickets.createdAt,
    })
    .from(tickets)
    .where(and(eq(tickets.organizationId, orgId), sql`${tickets.status} NOT IN ('resolved','closed')`))
    .orderBy(desc(tickets.createdAt))
    .limit(10);

  const frtCount = Number(r?.frt_count ?? 0);
  return {
    openCount: Number(r?.open ?? 0),
    escalatedOpen: Number(r?.escalated_open ?? 0),
    frtMetPct: frtCount > 0 ? Math.round((Number(r!.frt_met) / frtCount) * 100) : null,
    csatAvg: r?.csat_avg === null || r?.csat_avg === undefined ? null : Number(r.csat_avg),
    csatCount: Number(r?.csat_count ?? 0),
    tickets: openTickets.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      slaState: t.slaState,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

/** Access tab: admins + MFA, SSO config, impersonation grants + past windows. */
export async function tenantAccessTab(ctx: AuthContext, orgId: string) {
  requirePlatform(ctx);
  const [admins, sso, grants, windows] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        mfaEnabled: users.totpEnabled,
        lastLoginAt: users.lastLoginAt,
        roleName: roles.name,
      })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(eq(users.organizationId, orgId), eq(roles.organizationId, orgId), eq(roles.key, "admin")))
      .orderBy(users.name)
      .limit(50),
    db
      .select({
        id: ssoConfigs.id,
        provider: ssoConfigs.provider,
        enabled: ssoConfigs.enabled,
      })
      .from(ssoConfigs)
      .where(eq(ssoConfigs.organizationId, orgId)),
    db
      .select({
        id: impersonationGrants.id,
        reason: impersonationGrants.reason,
        operatorLabel: impersonationGrants.operatorLabel,
        expiresAt: impersonationGrants.expiresAt,
        revokedAt: impersonationGrants.revokedAt,
        createdAt: impersonationGrants.createdAt,
      })
      .from(impersonationGrants)
      .where(eq(impersonationGrants.organizationId, orgId))
      .orderBy(desc(impersonationGrants.createdAt))
      .limit(20),
    db
      .select({
        id: impersonationSessions.id,
        operatorName: users.name,
        reason: impersonationSessions.reason,
        startedAt: impersonationSessions.startedAt,
        endedAt: impersonationSessions.endedAt,
      })
      .from(impersonationSessions)
      .innerJoin(users, eq(users.id, impersonationSessions.operatorUserId))
      .where(eq(impersonationSessions.organizationId, orgId))
      .orderBy(desc(impersonationSessions.startedAt))
      .limit(20),
  ]);

  return {
    admins: admins.map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      mfaEnabled: a.mfaEnabled,
      lastLoginAt: isoOrNull(a.lastLoginAt),
      roleName: a.roleName,
    })),
    sso: sso.map((s) => ({ id: s.id, provider: s.provider, enabled: s.enabled })),
    grants: grants.map((g) => ({
      id: g.id,
      reason: g.reason,
      operatorLabel: g.operatorLabel,
      expiresAt: isoOrNull(g.expiresAt),
      revokedAt: isoOrNull(g.revokedAt),
      createdAt: g.createdAt.toISOString(),
    })),
    impersonationWindows: windows.map((w) => ({
      id: w.id,
      operatorName: w.operatorName,
      reason: w.reason,
      startedAt: w.startedAt.toISOString(),
      endedAt: isoOrNull(w.endedAt),
    })),
  };
}
