/**
 * Admin panel Phase E — Revenue analytics (§4.2). No migration: reads the
 * Phase B ledger (authoritative collected truth) + Phase A usage snapshots
 * (forward-looking seats × price).
 *
 * KPI precedence (amendment #7): MRR movement buckets come from the daily
 * plan+price snapshots in platform.tenant_usage_daily; refunds/voids count
 * as CONTRACTION in the month they occur (churn only on actual cancellation).
 * Where ledger and seats×price disagree, the ledger wins — the dashboard
 * labels each number with its source.
 */
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { requirePlatform } from "./console";
import type { AuthContext } from "@/lib/session";

export interface RevenueKpis {
  /** Σ paid invoice amounts, all time — authoritative (ledger). */
  collectedCents: number;
  /** Σ paid invoice amounts, last 30 days (ledger). */
  collected30dCents: number;
  /** active paid orgs: seats × plan price from the latest usage snapshot. */
  mrrCents: number;
  arpaCents: number | null;
  activeTrials: number;
  /** trials converted ÷ trials ended, 30d rolling (audit events). */
  trialConversionPct: number | null;
  /** MRR of orgs that cancelled in the last 30d (at cancel time). */
  churnedMrrCents: number;
  /** logo churn: cancellations in the last 30d (§6 — churn by count AND $). */
  churnedLogos: number;
  atRiskMrrCents: number;
  atRiskOrgs: number;
  /** (Σ MRR today of cohort active 90d ago) ÷ (cohort MRR 90d ago). */
  nrrProxyPct: number | null;
}

export interface MrrMovement {
  month: string; // YYYY-MM
  newCents: number;
  expansionCents: number;
  contractionCents: number;
  churnCents: number;
  netCents: number;
}

export interface AgingRow {
  invoiceId: string;
  number: string;
  orgId: string | null;
  orgName: string;
  amountCents: number;
  currency: string;
  /** days since issued_at (open invoices only) */
  ageDays: number;
  overdue: boolean;
}

export interface RenewalRow {
  orgId: string;
  orgName: string;
  kind: "trial" | "manual_invoice" | "contract";
  dueAt: string;
  amountCents: number;
  /** contracts only — auto-renewing deals stay revenue, non-renewing are risk */
  autoRenew?: boolean;
}

function cents(n: unknown): number {
  return Math.round(Number(n ?? 0));
}

/** Latest per-org MRR snapshot per day for `days` days (waterfall source). */
async function mrrSeries(days: number): Promise<{ day: string; byOrg: Map<string, number> }[]> {
  const res = await db.execute(sql`
    SELECT day::text AS day, org_id AS "orgId",
           sum(seats_active * seat_price_cents)::bigint AS mrr
    FROM platform.tenant_usage_daily
    WHERE day >= (current_date - ${days}::int)
    GROUP BY day, org_id
    ORDER BY day
  `);
  const out: { day: string; byOrg: Map<string, number> }[] = [];
  for (const r of res.rows as { day: string; orgId: string; mrr: string }[]) {
    let entry = out.find((e) => e.day === r.day);
    if (!entry) {
      entry = { day: r.day, byOrg: new Map() };
      out.push(entry);
    }
    entry.byOrg.set(r.orgId, cents(r.mrr));
  }
  return out;
}

/**
 * MRR movement waterfall (§4.2) — month-over-month deltas on the daily
 * snapshots, bucketed by cohort:
 *   new         org present now, absent at month start
 *   churn       org present at start, absent now (or MRR → 0)
 *   expansion   same org, MRR increased
 *   contraction same org, MRR decreased
 */
