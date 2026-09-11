/**
 * Admin panel Phase D — tenant health scores (§3.2).
 *
 * One explainable 0..100 score per org per day in
 * platform.tenant_health_scores (Historical class: soft ref + name snapshot,
 * trend history survives tenant deletion). Computed from data already
 * written:
 *
 *   recency  (20) — days since any member's last activity
 *   adoption (25) — WAU ÷ seats_active from the Phase A usage rollup
 *   breadth  (20) — distinct modules used in 30d (target ≥4)
 *   support  (20) — open escalations + SLA breaches + CSAT
 *   billing  (15) — cancelled=0, past_due/trial halved
 *
 * Weights are env-tunable (HEALTH_WEIGHT_*), grades are green ≥ 70,
 * yellow ≥ 40, red < 40. The health_rollup job computes yesterday+today
 * hourly for every active tenant; 90 days of history power the trend arrows
 * and the Tenant 360 sparkline (fold-in #6). 3-year retention prune (§8).
 */
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { organizations, platformTenantHealthScores } from "@/db/schema";
import { requirePlatform } from "./console";
import type { AuthContext } from "@/lib/session";

export const FACTOR_KEYS = ["recency", "adoption", "breadth", "support", "billing"] as const;
export type FactorKey = (typeof FACTOR_KEYS)[number];

