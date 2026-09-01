/**
 * D15 — Governance: policies, risks, controls, obligations.
 * Policies are metadata wrappers; content lives in Knowledge/Documents (§8).
 */
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { govControls, govObligations, govPolicies, govRisks } from "@/db/schema";
import { notify } from "@/modules/notifications/service";
import { can } from "@/modules/iam/engine";

function requireManage(ctx: AuthContext) {
  if (!can(ctx.access, "governance.manage")) throw ApiError.forbidden("Missing permission: governance.manage");
}

export async function listAll(ctx: AuthContext) {
  const orgId = ctx.user.organizationId;
  const [policies, risks, controls, obligations] = await Promise.all([
    db.select().from(govPolicies).where(eq(govPolicies.organizationId, orgId)).orderBy(desc(govPolicies.updatedAt)).limit(100),
    db.select().from(govRisks).where(eq(govRisks.organizationId, orgId)).orderBy(desc(govRisks.createdAt)).limit(100),
    db.select().from(govControls).where(eq(govControls.organizationId, orgId)).limit(100),
    db
      .select()
      .from(govObligations)
      .where(eq(govObligations.organizationId, orgId))
      .orderBy(desc(govObligations.createdAt))
      .limit(100),
  ]);
  return { policies, risks, controls, obligations };
}

export async function createPolicy(
  ctx: AuthContext,
  input: { title: string; status?: string; effectiveAt?: string; reviewAt?: string },
) {
  requireManage(ctx);
  const [row] = await db
    .insert(govPolicies)
    .values({
      organizationId: ctx.user.organizationId,
      title: input.title.trim().slice(0, 200),
      ownerId: ctx.user.id,
      status: ["draft", "active", "retired"].includes(input.status ?? "") ? input.status! : "draft",
      effectiveAt: input.effectiveAt ?? null,
      reviewAt: input.reviewAt ?? null,
    })
    .returning({ id: govPolicies.id });
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "POLICY_CREATED",
    entityType: "gov_policy",
    entityId: row!.id,
  });
  return row!.id;
}

export async function setPolicyStatus(ctx: AuthContext, id: string, status: string, bumpVersion = false) {
  requireManage(ctx);
  const updated = await db
    .update(govPolicies)
    .set({
      status,
      updatedAt: new Date(),
      // bumping the version records a substantive revision, not just a
      // status flip (draft → active → retired)
      ...(bumpVersion ? { version: sql`${govPolicies.version} + 1` } : {}),
    })
    .where(and(eq(govPolicies.id, id), eq(govPolicies.organizationId, ctx.user.organizationId)))
    .returning({ id: govPolicies.id, version: govPolicies.version });
  if (!updated[0]) throw ApiError.notFound();
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "POLICY_STATUS_SET",
    entityType: "gov_policy",
    entityId: id,
    newValue: { status, version: updated[0].version },
  });
}

export async function createRisk(
  ctx: AuthContext,
  input: { title: string; category?: string; impact?: string; likelihood?: string; mitigation?: string },
) {
  requireManage(ctx);
  const pick = (v: string | undefined, allowed: string[], dflt: string) => (allowed.includes(v ?? "") ? v! : dflt);
  const [row] = await db
    .insert(govRisks)
    .values({
      organizationId: ctx.user.organizationId,
      title: input.title.trim().slice(0, 200),
      category: input.category ?? null,
      impact: pick(input.impact, ["low", "medium", "high", "critical"], "medium"),
      likelihood: pick(input.likelihood, ["low", "medium", "high"], "medium"),
      mitigation: input.mitigation ?? null,
    })
    .returning({ id: govRisks.id });
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "RISK_CREATED",
    entityType: "gov_risk",
    entityId: row!.id,
  });
  return row!.id;
}

export async function setRiskStatus(ctx: AuthContext, id: string, status: string) {
  requireManage(ctx);
  if (!["open", "mitigated", "accepted", "closed"].includes(status)) throw ApiError.badRequest("Unknown risk status");
  const updated = await db
    .update(govRisks)
    .set({ status })
    .where(and(eq(govRisks.id, id), eq(govRisks.organizationId, ctx.user.organizationId)))
    .returning({ id: govRisks.id });
  if (!updated[0]) throw ApiError.notFound();
}