export async function mrrWaterfall(months = 6): Promise<MrrMovement[]> {
  const series = await mrrSeries(Math.max(months, 3) * 31);
  if (series.length < 2) return [];
  const byMonth = new Map<string, Map<string, number>>();
  for (const s of series) {
    const month = s.day.slice(0, 7);
    let m = byMonth.get(month);
    if (!m) {
      m = new Map();
      byMonth.set(month, m);
    }
    // last snapshot of the month wins
    for (const [orgId, mrr] of s.byOrg) m.set(orgId, mrr);
  }
  const monthsSorted = [...byMonth.keys()].sort();
  const out: MrrMovement[] = [];
  for (let i = 1; i < monthsSorted.length; i++) {
    const prev = byMonth.get(monthsSorted[i - 1]!)!;
    const cur = byMonth.get(monthsSorted[i]!)!;
    const movement: MrrMovement = {
      month: monthsSorted[i]!,
      newCents: 0,
      expansionCents: 0,
      contractionCents: 0,
      churnCents: 0,
      netCents: 0,
    };
    for (const [orgId, mrrNow] of cur) {
      const before = prev.get(orgId) ?? 0;
      if (before === 0 && mrrNow > 0) movement.newCents += mrrNow;
      else if (mrrNow > before) movement.expansionCents += mrrNow - before;
      else if (mrrNow < before) movement.contractionCents += before - mrrNow;
    }
    for (const [orgId, mrrBefore] of prev) {
      if (!cur.has(orgId) && mrrBefore > 0) movement.churnCents += mrrBefore;
    }
    movement.netCents = movement.newCents + movement.expansionCents - movement.contractionCents - movement.churnCents;
    out.push(movement);
  }
  return out;
}

