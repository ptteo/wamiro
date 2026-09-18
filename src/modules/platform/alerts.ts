/**
 * Admin panel Phase D — alerts & playbooks (§3.5).
 *
 * The hourly evaluator walks enabled rules and fires instances into
 * platform.alert_instances. The UNIQUE (rule_id, org_id, window_start) index
 * makes firing idempotent — restarts and overlapping ticks can never
 * double-fire (amendment #5). Weekly (Monday UTC) window dedupe means a
 * condition that persists re-fires each Monday, not each hour.
 *
 * Seeded playbooks (migration 0064):
 *   dormant > 14 d → alert + operator task  (notify_operator)
 *   trial ends ≤ 7 d → alert
 *   invoice past due → alert + tenant email (email_tenant, via Brevo-class SMTP)
 *   escalated-ticket SLA breach → alert
 *   health grade red → alert
 *
 * Resolve/acknowledge writes to the tenant timeline via the CRM touchpoint
 * feed's audit-side (platform-level audit rows carry entity_id = orgId).
 */
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import { appUrl, renderBrandedEmail, sendEmail } from "@/lib/mailer";
import {
  organizations,
  platformAlertInstances,
  platformAlertRules,
  platformOperators,
  users,
} from "@/db/schema";
import { gradeFor, healthWeights, type FactorKey } from "./health";
import { requirePlatform } from "./console";
import type { AuthContext } from "@/lib/session";

export const ALERT_KINDS = ["dormant", "trial_ending", "failed_payment", "sla_breach", "churn_risk"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];
export const ALERT_ACTIONS = ["notify_operator", "email_tenant", "create_task"] as const;
export type AlertAction = (typeof ALERT_ACTIONS)[number];

