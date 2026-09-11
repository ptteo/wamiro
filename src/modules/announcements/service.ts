import { and, desc, eq, gt, lte, or } from "drizzle-orm";

import { db, first } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { announcements, departments, employees, users } from "@/db/schema";

/**
 * Visible announcements for the viewer: published, and audience-matched
 * (company-wide, or 'department' rows targeting the viewer's department).
 * Scheduled future rows stay hidden until the publish sweep stamps them.
 */
export async function listRecent(ctx: AuthContext, limit = 50) {
  const [emp] = await db
    .select({ departmentId: employees.departmentId })
    .from(employees)
    .where(and(eq(employees.userId, ctx.user.id), eq(employees.organizationId, ctx.user.organizationId)))
    .limit(1);
  const departmentId = emp?.departmentId ?? null;

  // Audience filter: company-wide rows for everyone, department rows only
  // when the viewer belongs to that department. Never compare the uuid
  // column to a sentinel — build the branch conditionally instead.
  const audienceFilter = departmentId
    ? or(
        eq(announcements.audience, "company"),
        and(eq(announcements.audience, "department"), eq(announcements.departmentId, departmentId)),
      )
    : eq(announcements.audience, "company");

  return db
    .select({
      id: announcements.id,
      title: announcements.title,
      body: announcements.body,
      authorName: users.name,
      authorAvatar: users.avatarUrl,
      authorId: announcements.authorUserId,
      audience: announcements.audience,
      departmentId: announcements.departmentId,
      scheduledFor: announcements.scheduledFor,
      publishedAt: announcements.publishedAt,
    })
    .from(announcements)
    .leftJoin(users, eq(users.id, announcements.authorUserId))
    .where(
      and(
        eq(announcements.organizationId, ctx.user.organizationId),
        // scheduled rows are hidden until published (published_at <= now)
        lte(announcements.publishedAt, new Date()),
        audienceFilter,
      ),
    )
    .orderBy(desc(announcements.publishedAt))
    .limit(limit);
}

export async function create(
  ctx: AuthContext,
  input: {
    title: string;
    body: string;
    /** 'company' (default) | 'department' */
    audience?: string;
    departmentId?: string | null;
    /** future timestamp = scheduled; omit/now = publish immediately */
    scheduledFor?: string | null;
  },
) {
  const audience = input.audience === "department" ? "department" : "company";
  if (audience === "department" && !input.departmentId) {
    throw ApiError.badRequest("Department audience requires a department");
  }
  if (input.departmentId) {
    const [dept] = await db
      .select({ id: departments.id })
      .from(departments)
      .where(and(eq(departments.id, input.departmentId), eq(departments.organizationId, ctx.user.organizationId)))
      .limit(1);
    if (!dept) throw ApiError.badRequest("Unknown department");
  }
  let scheduledFor: Date | null = null;
  if (input.scheduledFor) {
    const d = new Date(input.scheduledFor);
    if (Number.isNaN(d.getTime())) throw ApiError.badRequest("Invalid schedule date");
    if (d.getTime() > Date.now()) scheduledFor = d;
  }

  const row = first(
    await db
      .insert(announcements)
      .values({
        organizationId: ctx.user.organizationId,
        authorUserId: ctx.user.id,
        title: input.title.trim().slice(0, 150),
        body: input.body.trim().slice(0, 5000),
        audience,
        departmentId: audience === "department" ? input.departmentId : null,
        scheduledFor,
        // scheduled rows carry a future published_at until the sweep stamps
        // them; immediate rows publish now.
        publishedAt: scheduledFor ?? new Date(),
      })
      .returning({ id: announcements.id }),
  );

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: scheduledFor ? "ANNOUNCEMENT_SCHEDULED" : "ANNOUNCEMENT_PUBLISHED",
    entityType: "announcement",
    entityId: row.id,
    newValue: { title: input.title, audience, scheduledFor: scheduledFor?.toISOString() ?? null },
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