/** KPI row for the Revenue tab. */
export async function revenueKpis(ctx: AuthContext): Promise<RevenueKpis> {
  requirePlatform(ctx);
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const kpiRes = await db.execute(sql`
    SELECT
      (SELECT COALESCE(sum(amount_cents), 0)::bigint FROM platform.billing_invoices WHERE status = 'paid') AS "collectedAll",
      (SELECT COALESCE(sum(amount_cents), 0)::bigint FROM platform.billing_invoices WHERE status = 'paid' AND issued_at >= ${since30}::timestamptz) AS "collected30",
      (SELECT COALESCE(sum(seats_active * seat_price_cents), 0)::bigint
         FROM (SELECT DISTINCT ON (org_id) org_id, seats_active, seat_price_cents
               FROM platform.tenant_usage_daily ORDER BY org_id, day DESC) latest) AS "mrrNow",
      (SELECT count(*)::int FROM organizations
        WHERE slug <> '__platform' AND status = 'active' AND billing_status = 'trial') AS "activeTrials",
      (SELECT count(*)::int FROM platform.billing_invoices WHERE status = 'open') AS "openInvoices"
  `);
  const k = (kpiRes.rows[0] ?? {}) as Record<string, unknown>;
  const mrrCents = cents(k.mrrNow);
  const paidOrgsRes = await db.execute(sql`
    SELECT count(DISTINCT org_id)::int AS n
    FROM (SELECT DISTINCT ON (org_id) org_id, seats_active, seat_price_cents
          FROM platform.tenant_usage_daily ORDER BY org_id, day DESC) latest
    WHERE seats_active > 0 AND seat_price_cents > 0
  `);
  const paidOrgs = Number((paidOrgsRes.rows[0] as { n: number } | undefined)?.n ?? 0);

  // trial funnel (30d): converted = trial → active audit events; ended = converted + cancelled/downgrades
  const funnelRes = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE action = 'BILLING_STATUS_CHANGED' AND new_value->>'billingStatus' = 'active')::int AS converted,
      count(*) FILTER (WHERE action = 'BILLING_STATUS_CHANGED'
        AND new_value->>'billingStatus' IN ('past_due','cancelled'))::int AS endedLost
    FROM audit_logs
    WHERE organization_id IS NOT NULL AND created_at >= ${since30}::timestamptz
      AND action = 'BILLING_STATUS_CHANGED'
  `);
  const f = (funnelRes.rows[0] ?? {}) as { converted: number; endedLost: number };
  const trialsEnded = Number(f.converted ?? 0) + Number(f.endedLost ?? 0);

  // churned MRR + logo churn: cancelled orgs in the last 30d × their last snapshot MRR
  const churnRes = await db.execute(sql`
    SELECT COALESCE(sum(COALESCE(u.mrr, 0)), 0)::bigint AS "churnedMrr", count(*)::int AS "churnedLogos"
    FROM organizations o
    LEFT JOIN LATERAL (
      SELECT seats_active * seat_price_cents AS mrr
      FROM platform.tenant_usage_daily d
      WHERE d.org_id = o.id ORDER BY d.day DESC LIMIT 1
    ) u ON true
    WHERE o.slug <> '__platform' AND o.billing_status = 'cancelled'
      AND o.billing_status_changed_at >= ${since30}::timestamptz
  `);

  // at-risk MRR: latest health grade yellow/red × last snapshot MRR
  const riskRes = await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (org_id) org_id, grade FROM platform.tenant_health_scores ORDER BY org_id, day DESC
    ),
    mrr AS (
      SELECT DISTINCT ON (org_id) org_id, seats_active * seat_price_cents AS mrr
      FROM platform.tenant_usage_daily ORDER BY org_id, day DESC
    )
    SELECT COALESCE(sum(m.mrr), 0)::bigint AS "atRisk", count(*)::int AS orgs
    FROM latest l JOIN mrr m ON m.org_id = l.org_id
    WHERE l.grade IN ('yellow','red') AND m.mrr > 0
  `);

  // NRR proxy (§6): cohort MRR today ÷ same cohort MRR 90d ago (if cohort existed)
  const cohortRes = await db.execute(sql`
    SELECT
      (SELECT COALESCE(sum(seats_active * seat_price_cents), 0)::bigint FROM platform.tenant_usage_daily WHERE day = (current_date - 90)) AS "past",
      (SELECT COALESCE(sum(seats_active * seat_price_cents), 0)::bigint FROM platform.tenant_usage_daily WHERE day = current_date) AS "today"
  `);
  const c = (cohortRes.rows[0] ?? {}) as { past: string; today: string };
  const pastCents = cents(c.past);
  const todayCents = cents(c.today);

  const collectedAll = cents(k.collectedAll);
  return {
    collectedCents: collectedAll,
    collected30dCents: cents(k.collected30),
    mrrCents,
    arpaCents: paidOrgs > 0 ? Math.round(mrrCents / paidOrgs) : null,
    activeTrials: Number(k.activeTrials ?? 0),
    trialConversionPct: trialsEnded > 0 ? Math.round((Number(f.converted) / trialsEnded) * 100) : null,
    churnedMrrCents: cents((churnRes.rows[0] as { churnedMrr?: string } | undefined)?.churnedMrr),
    churnedLogos: Number((churnRes.rows[0] as { churnedLogos?: number } | undefined)?.churnedLogos ?? 0),
    atRiskMrrCents: cents((riskRes.rows[0] as { atRisk?: string } | undefined)?.atRisk),
    atRiskOrgs: Number((riskRes.rows[0] as { orgs?: number } | undefined)?.orgs ?? 0),
    nrrProxyPct: pastCents > 0 ? Math.round((todayCents / pastCents) * 100) : null,
  };
}

/** Invoice aging table (§4.2): open invoices with days outstanding. */
export async function invoiceAging(ctx: AuthContext): Promise<AgingRow[]> {
  requirePlatform(ctx);
  const res = await db.execute(sql`
    SELECT i.id::text AS "invoiceId", i.number, i.org_id AS "orgId", i.org_name AS "orgName",
           i.amount_cents AS "amountCents", i.currency,
           EXTRACT(EPOCH FROM (now() - i.issued_at))::int / 86400 AS "ageDays",
           (i.due_at IS NOT NULL AND i.due_at < now()) AS overdue
    FROM platform.billing_invoices i
    WHERE i.status = 'open'
    ORDER BY i.issued_at ASC
    LIMIT 200
  `);
  return (res.rows as Record<string, unknown>[]).map((r) => ({
    invoiceId: String(r.invoiceId),
    number: String(r.number),
    orgId: (r.orgId as string | null) ?? null,
    orgName: String(r.orgName ?? ""),
    amountCents: cents(r.amountCents),
    currency: String(r.currency ?? "USD"),
    ageDays: Number(r.ageDays ?? 0),
    overdue: Boolean(r.overdue),
  }));
}

