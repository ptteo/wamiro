/**
 * Admin panel Phase A — usage metering.
 *
 * One row per org per day in platform.tenant_usage_daily, rolled up from
 * data Wamiro already writes:
 *   - audit_logs        actions, logins, distinct actors, per-area counts
 *   - rate_limit_hits   mutations (org scope; reads uncounted by design)
 *   - memberships       active seats (cumulative snapshot)
 *   - file tables       documents + storage bytes (cumulative snapshot)
 *   - organizations     plan + per-seat price snapshot (fold-in #4)
 *
 * `active_users` = distinct actors performing at least one AUDITED action
 * that day. Reads/page views aren't audited, so this is a deliberate,
 * consistent lower bound of true DAU — valid for any historical day.
 * The jobs worker rolls up yesterday (final) + today (provisional) hourly.
 * Everything is idempotent (upsert on (org_id, day)).
 */
import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { organizations, platformTenantUsageDaily } from "@/db/schema";
import { planOf } from "@/modules/billing/plans";
import { requirePlatform } from "./console";
import type { AuthContext } from "@/lib/session";

/** Audit action → feature area (heatmap columns + by_module buckets). */
export function actionToArea(action: string): string {
  const a = action;
  if (a.startsWith("USER_") || a.startsWith("ROLE_") || a.startsWith("SESSION") || a.startsWith("ACCESS_REVIEW") ||
      a.startsWith("AUDIT") || a.startsWith("SETTINGS") || a.startsWith("CUSTOM_DOMAIN") || a.startsWith("SSO_") ||
      a.startsWith("IMPERSONATION") || a.startsWith("PLATFORM_") || a.startsWith("WEBHOOK") || a.startsWith("MFA_") ||
      a.startsWith("DATA_EXPORT") || a.startsWith("CUSTOM_FIELD") || a.startsWith("DEMO_") || a.startsWith("IMPORT") ||
      a.startsWith("BILLING_") || a === "LOGIN_FAILED" || a.startsWith("AUTOMATION_") || a.startsWith("AI_")) {
    return "admin";
  }
  if (a.startsWith("EMPLOYEE_") || a.startsWith("PROFILE_CHANGE") || a.startsWith("JOB_CHANGE")) return "people";
  if (a.startsWith("RECOGNITION") || a.startsWith("LEARNING") || a.startsWith("PERFORMANCE") || a.startsWith("REVIEW") ||
      a.startsWith("COURSE") || a.startsWith("CANDIDATE") || a.startsWith("JOB_OPENING") || a.startsWith("JOURNEY") ||
      a.startsWith("HR_") || a.startsWith("RECRUIT")) {
    return "people_ops";
  }
  if (a.startsWith("ATTENDANCE_")) return "attendance";
  if (a.startsWith("SHIFT_")) return "shifts";
  if (a.startsWith("LEAVE_") || a.startsWith("ENCASHMENT")) return "leave";
  if (a.startsWith("REQUEST_") || a.startsWith("APPROVAL_") || a.startsWith("DELEGATION") || a.startsWith("SERVICE_REQUESTED")) return "requests";
  if (a.startsWith("TICKET_") || a.startsWith("ASSIGNMENT_RULE") || a.startsWith("CANNED_") || a.startsWith("MACRO") ||
      a.startsWith("SERVICE_ITEM") || a.startsWith("IT_RECORD") || a.startsWith("INCIDENT") || a.startsWith("MAILBOX")) {
    return "tickets";
  }
  if (a.startsWith("ARTICLE") || a.startsWith("KNOWLEDGE")) return "knowledge";
  if (a.startsWith("DOCUMENT_") || a.startsWith("DOC_")) return "documents";
  if (a.startsWith("ANNOUNCEMENT") || a.startsWith("DISCUSSION") || a.startsWith("SURVEY") || a.startsWith("POLL") ||
      a.startsWith("ACKNOWLEDGEMENT")) {
    return "company";
  }
  if (a.startsWith("EXPENSE") || a.startsWith("PURCHASE") || a.startsWith("TRAVEL") || a.startsWith("VENDOR") ||
      a.startsWith("BUDGET") || a.startsWith("ADVANCE")) {
    return "finance";
  }
  if (a.startsWith("PAYROLL") || a.startsWith("SALARY") || a.startsWith("PAYS")) return "payroll";
  if (a.startsWith("TASK_") || a.startsWith("PROJECT") || a.startsWith("TIME_LOG") || a.startsWith("GOAL_") ||
      a.startsWith("FAVORITE") || a.startsWith("SAVED_VIEW")) {
    return "work";
  }
  if (a.startsWith("ASSET")) return "assets";
  if (a.startsWith("WORKPLACE") || a.startsWith("VISITOR")) return "workplace";
  if (a.startsWith("GOV") || a.startsWith("POLICY") || a.startsWith("RISK") || a.startsWith("OBLIGATION") ||
      a.startsWith("CONTROL")) {
    return "governance";
  }
  return "other";
}

