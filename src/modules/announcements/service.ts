import { and, desc, eq } from "drizzle-orm";

import { db, first } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { announcements, users } from "@/db/schema";

export async function listRecent(ctx: AuthContext, limit = 50) {
  return db
    .select({
      id: announcements.id,
      title: announcements.title,
      body: announcements.body,
      authorName: users.name,
      authorAvatar: users.avatarUrl,
      authorId: announcements.authorUserId,
      audience: announcements.audience,
      publishedAt: announcements.publishedAt,
    })
    .from(announcements)
    .leftJoin(users, eq(users.id, announcements.authorUserId))
    .where(eq(announcements.organizationId, ctx.user.organizationId))
    .orderBy(desc(announcements.publishedAt))
    .limit(limit);
}

export async function create(ctx: AuthContext, input: { title: string; body: string }) {
  const row = first(
    await db
      .insert(announcements)
      .values({
        organizationId: ctx.user.organizationId,
        authorUserId: ctx.user.id,
        title: input.title.trim(),
        body: input.body.trim(),
      })
      .returning({ id: announcements.id }),
  );

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "ANNOUNCEMENT_PUBLISHED",
    entityType: "announcement",
    entityId: row.id,
    newValue: { title: input.title },
  });
  return row;
}

export async function remove(ctx: AuthContext, id: string) {
  const [row] = await db
    .select({ id: announcements.id })
    .from(announcements)
    .where(
      and(
        eq(announcements.id, id),
        eq(announcements.organizationId, ctx.user.organizationId),
      ),
    )
    .limit(1);
  if (!row) throw ApiError.notFound();

  await db.delete(announcements).where(eq(announcements.id, id));
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "ANNOUNCEMENT_DELETED",
    entityType: "announcement",
    entityId: id,
  });
}
