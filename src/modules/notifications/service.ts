import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { appUrl, renderBrandedEmail, sendEmail } from "@/lib/mailer";
import type { AuthContext } from "@/lib/session";
import { notifications, users } from "@/db/schema";

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

async function deliverEmail(input: NotifyInput): Promise<void> {
  const [u] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  if (!u) return;
  const url = `${appUrl()}${input.link ?? ""}`;
  const html = renderBrandedEmail({
    title: input.title,
    body: input.body ?? "There is something new waiting for you in Wamiro.",
    actionLabel: "Open Wamiro",
    actionUrl: url,
  });
  await sendEmail(u.email, input.title, html);
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