export function weekWindowStart(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function thresholdNumber(t: Record<string, unknown>, key: string, fallback: number): number {
  const n = Number(t[key]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ---------------------------------------------------------------------------
// Per-kind detection: returns matching org snapshots for one rule
// ---------------------------------------------------------------------------

interface Candidate {
  orgId: string;
  orgName: string;
  payload: Record<string, unknown>;
}

async function findDormant(days: number): Promise<Candidate[]> {
  const res = await db.execute(sql`
    SELECT o.id AS "orgId", o.name AS "orgName",
           EXTRACT(EPOCH FROM (now() - max(u.last_active_at)) / 86400)::int AS "daysDormant"
    FROM organizations o
    JOIN organization_memberships m ON m.organization_id = o.id AND m.status = 'active'
    JOIN users u ON u.id = m.user_id
    WHERE o.slug <> '__platform' AND o.status = 'active'
    GROUP BY o.id, o.name
    HAVING max(u.last_active_at) IS NULL OR max(u.last_active_at) < now() - (${days} || ' days')::interval
  `);
  return (res.rows as Record<string, unknown>[]).map((r) => ({
    orgId: String(r.orgId),
    orgName: String(r.orgName ?? ""),
    payload: { daysDormant: Number(r.daysDormant ?? 0) },
  }));
}

async function findTrialsEnding(daysLeft: number): Promise<Candidate[]> {
  const res = await db.execute(sql`
    SELECT o.id AS "orgId", o.name AS "orgName",
           CEIL(EXTRACT(EPOCH FROM (o.trial_ends_at - now())) / 86400)::int AS "daysLeft"
    FROM organizations o
    WHERE o.slug <> '__platform' AND o.status = 'active'
      AND o.billing_status = 'trial' AND o.trial_ends_at IS NOT NULL
      AND o.trial_ends_at BETWEEN now() AND (now() + (${daysLeft} || ' days')::interval)
  `);
  return (res.rows as Record<string, unknown>[]).map((r) => ({
    orgId: String(r.orgId),
    orgName: String(r.orgName ?? ""),
    payload: { daysLeft: Number(r.daysLeft ?? 0) },
  }));
}

async function findFailedPayments(): Promise<Candidate[]> {
  const res = await db.execute(sql`
    SELECT o.id AS "orgId", o.name AS "orgName", o.dunning_stage AS "dunningStage"
    FROM organizations o
    WHERE o.slug <> '__platform' AND o.status = 'active' AND o.billing_status = 'past_due'
  `);
  return (res.rows as Record<string, unknown>[]).map((r) => ({
    orgId: String(r.orgId),
    orgName: String(r.orgName ?? ""),
    payload: { dunningStage: Number(r.dunningStage ?? 0) },
  }));
}

async function findSlaBreaches(): Promise<Candidate[]> {
  const res = await db.execute(sql`
    SELECT t.organization_id AS "orgId", max(o.name) AS "orgName",
           count(*)::int AS "breached"
    FROM tickets t
    JOIN organizations o ON o.id = t.organization_id
    WHERE o.slug <> '__platform' AND t.sla_state = 'breached'
      AND t.status NOT IN ('resolved','closed') AND t.category = 'platform'
    GROUP BY t.organization_id
  `);
  return (res.rows as Record<string, unknown>[]).map((r) => ({
    orgId: String(r.orgId),
    orgName: String(r.orgName ?? ""),
    payload: { breached: Number(r.breached ?? 0) },
  }));
}

async function findChurnRisks(): Promise<Candidate[]> {
  const res = await db.execute(sql`
    SELECT DISTINCT ON (h.org_id) h.org_id AS "orgId", h.org_name AS "orgName", h.score, h.grade, h.factors
    FROM platform.tenant_health_scores h
    ORDER BY h.org_id, h.day DESC
  `);
  return (res.rows as Record<string, unknown>[])
    .filter((r) => String(r.grade) === "red")
    .map((r) => ({
      orgId: String(r.orgId),
      orgName: String(r.orgName ?? ""),
      payload: { score: Number(r.score ?? 0), grade: String(r.grade) },
    }));
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function tenantBillingEmails(orgId: string): Promise<{ email: string; name: string }[]> {
  const rows = await db
    .selectDistinct({ email: users.email, name: users.name })
    .from(users)
    .innerJoin(organizations, eq(organizations.id, users.organizationId))
    .where(and(eq(organizations.id, orgId), eq(users.status, "active")))
    .limit(10);
  return rows;
}

async function runAction(
  rule: { id: string; name: string; kind: string; action: string },
  cand: Candidate,
  windowStart: string,
): Promise<{ fired: boolean; emailed: number; tasked: boolean }> {
  let emailed = 0;
  let tasked = false;
  if (rule.action === "email_tenant") {
    const contacts = await tenantBillingEmails(cand.orgId);
    const subject = `Wamiro billing: action needed (${cand.orgName})`;
    const body =
      `Our records show your subscription payment needs attention. ` +
      `Update your payment method in Plan & Billing to keep your workspace available.`;
    for (const c of contacts) {
      const html = renderBrandedEmail({
        title: subject,
        body,
        actionLabel: "Open Plan & Billing",
        actionUrl: `${appUrl()}/settings/billing`,
      });
      if (await sendEmail(c.email, subject, html)) emailed += 1;
    }
  } else if (rule.action === "notify_operator") {
    // Playbook alert → the platform team's own inbox (the panel inbox row is
    // written below; this email makes it proactive so nobody has to remember
    // to open the console). Failures never block firing.
    try {
      const ops = await db
        .selectDistinct({ email: users.email })
        .from(users)
        .innerJoin(platformOperators, eq(platformOperators.userId, users.id))
        .where(and(eq(users.status, "active"), sql`${platformOperators.role} <> 'viewer'`))
        .limit(10);
      const subject = `Wamiro panel alert: ${rule.name} (${cand.orgName})`;
      const detail = Object.entries(cand.payload)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(" · ");
      const html = renderBrandedEmail({
        title: subject,
        body: `A playbook fired.${detail ? ` Details — ${detail}.` : ""} Acknowledge or resolve it from the panel inbox.`,
        actionLabel: "Open Health & Alerts",
        actionUrl: `${appUrl()}/platform`,
      });
      for (const o of ops) {
        if (await sendEmail(o.email, subject, html)) emailed += 1;
      }
    } catch (e) {
      console.error(JSON.stringify({ level: "error", msg: "alert_notify_operator_failed", ruleId: rule.id, orgId: cand.orgId, err: String(e) }));
    }
  } else if (rule.action === "create_task") {
    // Playbook alert → an operator task row in the panel inbox. The instance
    // row below IS the task; carrying it in `payload.task` lets the UI and
    // the weekly digest list open follow-ups as actionable work items.
    tasked = true;
  }

  const insert = await db
    .insert(platformAlertInstances)
    .values({
      ruleId: rule.id,
      orgId: cand.orgId,
      orgName: cand.orgName,
      windowStart,
      payload: { ...cand.payload, ruleName: rule.name, emailed, task: tasked || undefined },
    })
    .onConflictDoNothing({ target: [platformAlertInstances.ruleId, platformAlertInstances.orgId, platformAlertInstances.windowStart] })
    .returning({ id: platformAlertInstances.id });
  const fired = insert.length > 0;
  if (fired) {
    await audit({
      organizationId: null,
      actorUserId: null,
      action: "PLATFORM_ALERT_FIRED",
      entityType: "platform_alert",
      entityId: cand.orgId,
      newValue: { ruleId: rule.id, kind: rule.kind, action: rule.action, windowStart, emailed, task: tasked, ...cand.payload },
    });
  }
  return { fired, emailed, tasked };
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

/** Job entry: evaluate every enabled rule; deduped per (rule, org, week). */
export async function evaluateAlerts(): Promise<{ rules: number; fired: number; emailed: number; tasked: number }> {
  const rules = await db.select().from(platformAlertRules).where(eq(platformAlertRules.enabled, true));
  const windowStart = weekWindowStart();
  let fired = 0;
  let emailed = 0;
  let tasked = 0;
  for (const rule of rules) {
    const kind = rule.kind as AlertKind;
    const t = rule.threshold ?? {};
    let candidates: Candidate[] = [];
    if (kind === "dormant") candidates = await findDormant(thresholdNumber(t, "days", 14));
    else if (kind === "trial_ending") candidates = await findTrialsEnding(thresholdNumber(t, "daysLeft", 7));
    else if (kind === "failed_payment") candidates = await findFailedPayments();
    else if (kind === "sla_breach") candidates = await findSlaBreaches();
    else if (kind === "churn_risk") candidates = await findChurnRisks();

    for (const cand of candidates) {
      const r = await runAction(rule, cand, windowStart);
      fired += r.fired ? 1 : 0;
      emailed += r.emailed;
      tasked += r.tasked ? 1 : 0;
    }
  }
  return { rules: rules.length, fired, emailed, tasked };
}

// ---------------------------------------------------------------------------
// Inbox + rules (console)
// ---------------------------------------------------------------------------

export interface AlertInstanceView {
  id: string;
  ruleName: string;
  kind: string;
  orgId: string;
  orgName: string;
  state: string;
  payload: Record<string, unknown>;
  firedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
}

export async function alertInbox(ctx: AuthContext, state?: string): Promise<AlertInstanceView[]> {
  requirePlatform(ctx);
  const rows = await db
    .select({
      id: platformAlertInstances.id,
      ruleName: platformAlertRules.name,
      kind: platformAlertRules.kind,
      orgId: platformAlertInstances.orgId,
      orgName: platformAlertInstances.orgName,
      state: platformAlertInstances.state,
      payload: platformAlertInstances.payload,
      firedAt: platformAlertInstances.firedAt,
      acknowledgedAt: platformAlertInstances.acknowledgedAt,
      resolvedAt: platformAlertInstances.resolvedAt,
    })
    .from(platformAlertInstances)
    .innerJoin(platformAlertRules, eq(platformAlertRules.id, platformAlertInstances.ruleId))
    .where(state ? eq(platformAlertInstances.state, state) : undefined)
    .orderBy(desc(platformAlertInstances.firedAt))
    .limit(200);
  return rows.map((r) => ({
    id: r.id,
    ruleName: r.ruleName,
    kind: r.kind,
    orgId: r.orgId,
    orgName: r.orgName,
    state: r.state,
    payload: r.payload ?? {},
    firedAt: r.firedAt.toISOString(),
    acknowledgedAt: r.acknowledgedAt ? r.acknowledgedAt.toISOString() : null,
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
  }));
}

/** Acknowledge or resolve an alert; audited on the tenant timeline (§4.3). */
export async function actOnAlert(ctx: AuthContext, alertId: string, action: "acknowledge" | "resolve"): Promise<void> {
  requirePlatform(ctx);
  const patch =
    action === "acknowledge"
      ? { state: "acknowledged" as const, acknowledgedAt: new Date() }
      : { state: "resolved" as const, resolvedAt: new Date(), resolvedBy: ctx.user.id };
  const updated = await db
    .update(platformAlertInstances)
    .set(patch)
    .where(and(eq(platformAlertInstances.id, alertId), sql`${platformAlertInstances.state} <> 'resolved'`))
    .returning({ id: platformAlertInstances.id, orgId: platformAlertInstances.orgId });
  if (!updated[0]) throw ApiError.notFound("Alert not found or already resolved");

  await audit({
    organizationId: null,
    actorUserId: ctx.user.id,
    action: action === "acknowledge" ? "PLATFORM_ALERT_ACKNOWLEDGED" : "PLATFORM_ALERT_RESOLVED",
    entityType: "platform_alert",
    entityId: updated[0].orgId,
    newValue: { alertId },
  });
}

export interface AlertRuleView {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  threshold: Record<string, unknown>;
  action: string;
}

export async function listAlertRules(ctx: AuthContext): Promise<AlertRuleView[]> {
  requirePlatform(ctx);
  const rows = await db.select().from(platformAlertRules).orderBy(platformAlertRules.createdAt);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    enabled: r.enabled,
    threshold: r.threshold ?? {},
    action: r.action,
  }));
}

/** Rule editor: enable/disable, threshold, action (§4.3). */
export async function updateAlertRule(
  ctx: AuthContext,
  ruleId: string,
  input: { name?: string; enabled?: boolean; threshold?: Record<string, unknown>; action?: string },
): Promise<void> {
  requirePlatform(ctx);
  const patch: { name?: string; enabled?: boolean; threshold?: Record<string, unknown>; action?: string } = {};
  if (input.name !== undefined) {
    const name = String(input.name ?? "").trim();
    if (!name) throw ApiError.badRequest("Rule name required");
    patch.name = name.slice(0, 120);
  }
  if (input.enabled !== undefined) patch.enabled = Boolean(input.enabled);
  if (input.threshold !== undefined) {
    if (!input.threshold || typeof input.threshold !== "object" || Array.isArray(input.threshold)) {
      throw ApiError.badRequest("threshold must be an object");
    }
    patch.threshold = input.threshold;
  }
  if (input.action !== undefined) {
    if (!(ALERT_ACTIONS as readonly string[]).includes(input.action)) {
      throw ApiError.badRequest("action must be notify_operator|email_tenant|create_task");
    }
    patch.action = input.action;
  }
  if (Object.keys(patch).length === 0) throw ApiError.badRequest("Nothing to update");
  const updated = await db
    .update(platformAlertRules)
    .set(patch)
    .where(eq(platformAlertRules.id, ruleId))
    .returning({ id: platformAlertRules.id });
  if (!updated[0]) throw ApiError.notFound("Rule not found");
  await audit({
    organizationId: null,
    actorUserId: ctx.user.id,
    action: "PLATFORM_ALERT_RULE_UPDATED",
    entityType: "platform_alert_rule",
    entityId: ruleId,
    newValue: patch,
  });
}

/** Health badge helper for Tenant 360 (fold-in #6 consumer). */
export function healthFactorMax(key: FactorKey): number {
  return healthWeights()[key];
}

export { gradeFor };
