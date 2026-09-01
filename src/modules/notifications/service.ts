import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { sendEmail } from "@/lib/mailer";
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
}

async function deliverEmail(input: NotifyInput): Promise<void> {
  const [u] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  if (!u) return;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const url = `${appUrl}${input.link ?? ""}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">
      <h2 style="font-size:16px;color:#0f172a">${escapeHtml(input.title)}</h2>
      ${input.body ? `<p style="color:#475569;font-size:14px">${escapeHtml(input.body)}</p>` : ""}
      <p style="margin-top:16px">
        <a href="${url}" style="background:#4f46e5;color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none;font-size:13px">Open Wamiro</a>
      </p>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px">You are receiving this because of activity in your Wamiro workspace.</p>
    </div>`;
  await sendEmail(u.email, input.title, html);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// avoid a hard import cycle with mailer config probing
// (kept as a comment marker: SMTP_URL is read inline above)

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
