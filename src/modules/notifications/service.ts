import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { emailKindAllowed, groupDigest, inQuietHours, parseEmailPrefs } from "@/lib/email-prefs";
import { appUrl, renderBrandedEmail, sendEmail } from "@/lib/mailer";
import type { AuthContext } from "@/lib/session";
import { notifications, userPreferences, users } from "@/db/schema";

/**
 * The set of notification kinds the system emits. Kept as a union of
 * string literals so the UI can map each one to an icon and tone
 * without a separate switch on a free-form string. The DB column
 * remains `text` for forward-compatibility with kinds not yet in this
 * union (the UI just falls back to a generic icon).
 */
export type NotificationKind =
  | "leave"             // leave.requested / leave.approved / leave.rejected
  | "request"           // request.created / .approved / .rejected / .step_pending
  | "task"              // task.assigned
  | "project"           // project.member_added
  | "team"              // team.member_added
  | "announcement"      // announcement broadcast
  | "asset"             // asset.assigned
  | "ticket"            // ticket.assigned / .updated / .resolved / .sla_warning / .sla_breached / .reply
  | "automation"        // automation.matched
  | "governance"        // governance obligation overdue
  | "recognition"       // recognition given
  | "ai"                // AI result
  | "system";           // platform / generic

export interface NotifyInput {
  organizationId: string;
  userId: string;
  type: NotificationKind | string;
  title: string;
  body?: string | null;
  link?: string | null;
}

/** Fire-and-forget notification: in-app row + optional SMTP email fan-out. */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    await db.insert(notifications).values({
      organizationId: input.organizationId,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "notify_failed", type: input.type, err: String(e) }));
  }

  // email copy — never blocks or fails the triggering request
  if (process.env.SMTP_URL) {
    void deliverEmail(input).catch((e) =>
      console.error(JSON.stringify({ level: "error", msg: "email_deliver_async_failed", err: String(e) })),
    );
  }

  // web push copy (Phase D) — needs VAPID keys configured; best-effort only
  void import("@/modules/push/service").then(({ deliverPushNotifications }) =>
    deliverPushNotifications({
      organizationId: input.organizationId,
      userId: input.userId,
      message: { title: input.title, body: input.body, url: input.link },
    }).catch((e) =>
      console.error(JSON.stringify({ level: "error", msg: "push_deliver_failed", err: String(e) })),
    ),
  );
}

function emailCopy(input: NotifyInput): { subject: string; body: string; actionLabel: string } {
  const type = input.type;
  if (type.startsWith("leave.") && /approved|rejected/.test(type)) {
    return {
      subject: input.title,
      body: input.body ?? "Your leave request has a decision.",
      actionLabel: "View leave",
    };
  }
  if (type === "ticket" && /reply/i.test(input.title)) {
    return {
      subject: input.title,
      body: input.body ?? "There's a new reply on your ticket.",
      actionLabel: "Open ticket",
    };
  }
  return {
    subject: input.title,
    body: input.body ?? "There is something new waiting for you in Wamiro.",
    actionLabel: "Open Wamiro",
  };
}

async function loadEmailPrefs(userId: string, orgId: string) {
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

async function deliverEmail(input: NotifyInput): Promise<void> {
  const [u] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  if (!u) return;
  const prefs = await loadEmailPrefs(input.userId, input.organizationId);
  if (!emailKindAllowed(prefs, input.type)) return;
  if (inQuietHours(new Date(), prefs.quietHours)) return;
  const copy = emailCopy(input);
  const url = `${appUrl()}${input.link ?? ""}`;
  const html = renderBrandedEmail({
    title: copy.subject,
    body: copy.body,
    actionLabel: copy.actionLabel,
    actionUrl: url,
  });
  await sendEmail(u.email, copy.subject, html);
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Weekly unread digest. Ledger is written by the jobs worker. */
export async function sendWeeklyDigests(): Promise<{ sent: number; skipped: number }> {
  const rows = await db
    .select({
      userId: userPreferences.userId,
      organizationId: userPreferences.organizationId,
      value: userPreferences.value,
      email: users.email,
      homeOrg: users.organizationId,
    })
    .from(userPreferences)
    .innerJoin(users, eq(users.id, userPreferences.userId))
    .where(eq(userPreferences.key, "emailPrefs"));

  let sent = 0;
  let skipped = 0;
  const now = Date.now();
  for (const row of rows) {
    const prefs = parseEmailPrefs(row.value);
    if (prefs.digest !== "weekly") {
      skipped += 1;
      continue;
    }
    const last = prefs.lastDigestAt ? Date.parse(prefs.lastDigestAt) : 0;
    if (last && now - last < WEEK_MS) {
      skipped += 1;
      continue;
    }
    const orgId = row.organizationId ?? row.homeOrg;
    const since = last ? new Date(last) : new Date(now - WEEK_MS);
    const unread = await db
      .select({ type: notifications.type, title: notifications.title })
      .from(notifications)
      .where(
        and(
          eq(notifications.organizationId, orgId),
          eq(notifications.userId, row.userId),
          isNull(notifications.readAt),
          gt(notifications.createdAt, since),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    if (unread.length === 0) {
      skipped += 1;
      continue;
    }
    const groups = groupDigest(unread);
    const body = groups.map((g) => `${g.count}× ${g.type}: ${g.sample}`).join("\n");
    const html = renderBrandedEmail({
      title: "Your weekly Wamiro digest",
      body,
      actionLabel: "Open notifications",
      actionUrl: `${appUrl()}/notifications`,
    });
    await sendEmail(row.email, "Your weekly Wamiro digest", html);
    await db
      .update(userPreferences)
      .set({
        value: { ...prefs, lastDigestAt: new Date().toISOString() } as never,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userPreferences.userId, row.userId),
          eq(userPreferences.key, "emailPrefs"),
          row.organizationId === null
            ? isNull(userPreferences.organizationId)
            : eq(userPreferences.organizationId, row.organizationId),
        ),
      );
    sent += 1;
  }
  return { sent, skipped };
}

export async function listMine(ctx: AuthContext, limit = 30) {
  return db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      link: notifications.link,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, ctx.user.organizationId),
        eq(notifications.userId, ctx.user.id),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function unreadCount(ctx: AuthContext): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, ctx.user.organizationId),
        eq(notifications.userId, ctx.user.id),
        isNull(notifications.readAt),
      ),
    );
  return row?.count ?? 0;
}

export async function markAllRead(ctx: AuthContext): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.organizationId, ctx.user.organizationId),
        eq(notifications.userId, ctx.user.id),
        isNull(notifications.readAt),
      ),
    );
}

export async function markRead(ctx: AuthContext, id: string): Promise<boolean> {
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.organizationId, ctx.user.organizationId),
        eq(notifications.userId, ctx.user.id),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id });
  return updated.length > 0;
}

export async function listMineGrouped(
  ctx: AuthContext,
  opts: { onlyUnread?: boolean; limit?: number } = {},
) {
  const whereParts = [
    eq(notifications.organizationId, ctx.user.organizationId),
    eq(notifications.userId, ctx.user.id),
  ];
  if (opts.onlyUnread) whereParts.push(isNull(notifications.readAt));
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      link: notifications.link,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(and(...whereParts))
    .orderBy(desc(notifications.createdAt))
    .limit(opts.limit ?? 100);
  return rows;
}