// ---------- R8-pattern: overdue obligations sweep (idempotent) ----------
export async function escalateOverdueObligations(ctx: AuthContext) {
  requireManage(ctx);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = await db
    .select({ id: govObligations.id, title: govObligations.title })
    .from(govObligations)
    .where(
      and(
        eq(govObligations.organizationId, ctx.user.organizationId),
        eq(govObligations.status, "open"),
        lt(govObligations.dueAt, today),
      ),
    )
    .limit(200);
  let escalated = 0;
  for (const o of overdue) {
    const upd = await db
      .update(govObligations)
      .set({ escalatedAt: new Date() })
      .where(and(eq(govObligations.id, o.id), isNull(govObligations.escalatedAt)))
      .returning({ id: govObligations.id });
    if (!upd[0]) continue;
    escalated++;
  }
  if (escalated > 0) {
    // notify governance.manage holders (cap 10)
    const holders = await db.execute(sql`
      SELECT DISTINCT ur.user_id AS id
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      JOIN role_permissions rp ON rp.role_id = ur.role_id
      WHERE r.organization_id = ${ctx.user.organizationId}
        AND rp.permission = 'governance.manage'
      LIMIT 10
    `);
    for (const h of (holders.rows as { id: string }[])) {
      await notify({ organizationId: ctx.user.organizationId, userId: h.id, type: "governance", title: "Compliance obligation overdue", body: `${escalated} obligation(s) past due date.`, link: "/governance" });
    }
  }
  await audit({ organizationId: ctx.user.organizationId, actorUserId: ctx.user.id, action: "GOVERNANCE_OBLIGATIONS_ESCALATED", entityType: "gov_obligation", newValue: { escalated } });
  return escalated;
}
export async function createObligation(
  ctx: AuthContext,
  input: { title: string; dueAt?: string; notes?: string },
) {
  requireManage(ctx);
  const [row] = await db
    .insert(govObligations)
    .values({
      organizationId: ctx.user.organizationId,
      title: input.title.trim().slice(0, 200),
      dueAt: input.dueAt ?? null,
      notes: input.notes ?? null,
    })
    .returning({ id: govObligations.id });
  return row!.id;
}

/** open → met, or reopen a met obligation. Audited either way. */
export async function setObligationStatus(ctx: AuthContext, id: string, status: string) {
  requireManage(ctx);
  if (!["open", "met"].includes(status)) throw ApiError.badRequest("Unknown obligation status");
  const updated = await db
    .update(govObligations)
    .set({ status, escalatedAt: null })
    .where(and(eq(govObligations.id, id), eq(govObligations.organizationId, ctx.user.organizationId)))
    .returning({ id: govObligations.id });
  if (!updated[0]) throw ApiError.notFound();
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "OBLIGATION_STATUS_SET",
    entityType: "gov_obligation",
    entityId: id,
    newValue: { status },
  });
}
export async function createControl(
  ctx: AuthContext,
  input: { name: string; description?: string },
) {
  requireManage(ctx);
  const [row] = await db
    .insert(govControls)
    .values({
      organizationId: ctx.user.organizationId,
      name: input.name.trim().slice(0, 200),
      description: input.description ?? null,
    })
    .returning({ id: govControls.id });
  return row!.id;
}

export async function setControlResult(
  ctx: AuthContext,
  id: string,
  input: { status?: string; result?: string },
) {
  requireManage(ctx);
  const patch: Record<string, unknown> = { lastTestedAt: new Date() };
  if (input.status && ["planned", "partial", "implemented"].includes(input.status)) patch.status = input.status;
  if (input.result && ["pass", "fail", "not_tested"].includes(input.result)) patch.result = input.result;
  const updated = await db
    .update(govControls)
    .set(patch)
    .where(and(eq(govControls.id, id), eq(govControls.organizationId, ctx.user.organizationId)))
    .returning({ id: govControls.id });
  if (!updated[0]) throw ApiError.notFound();
}