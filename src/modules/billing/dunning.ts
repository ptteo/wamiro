/**
 * Dunning sweep — email billing contacts on past_due day 1 / 3 / 7.
 * Idempotent via organizations.dunning_stage. SMTP is optional; the stage
 * still advances so isolation tests don't need a mailer.
 */
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { emailKindAllowed, parseEmailPrefs } from "@/lib/email-prefs";
import { appUrl, renderBrandedEmail, sendEmail } from "@/lib/mailer";
import {
  notifications,
  organizations,
  rolePermissions,
  roles,
  userPreferences,
  userRoles,
  users,
} from "@/db/schema";

const STAGES = [1, 3, 7] as const;

function copyFor(stage: number, orgName: string): { title: string; body: string } {
  if (stage >= 7) {
    return {
      title: `Last notice: ${orgName} payment is still overdue`,
      body: `We have not received payment for ${orgName}. Update the card in Plan & Billing today. If the subscription is cancelled, people will lose access until it is reactivated. Company data is kept until an admin deletes the company.`,
    };
  }
  if (stage >= 3) {
    return {
      title: `Reminder: ${orgName} payment still needs attention`,
      body: `The subscription for ${orgName} is still past due. Open Plan & Billing and update the payment method so your team keeps access.`,
    };
  }
  return {
    title: `Payment failed for ${orgName}`,
    body: `We could not collect the latest payment for ${orgName}. Update the card in Plan & Billing to keep the workspace available.`,
  };
}

async function billingContacts(orgId: string): Promise<{ id: string; email: string; name: string }[]> {
  const rows = await db
    .selectDistinct({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .where(
      and(
        eq(users.organizationId, orgId),
        eq(users.status, "active"),
        eq(roles.organizationId, orgId),
        eq(rolePermissions.permission, "settings.manage"),
      ),
    );
  return rows;
}

async function prefsFor(userId: string, orgId: string) {
  const rows = await db
    .select({ value: userPreferences.value, org: userPreferences.organizationId })
    .from(userPreferences)
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, "emailPrefs")));
  let raw: unknown;
  for (const r of rows) {
    if (r.org === null || r.org === orgId) raw = r.value;
  }
  return parseEmailPrefs(raw);
}

async function sendDunning(orgId: string, orgName: string, stage: number): Promise<number> {
  const copy = copyFor(stage, orgName);
  const contacts = await billingContacts(orgId);
  let sent = 0;
  const link = "/settings/billing";
  for (const u of contacts) {
    try {
      await db.insert(notifications).values({
        organizationId: orgId,
        userId: u.id,
        type: "billing.dunning",
        title: copy.title,
        body: copy.body,
        link,
      });
    } catch (e) {
      console.error(JSON.stringify({ level: "error", msg: "dunning_notify_failed", orgId, err: String(e) }));
    }
    const prefs = await prefsFor(u.id, orgId);
    if (!emailKindAllowed(prefs, "billing.dunning")) continue;
    const html = renderBrandedEmail({
      title: copy.title,
      body: copy.body,
      actionLabel: "Open Plan & Billing",
      actionUrl: `${appUrl()}${link}`,
    });
    if (await sendEmail(u.email, copy.title, html)) sent += 1;
  }
  return sent;
}

/**
 * Advance dunning for every past_due tenant. `now` is injectable for tests.
 * Returns how many orgs moved to a new stage.
 */
export async function sweepDunning(now: Date = new Date(), onlyOrgId?: string): Promise<{ advanced: number }> {
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      dunningStage: organizations.dunningStage,
      changedAt: organizations.billingStatusChangedAt,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.billingStatus, "past_due"),
        sql`${organizations.billingStatusChangedAt} IS NOT NULL`,
        onlyOrgId ? eq(organizations.id, onlyOrgId) : sql`true`,
      ),
    );

  let advanced = 0;
  for (const org of rows) {
    if (!org.changedAt) continue;
    const days = Math.floor((now.getTime() - org.changedAt.getTime()) / 86_400_000);
    const next = [...STAGES].reverse().find((s) => days >= s && org.dunningStage < s);
    if (next === undefined) continue;
    await sendDunning(org.id, org.name, next);
    await db
      .update(organizations)
      .set({ dunningStage: next, updatedAt: now })
      .where(and(eq(organizations.id, org.id), eq(organizations.billingStatus, "past_due")));
    advanced += 1;
  }
  return { advanced };
}
