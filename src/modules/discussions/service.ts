/**
 * Discussions (Phase D5 §43–46): threaded team conversations.
 * Company-wide by default; scope field supports team/project/department later.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { can } from "@/modules/iam/engine";
import { discussionReplies, discussions, users } from "@/db/schema";

export async function listDiscussions(ctx: AuthContext) {
  return db
    .select({
      id: discussions.id,
      title: discussions.title,
      body: discussions.body,
      pinned: discussions.pinned,
      createdBy: discussions.createdBy,
      authorName: users.name,
      authorAvatar: users.avatarUrl,
      scope: discussions.scope,
      createdAt: discussions.createdAt,
      replyCount: sql<number>`(SELECT count(*)::int FROM discussion_replies dr WHERE dr.discussion_id = ${discussions.id})`,
      lastReplyAt: sql<Date | null>`(SELECT MAX(dr.created_at) FROM discussion_replies dr WHERE dr.discussion_id = ${discussions.id})`,
    })
    .from(discussions)
    .innerJoin(users, eq(users.id, discussions.createdBy))
    .where(eq(discussions.organizationId, ctx.user.organizationId))
    .orderBy(desc(discussions.pinned), desc(discussions.createdAt))
    .limit(50);
}

export async function getDiscussion(ctx: AuthContext, id: string) {
  const [d] = await db
    .select({
      id: discussions.id,
      title: discussions.title,
      body: discussions.body,
      pinned: discussions.pinned,
      createdBy: discussions.createdBy,
      authorName: users.name,
      createdAt: discussions.createdAt,
    })
    .from(discussions)
    .innerJoin(users, eq(users.id, discussions.createdBy))
    .where(and(eq(discussions.id, id), eq(discussions.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!d) throw ApiError.notFound();

  const replies = await db
    .select({
      id: discussionReplies.id,
      body: discussionReplies.body,
      userName: users.name,
      userAvatar: users.avatarUrl,
      userId: discussionReplies.userId,
      createdAt: discussionReplies.createdAt,
    })
    .from(discussionReplies)
    .innerJoin(users, eq(users.id, discussionReplies.userId))
    .where(eq(discussionReplies.discussionId, id))
    .orderBy(asc(discussionReplies.createdAt));

  return { ...d, replies };
}

export async function createDiscussion(
  ctx: AuthContext,
  input: { title: string; body: string; pinned?: boolean },
) {
  const inserted = await db
    .insert(discussions)
    .values({
      organizationId: ctx.user.organizationId,
      title: input.title.trim().slice(0, 300),
      body: input.body.trim().slice(0, 20_000),
      createdBy: ctx.user.id,
      pinned: !!input.pinned && canManage(ctx),
    })
    .returning({ id: discussions.id });
  const row = inserted[0];
  if (!row) throw new Error("Insert returned no row");

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "DISCUSSION_CREATED",
    entityType: "discussion",
    entityId: row.id,
  });
  return row;
}

export async function addReply(ctx: AuthContext, discussionId: string, body: string) {
  const [d] = await db
    .select({ id: discussions.id })
    .from(discussions)
    .where(and(eq(discussions.id, discussionId), eq(discussions.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!d) throw ApiError.notFound();

  const inserted = await db
    .insert(discussionReplies)
    .values({ discussionId, userId: ctx.user.id, body: body.trim().slice(0, 10_000) })
    .returning({ id: discussionReplies.id });
  return inserted[0];
}

function canManage(ctx: AuthContext): boolean {
  return can(ctx.access, "announcements.manage");
}