export const FEATURE_AREAS = [
  "people", "people_ops", "attendance", "shifts", "leave", "requests", "tickets",
  "knowledge", "documents", "company", "finance", "payroll", "work", "assets",
  "workplace", "governance", "admin",
] as const;

export function dayIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Roll up ONE org for ONE day. Idempotent upsert. */
export async function rollupUsageDay(orgId: string, day: Date): Promise<void> {
  const start = `${dayIso(day)}T00:00:00.000Z`;
  const end = `${dayIso(day)}T23:59:59.999Z`;

  const auditRes = await db.execute(sql`
    SELECT count(*)::int AS actions,
           count(DISTINCT actor_user_id)::int AS actors,
           count(*) FILTER (WHERE action = 'USER_LOGIN')::int AS logins,
           count(*) FILTER (WHERE action = 'TICKET_CREATED')::int AS tickets,
           count(*) FILTER (WHERE action LIKE 'LEAVE_%' AND action NOT LIKE 'LEAVE_APPROVED' AND action NOT LIKE 'LEAVE_REJECTED')::int AS leave_requests
    FROM audit_logs
    WHERE organization_id = ${orgId}
      AND created_at >= ${start}::timestamptz
      AND created_at <= ${end}::timestamptz
  `);
  const row = auditRes.rows[0] as { actions: number; actors: number; logins: number; tickets: number; leave_requests: number } | undefined;

  const moduleRes = await db.execute(sql`
    SELECT action, count(*)::int AS n
    FROM audit_logs
    WHERE organization_id = ${orgId}
      AND created_at >= ${start}::timestamptz
      AND created_at <= ${end}::timestamptz
    GROUP BY action
  `);
  const byModule: Record<string, number> = {};
  for (const r of moduleRes.rows as { action: string; n: number }[]) {
    const area = actionToArea(r.action);
    byModule[area] = (byModule[area] ?? 0) + r.n;
  }

  const [org] = await db
    .select({
      name: organizations.name,
      slug: organizations.slug,
      plan: organizations.plan,
      billingStatus: organizations.billingStatus,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return;
  const planDef = planOf(org.plan);
  const seatPriceCents = Math.round((planDef.monthlyPerSeat ?? 0) * 100);

  const [counts] = await db
    .select({
      seats: sql<number>`(SELECT count(*)::int FROM organization_memberships m WHERE m.organization_id = ${orgId} AND m.status = 'active')`,
      documents: sql<number>`(
        (SELECT count(*)::int FROM documents d WHERE d.organization_id = ${orgId})
        + (SELECT count(*)::int FROM ticket_attachments t WHERE t.organization_id = ${orgId})
        + (SELECT count(*)::int FROM employee_documents e WHERE e.organization_id = ${orgId})
      )`,
      storage: sql<number>`(
        (SELECT COALESCE(sum(d.size_bytes), 0)::bigint FROM documents d WHERE d.organization_id = ${orgId})
        + (SELECT COALESCE(sum(t.size_bytes), 0)::bigint FROM ticket_attachments t WHERE t.organization_id = ${orgId})
        + (SELECT COALESCE(sum(e.size_bytes), 0)::bigint FROM employee_documents e WHERE e.organization_id = ${orgId})
      )`,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  // mutations: rate_limit_hits windows overlapping this day (org scope). Only
  // ~48h of windows are retained, so older days roll up with mutations = 0.
  const mutRes = await db.execute(sql`
    SELECT COALESCE(sum(count), 0)::int AS n
    FROM rate_limit_hits
    WHERE scope = 'org'
      AND to_timestamp(window_start) >= ${start}::timestamptz
      AND to_timestamp(window_start) <= ${end}::timestamptz
      AND key = ${orgId}
  `);

  await db
    .insert(platformTenantUsageDaily)
    .values({
      orgId,
      orgName: org.name,
      orgSlug: org.slug,
      day: dayIso(day),
      plan: org.plan,
      seatPriceCents,
      activeUsers: Number(row?.actors ?? 0),
      logins: Number(row?.logins ?? 0),
      actions: Number(row?.actions ?? 0),
      byModule,
      ticketsCreated: Number(row?.tickets ?? 0),
      leaveRequests: Number(row?.leave_requests ?? 0),
      documentsStored: Number(counts?.documents ?? 0),
      storageBytes: Number(counts?.storage ?? 0),
      mutations: Number(mutRes.rows[0]?.n ?? 0),
      seatsActive: Number(counts?.seats ?? 0),
    })
    .onConflictDoUpdate({
      target: [platformTenantUsageDaily.orgId, platformTenantUsageDaily.day],
      set: {
        orgName: org.name,
        orgSlug: org.slug,
        plan: org.plan,
        seatPriceCents,
        activeUsers: Number(row?.actors ?? 0),
        logins: Number(row?.logins ?? 0),
        actions: Number(row?.actions ?? 0),
        byModule,
        ticketsCreated: Number(row?.tickets ?? 0),
        leaveRequests: Number(row?.leave_requests ?? 0),
        documentsStored: Number(counts?.documents ?? 0),
        storageBytes: Number(counts?.storage ?? 0),
        mutations: Number(mutRes.rows[0]?.n ?? 0),
        seatsActive: Number(counts?.seats ?? 0),
      },
    });
}

/** Job entry: roll up yesterday (final) + today (provisional) for every active org. */
export async function rollupRecentUsage(): Promise<{ orgs: number; days: number; pruned: number }> {
  const orgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(sql`${organizations.slug} <> '__platform' AND ${organizations.status} = 'active'`)
    .limit(1000);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  for (const org of orgs) {
    await rollupUsageDay(org.id, yesterday);
    await rollupUsageDay(org.id, today);
  }
  // 3-year retention prune (§3.1 + amendment #8) — keeps the rollup bounded.
  const pruned = await db.execute(sql`
    DELETE FROM platform.tenant_usage_daily WHERE day < (current_date - interval '3 years')
  `);
  return { orgs: orgs.length, days: 2, pruned: pruned.rowCount ?? 0 };
}

// ---------- console reads ----------

export interface UsageRow {
  organizationId: string;
  name: string;
  slug: string;
  plan: string;
  seatsActive: number;
  /** Effective seat cap (null = unlimited plan). */
  seatLimit: number | null;
  /** seats ÷ cap, percent (null = unlimited). §4.4 "seat utilization". */
  seatUtilizationPct: number | null;
  /** Σ distinct audit actors over the last 7 rolled-up days */
  activeActors7d: number;
  actions30d: number;
  logins30d: number;
  mutations30d: number;
  storageBytes: number;
  documentsStored: number;
  lastActiveDay: string | null;
}

/** Fleet usage table (console): latest snapshot + 30d aggregates per tenant. */
export async function usageSummary(ctx: AuthContext): Promise<UsageRow[]> {
  requirePlatform(ctx);
  const res = await db.execute(sql`
    WITH last30 AS (
      SELECT org_id,
             sum(actions)::int AS actions30,
             sum(logins)::int AS logins30,
             sum(mutations)::int AS mut30,
             sum(active_users)::int AS actors7,
             max(day) AS last_day
      FROM platform.tenant_usage_daily
      WHERE day >= (current_date - 30)
      GROUP BY org_id
    ),
    actors7 AS (
      SELECT org_id, sum(active_users)::int AS a7
      FROM platform.tenant_usage_daily
      WHERE day >= (current_date - 7)
      GROUP BY org_id
    )
    SELECT o.id AS "organizationId",
           o.name,
           o.slug,
           o.plan,
           u.seats_active AS "seatsActive",
           (CASE o.seat_limit IS NOT NULL WHEN true THEN o.seat_limit
             ELSE (CASE o.plan WHEN 'growth' THEN 50 WHEN 'scale' THEN NULL ELSE 10 END) END) AS "seatLimit",
           COALESCE(actors7.a7, 0) AS "activeActors7d",
           COALESCE(last30.actions30, 0) AS "actions30d",
           COALESCE(last30.logins30, 0) AS "logins30d",
           COALESCE(last30.mut30, 0) AS "mutations30d",
           COALESCE(u.storage_bytes, 0) AS "storageBytes",
           COALESCE(u.documents_stored, 0) AS "documentsStored",
           last30.last_day::text AS "lastActiveDay"
    FROM organizations o
    LEFT JOIN LATERAL (
      SELECT * FROM platform.tenant_usage_daily d
      WHERE d.org_id = o.id ORDER BY d.day DESC LIMIT 1
    ) u ON true
    LEFT JOIN last30 ON last30.org_id = o.id
    LEFT JOIN actors7 ON actors7.org_id = o.id
    WHERE o.slug <> '__platform'
    ORDER BY COALESCE(last30.actions30, 0) DESC
    LIMIT 500
  `);
  return (res.rows as Record<string, unknown>[]).map((r) => {
    const seatsActive = Number(r.seatsActive ?? 0);
    const seatLimit = r.seatLimit === null || r.seatLimit === undefined ? null : Number(r.seatLimit);
    return {
      organizationId: String(r.organizationId),
      name: String(r.name),
      slug: String(r.slug),
      plan: String(r.plan),
      seatsActive,
      seatLimit,
      /** §4.4 utilization: seats ÷ cap (null = unlimited plan). */
      seatUtilizationPct: seatLimit && seatLimit > 0 ? Math.round((seatsActive / seatLimit) * 100) : null,
      activeActors7d: Number(r.activeActors7d ?? 0),
      actions30d: Number(r.actions30d ?? 0),
      logins30d: Number(r.logins30d ?? 0),
      mutations30d: Number(r.mutations30d ?? 0),
      storageBytes: Number(r.storageBytes ?? 0),
      documentsStored: Number(r.documentsStored ?? 0),
      lastActiveDay: (r.lastActiveDay as string | null) ?? null,
    };
  });
}

/** Module-adoption heatmap: distinct audit actors per org × area over N days. */
export async function moduleHeatmap(
  ctx: AuthContext,
  days = 30,
): Promise<{ orgId: string; orgName: string; areas: Record<string, number> }[]> {
  requirePlatform(ctx);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const res = await db.execute(sql`
    SELECT organization_id AS "orgId",
           max(o.name) AS "orgName",
           ${sql.raw("action")} AS action,
           count(DISTINCT actor_user_id)::int AS actors
    FROM audit_logs l
    JOIN organizations o ON o.id = l.organization_id
    WHERE l.created_at >= ${since}::timestamptz AND o.slug <> '__platform'
    GROUP BY l.organization_id, o.name, l.action
  `);
  const byOrg = new Map<string, { orgId: string; orgName: string; areas: Record<string, number> }>();
  for (const r of res.rows as { orgId: string; orgName: string; action: string; actors: number }[]) {
    let entry = byOrg.get(r.orgId);
    if (!entry) {
      entry = { orgId: r.orgId, orgName: r.orgName, areas: {} };
      byOrg.set(r.orgId, entry);
    }
    const area = actionToArea(r.action);
    entry.areas[area] = Math.max(entry.areas[area] ?? 0, r.actors);
  }
  return [...byOrg.values()].sort((a, b) => a.orgName.localeCompare(b.orgName)).slice(0, 100);
}
