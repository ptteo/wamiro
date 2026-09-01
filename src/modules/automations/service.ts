/**
 * Automation rules lite (blueprint §26 Automation / §53): event-triggered
 * rules evaluated when requests are created. v1 supports numeric payload
 * conditions and email-fanout actions. Errors never break the main flow.
 */
import { and, asc, eq, or, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { can } from "@/modules/iam/engine";
import { automationRules, notifications, users } from "@/db/schema";

const OPS: Record<string, (a: number, b: number) => boolean> = {
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  eq: (a, b) => a === b,
};

function canManage(ctx: AuthContext): boolean {
  return can(ctx.access, "automations.manage");
}

export async function listRules(ctx: AuthContext) {
  if (!canManage(ctx)) throw ApiError.forbidden("Missing permission: automations.manage");
  return db
    .select({
      id: automationRules.id,
      name: automationRules.name,
      conditionField: automationRules.conditionField,
      conditionOp: automationRules.conditionOp,
      conditionValue: automationRules.conditionValue,
      notifyEmails: automationRules.notifyEmails,
      active: automationRules.active,
    })
    .from(automationRules)
    .where(eq(automationRules.organizationId, ctx.user.organizationId))
    .orderBy(asc(automationRules.name));
}

export interface CreateRuleInput {
  name: string;
  requestTypeId?: string | null;
  conditionField?: string | null;
  conditionOp?: string | null;
  conditionValue?: number | null;
  notifyEmails: string[];
}

export async function createRule(ctx: AuthContext, input: CreateRuleInput) {
  if (!canManage(ctx)) throw ApiError.forbidden("Missing permission: automations.manage");
  const emails = input.notifyEmails.map((e) => e.trim().toLowerCase()).filter(Boolean).slice(0, 10);
  if (emails.length === 0) throw ApiError.badRequest("At least one notification email required");

  const inserted = await db
    .insert(automationRules)
    .values({
      organizationId: ctx.user.organizationId,
      name: input.name.trim().slice(0, 120),
      eventType: "request.created",
      requestTypeId: input.requestTypeId ?? null,
      conditionField: input.conditionField?.trim().slice(0, 60) || null,
      conditionOp: OPS[input.conditionOp ?? ""] ? input.conditionOp! : "gt",
      conditionValue:
        input.conditionValue !== null && input.conditionValue !== undefined
          ? String(input.conditionValue)
          : null,
      notifyEmails: emails,
      createdBy: ctx.user.id,
    })
    .returning({ id: automationRules.id });
  const row = inserted[0];
  if (!row) throw new Error("Insert returned no row");

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "AUTOMATION_CREATED",
    entityType: "automation_rule",
    entityId: row.id,
    newValue: { name: input.name },
  });
}

export async function deactivateRule(ctx: AuthContext, ruleId: string) {
  if (!canManage(ctx)) throw ApiError.forbidden("Missing permission: automations.manage");
  const updated = await db
    .update(automationRules)
    .set({ active: false })
    .where(and(eq(automationRules.id, ruleId), eq(automationRules.organizationId, ctx.user.organizationId)))
    .returning({ id: automationRules.id });
  if (!updated[0]) throw ApiError.notFound();

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "AUTOMATION_DEACTIVATED",
    entityType: "automation_rule",
    entityId: ruleId,
  });
}

/**
 * Evaluate active rules for one org against a created request.
 * Swallows its own errors — automations must never break the main flow.
 */
export async function evaluateRequestCreated(
  orgId: string,
  requester: { id: string; name: string },
  requestTypeId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const rules = await db
      .select()
      .from(automationRules)
      .where(
        and(
          eq(automationRules.organizationId, orgId),
          eq(automationRules.active, true),
          eq(automationRules.eventType, "request.created"),
          or(isNull(automationRules.requestTypeId), eq(automationRules.requestTypeId, requestTypeId)),
        ),
      );

    for (const rule of rules) {
      let matched = true;
      if (rule.conditionField && rule.conditionValue !== null) {
        const actual = Number(payload[rule.conditionField]);
        const expected = Number(rule.conditionValue);
        matched = Number.isFinite(actual) && (OPS[rule.conditionOp] ?? (() => false))(actual, expected);
      }
      if (!matched) continue;

      for (const email of rule.notifyEmails) {
        // resolve to an in-tenant user; unknown emails are skipped silently
        const [u] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.email, email), eq(users.organizationId, orgId)))
          .limit(1);
        if (!u) continue;
        await db.insert(notifications).values({
          organizationId: orgId,
          userId: u.id,
          type: "automation.matched",
          title: `Automation "${rule.name}" matched`,
          body: `Request submitted by ${requester.name}`,
          link: "/approvals",
        });
      }

      await audit({
        organizationId: orgId,
        actorUserId: null,
        action: "AUTOMATION_MATCHED",
        entityType: "automation_rule",
        entityId: rule.id,
        metadata: { requester: requester.name },
      });
    }
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "automation_eval_failed", err: String(e) }));
  }
}