function weightFor(key: FactorKey, fallback: number): number {
  const raw = Number(process.env[`HEALTH_WEIGHT_${key.toUpperCase()}`]);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

export function healthWeights(): Record<FactorKey, number> {
  return {
    recency: weightFor("recency", 20),
    adoption: weightFor("adoption", 25),
    breadth: weightFor("breadth", 20),
    support: weightFor("support", 20),
    billing: weightFor("billing", 15),
  };
}

export function gradeFor(score: number): "green" | "yellow" | "red" {
  if (score >= 70) return "green";
  if (score >= 40) return "yellow";
  return "red";
}

/** Compute the factor breakdown + score for one org on one day. */
export async function computeHealthFor(
  orgId: string,
  day: Date,
): Promise<{ score: number; grade: ReturnType<typeof gradeFor>; factors: Record<FactorKey, number> } | null> {
  const [org] = await db
    .select({
      name: organizations.name,
      billingStatus: organizations.billingStatus,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return null;

  const since30 = new Date(day.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const dayIso = day.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(day.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);

  // Phase A rollups: WAU (7d), distinct modules (30d), seats, last active day.
  const usageRes = await db.execute(sql`
    SELECT
      COALESCE((SELECT active_users FROM platform.tenant_usage_daily WHERE org_id = ${orgId} AND day = ${dayIso}), 0)::int AS dau,
      COALESCE((SELECT sum(active_users) FROM platform.tenant_usage_daily WHERE org_id = ${orgId} AND day >= ${sevenDaysAgo} AND day <= ${dayIso}), 0)::int AS wau_sum,
      COALESCE((SELECT max(seats_active) FROM platform.tenant_usage_daily WHERE org_id = ${orgId} AND day >= ${sevenDaysAgo} AND day <= ${dayIso}), 0)::int AS seats,
      COALESCE((
        SELECT count(*)::int FROM (
          SELECT jsonb_object_keys(by_module) AS m
          FROM platform.tenant_usage_daily
          WHERE org_id = ${orgId} AND day >= ${since30} AND day <= ${dayIso} AND by_module <> '{}'::jsonb
          GROUP BY m
        ) mods
      ), 0)::int AS breadth,
      (SELECT max(day) FROM platform.tenant_usage_daily WHERE org_id = ${orgId} AND active_users > 0) AS last_active_day
  `);
  const u = (usageRes.rows[0] ?? {}) as {
    dau: number; wau_sum: number; seats: number; breadth: number; last_active_day: string | null;
  };

  // Support factor: open escalated tickets, breached SLAs, CSAT (90d).
  const supRes = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM tickets
        WHERE organization_id = ${orgId} AND category = 'platform'
          AND status NOT IN ('resolved','closed')) AS escalations,
      (SELECT count(*)::int FROM tickets
        WHERE organization_id = ${orgId} AND sla_state = 'breached'
          AND status NOT IN ('resolved','closed')) AS breaches,
      (SELECT round(avg(csat_score), 2) FROM tickets
        WHERE organization_id = ${orgId} AND csat_score IS NOT NULL
          AND created_at >= now() - interval '90 days') AS csat
  `);
  const s = (supRes.rows[0] ?? {}) as { escalations: number; breaches: number; csat: number | null };

  const w = healthWeights();

  // recency: full credit within 3d, linear decay to 0 at 30d, never-active = 0.
  let recencyPoints = 0;
  if (u.last_active_day) {
    const daysSince = Math.max(
      0,
      Math.floor((day.getTime() - new Date(`${u.last_active_day}T00:00:00Z`).getTime()) / 86_400_000),
    );
    recencyPoints = daysSince <= 3 ? 1 : Math.max(0, 1 - (daysSince - 3) / 27);
  }

  // adoption: WAU ÷ seats (dedupe sum ≈ weekly uniques over 7 daily rows;
  // clamped — a noisy sum just saturates at full credit).
  const seats = Math.max(1, Number(u.seats ?? 0));
  const adoptionRatio = Math.min(1, Number(u.wau_sum ?? 0) / (seats * 7));

  // breadth: 4+ distinct modules in 30d = full credit.
  const breadthPoints = Math.min(1, Number(u.breadth ?? 0) / 4);

  // support: start full; −0.25 per open escalation, −0.25 per breach,
  // CSAT < 3.5 halves it, no data = full (don't punish quiet tenants).
  let supportPoints = 1;
  supportPoints -= 0.25 * Number(s.escalations ?? 0);
  supportPoints -= 0.25 * Number(s.breaches ?? 0);
  if (s.csat !== null && s.csat !== undefined && Number(s.csat) < 3.5) supportPoints *= 0.5;
  supportPoints = Math.max(0, supportPoints);

  // billing: cancelled = 0, past_due = half, trial = 3/4, active = 1.
  const billingPoints =
    org.billingStatus === "cancelled" ? 0 : org.billingStatus === "past_due" ? 0.5 : org.billingStatus === "trial" ? 0.75 : 1;

  const factors: Record<FactorKey, number> = {
    recency: Math.round(recencyPoints * w.recency),
    adoption: Math.round(adoptionRatio * w.adoption),
    breadth: Math.round(breadthPoints * w.breadth),
    support: Math.round(supportPoints * w.support),
    billing: Math.round(billingPoints * w.billing),
  };
  const score = FACTOR_KEYS.reduce((sum, k) => sum + factors[k], 0);
  return { score, grade: gradeFor(score), factors };
}

/** Upsert one org's score row for one day. Idempotent. */
async function rollupHealthDay(orgId: string, day: Date): Promise<void> {
  const computed = await computeHealthFor(orgId, day);
  if (!computed) return;
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const dayIso = day.toISOString().slice(0, 10);
  await db
    .insert(platformTenantHealthScores)
    .values({
      orgId,
      orgName: org?.name ?? "",
      day: dayIso,
      score: computed.score,
      grade: computed.grade,
      factors: computed.factors,
    })
    .onConflictDoUpdate({
      target: [platformTenantHealthScores.orgId, platformTenantHealthScores.day],
      set: {
        orgName: org?.name ?? "",
        score: computed.score,
        grade: computed.grade,
        factors: computed.factors,
      },
    });
}

/** Job entry: yesterday (final) + today (provisional) for every active tenant. */
export async function rollupRecentHealth(): Promise<{ orgs: number; pruned: number }> {
  const orgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(sql`${organizations.slug} <> '__platform' AND ${organizations.status} = 'active'`)
    .limit(1000);
  const today = new Date();
  for (const org of orgs) {
    await rollupHealthDay(org.id, today);
    await rollupHealthDay(org.id, new Date(today.getTime() - 86_400_000));
  }
  // 3-year retention prune (§8)
  const pruned = await db.execute(sql`
    DELETE FROM platform.tenant_health_scores WHERE day < (current_date - interval '3 years')
  `);
  return { orgs: orgs.length, pruned: pruned.rowCount ?? 0 };
}

// ---------------------------------------------------------------------------
// Console reads
// ---------------------------------------------------------------------------

export interface HealthRow {
  orgId: string;
  orgName: string;
  orgSlug: string;
  plan: string;
  score: number;
  grade: string;
  factors: Record<string, number>;
  /** trend vs the score 7 days earlier: up | down | flat */
  trend: "up" | "down" | "flat";
  daysSinceActive: number | null;
}

/** Red/yellow/green list sorted by score, with 7d trend + factor breakdown. */
export async function healthBoard(ctx: AuthContext): Promise<HealthRow[]> {
  requirePlatform(ctx);
  const res = await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (h.org_id) h.*
      FROM platform.tenant_health_scores h
      ORDER BY h.org_id, h.day DESC
    ),
    prior AS (
      SELECT org_id, score FROM (
        SELECT h.*, row_number() OVER (PARTITION BY h.org_id ORDER BY h.day DESC) AS rn
        FROM platform.tenant_health_scores h
        WHERE h.day <= (current_date - 7)
      ) ranked WHERE rn = 1
    )
    SELECT l.org_id AS "orgId", l.org_name AS "orgName", l.score, l.grade, l.factors,
           p.score AS "priorScore",
           o.slug AS "orgSlug", o.plan,
           (SELECT max(u.last_active_at) FROM users u WHERE u.organization_id = l.org_id) AS "lastActiveAt"
    FROM latest l
    JOIN organizations o ON o.id = l.org_id
    LEFT JOIN prior p ON p.org_id = l.org_id
    ORDER BY l.score ASC
    LIMIT 500
  `);
  const now = Date.now();
  return (res.rows as Record<string, unknown>[]).map((r) => {
    const score = Number(r.score ?? 0);
    const prior = r.priorScore === null || r.priorScore === undefined ? null : Number(r.priorScore);
    const lastActiveAt = r.lastActiveAt as Date | null;
    return {
      orgId: String(r.orgId),
      orgName: String(r.orgName ?? ""),
      orgSlug: String(r.orgSlug ?? ""),
      plan: String(r.plan ?? "starter"),
      score,
      grade: String(r.grade ?? "red"),
      factors: (r.factors && typeof r.factors === "object" ? r.factors : {}) as Record<string, number>,
      trend: prior === null || prior === score ? "flat" : score > prior ? "up" : "down",
      daysSinceActive: lastActiveAt
        ? Math.floor((now - lastActiveAt.getTime()) / 86_400_000)
        : null,
    };
  });
}

/** 90-day score history for the Tenant 360 sparkline (fold-in #6). */
export async function healthHistory(orgId: string, days = 90): Promise<{ day: string; score: number; grade: string }[]> {
  const rows = await db
    .select({ day: platformTenantHealthScores.day, score: platformTenantHealthScores.score, grade: platformTenantHealthScores.grade })
    .from(platformTenantHealthScores)
    .where(and(eq(platformTenantHealthScores.orgId, orgId), sql`${platformTenantHealthScores.day} >= (current_date - ${days}::int)`))
    .orderBy(platformTenantHealthScores.day);
  return rows.map((r) => ({ day: String(r.day), score: r.score, grade: r.grade }));
}