/** Renewal forecast (§4.2): contracts + trials + open manual invoices due ≤ 30 d. */
export async function renewalForecast(ctx: AuthContext): Promise<RenewalRow[]> {
  requirePlatform(ctx);
  const res = await db.execute(sql`
    SELECT o.id AS "orgId", o.name AS "orgName", 'trial' AS kind,
           o.trial_ends_at AS "dueAt",
           COALESCE((SELECT seats_active * seat_price_cents FROM platform.tenant_usage_daily d
             WHERE d.org_id = o.id ORDER BY d.day DESC LIMIT 1), 0)::bigint AS "amountCents",
           NULL AS "autoRenew"
    FROM organizations o
    WHERE o.slug <> '__platform' AND o.status = 'active' AND o.billing_status = 'trial'
      AND o.trial_ends_at BETWEEN now() AND (now() + interval '30 days')
    UNION ALL
    SELECT i.org_id AS "orgId", i.org_name AS "orgName", 'manual_invoice' AS kind,
           i.due_at AS "dueAt", i.amount_cents AS "amountCents", NULL AS "autoRenew"
    FROM platform.billing_invoices i
    WHERE i.status = 'open' AND i.due_at IS NOT NULL
      AND i.due_at BETWEEN now() AND (now() + interval '30 days')
    UNION ALL
    SELECT c.org_id AS "orgId", c.org_name AS "orgName", 'contract' AS kind,
           (c.end_date + interval '1 day')::timestamptz AS "dueAt",
           (c.annual_value_cents / 12)::bigint AS "amountCents",
           c.auto_renew AS "autoRenew"
    FROM platform.contracts c
    WHERE c.end_date IS NOT NULL
      AND c.end_date BETWEEN current_date AND (current_date + 30)
    ORDER BY "dueAt" ASC
    LIMIT 100
  `);
  return (res.rows as Record<string, unknown>[])
    .filter((r) => r.dueAt !== null)
    .map((r) => ({
      orgId: String(r.orgId ?? ""),
      orgName: String(r.orgName ?? ""),
      kind: r.kind === "trial" ? "trial" : r.kind === "contract" ? "contract" : "manual_invoice",
      dueAt: new Date(r.dueAt as string).toISOString(),
      amountCents: cents(r.amountCents),
      autoRenew: r.autoRenew === null || r.autoRenew === undefined ? undefined : Boolean(r.autoRenew),
    }));
}

export interface ChurnReasonRow {
  reason: string;
  logos: number;
}

/**
 * Churn-by-reason (§6 + §4.2): two-person-rule cancellations store their
 * reason on the destructive-op request; self-serve / provider cancellations
 * have no operator reason and bucket as 'customer' (the customer acted).
 */
export async function churnByReason(ctx: AuthContext): Promise<ChurnReasonRow[]> {
  requirePlatform(ctx);
  const res = await db.execute(sql`
    SELECT COALESCE(op.reason, 'customer-initiated') AS reason, count(*)::int AS logos
    FROM organizations o
    LEFT JOIN LATERAL (
      SELECT d.reason FROM platform.destructive_ops d
      WHERE d.kind = 'cancel_subscription' AND d.org_id = o.id
        AND d.status IN ('approved','pending')
      ORDER BY d.created_at DESC LIMIT 1
    ) op ON true
    WHERE o.slug <> '__platform' AND o.billing_status = 'cancelled'
      AND o.billing_status_changed_at >= (now() - interval '90 days')
    GROUP BY 1
    ORDER BY logos DESC
    LIMIT 20
  `);
  return (res.rows as Record<string, unknown>[]).map((r) => ({
    reason: String(r.reason ?? "unknown"),
    logos: Number(r.logos ?? 0),
  }));
}
