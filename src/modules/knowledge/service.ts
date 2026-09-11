import { and, desc, eq, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import { embedText } from "@/lib/embeddings";
import type { AuthContext } from "@/lib/session";
import { employees, knowledgeArticles, knowledgeVersions, knowledgeVotes, users } from "@/db/schema";
import { can } from "@/modules/iam/engine";

/** Best-effort embedding; never blocks publish (search falls back to ILIKE). */
async function storeEmbedding(articleId: string, text: string): Promise<void> {
  try {
    const vector = await embedText(text);
    if (!vector) return;
    const literal = `[${vector.join(",")}]`;
    await db.execute(
      sql`UPDATE knowledge_articles SET embedding = ${literal}::vector WHERE id = ${articleId}`,
    );
  } catch {
    /* embedding is optional */
  }
}

export interface ArticleRow {
  id: string;
  title: string;
  body: string;
  tags: string[];
  authorName: string | null;
  updatedAt: Date;
}

export async function list(ctx: AuthContext, limit = 100): Promise<ArticleRow[]> {
  const visibility = await visibilityFilter(ctx);
  return db
    .select({
      id: knowledgeArticles.id,
      title: knowledgeArticles.title,
      body: knowledgeArticles.body,
      tags: knowledgeArticles.tags,
      authorName: users.name,
      visibility: knowledgeArticles.visibility,
      departmentId: knowledgeArticles.departmentId,
      updatedAt: knowledgeArticles.updatedAt,
    })
    .from(knowledgeArticles)
    .leftJoin(users, eq(users.id, knowledgeArticles.authorUserId))
    .where(and(eq(knowledgeArticles.organizationId, ctx.user.organizationId), visibility))
    .orderBy(desc(knowledgeArticles.updatedAt))
    .limit(limit);
}

/**
 * Phase 8 — per-article permission filter. 'company' (default) is visible to
 * everyone; 'department' only to members of the target department; 'draft'
 * only to knowledge managers. Managers bypass the filter.
 */
async function visibilityFilter(ctx: AuthContext) {
  if (can(ctx.access, "knowledge.manage")) return sql`true`;
  const [emp] = await db
    .select({ departmentId: employees.departmentId })
    .from(employees)
    .where(and(eq(employees.userId, ctx.user.id), eq(employees.organizationId, ctx.user.organizationId)))
    .limit(1);
  const dept = emp?.departmentId ?? "__none__";
  return or(
    eq(knowledgeArticles.visibility, "company"),
    and(eq(knowledgeArticles.visibility, "department"), eq(knowledgeArticles.departmentId, dept)),
  )!;
}

export async function get(ctx: AuthContext, id: string): Promise<ArticleRow | null> {
  const visibility = await visibilityFilter(ctx);
  const [row] = await db
    .select({
      id: knowledgeArticles.id,
      title: knowledgeArticles.title,
      body: knowledgeArticles.body,
      tags: knowledgeArticles.tags,
      authorName: users.name,
      visibility: knowledgeArticles.visibility,
      departmentId: knowledgeArticles.departmentId,
      updatedAt: knowledgeArticles.updatedAt,
    })
    .from(knowledgeArticles)
    .leftJoin(users, eq(users.id, knowledgeArticles.authorUserId))
    .where(
      and(
        eq(knowledgeArticles.id, id),
        eq(knowledgeArticles.organizationId, ctx.user.organizationId),
        visibility,
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function create(
  ctx: AuthContext,
  input: { title: string; body: string; tags?: string[]; visibility?: string; departmentId?: string | null },
) {
  if (!can(ctx.access, "knowledge.manage")) {
    throw ApiError.forbidden("Missing permission: knowledge.manage");
  }
  const visibility = input.visibility === "department" || input.visibility === "draft" ? input.visibility : "company";
  if (visibility === "department" && !input.departmentId) {
    throw ApiError.badRequest("Department visibility requires a department");
  }
  const inserted = await db
    .insert(knowledgeArticles)
    .values({
      organizationId: ctx.user.organizationId,
      authorUserId: ctx.user.id,
      title: input.title.trim().slice(0, 200),
      body: input.body.trim().slice(0, 50_000),
      tags: (input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8),
      visibility,
      departmentId: visibility === "department" ? input.departmentId : null,
    })
    .returning({ id: knowledgeArticles.id });
  const row = inserted[0];
  if (!row) throw new Error("Insert returned no row");

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "ARTICLE_PUBLISHED",
    entityType: "knowledge_article",
    entityId: row.id,
    newValue: { title: input.title, visibility },
  });
  // fire-and-forget semantic index
  void storeEmbedding(row.id, `${input.title}\n${input.body}`);
  return row;
}

export async function update(
  ctx: AuthContext,
  id: string,
  input: { title: string; body: string; tags?: string[]; visibility?: string; departmentId?: string | null },
) {
  if (!can(ctx.access, "knowledge.manage")) {
    throw ApiError.forbidden("Missing permission: knowledge.manage");
  }
  // Phase 8 — snapshot the pre-edit version for history (bounded at 20).
  const [before] = await db
    .select({ title: knowledgeArticles.title, body: knowledgeArticles.body, tags: knowledgeArticles.tags })
    .from(knowledgeArticles)
    .where(and(eq(knowledgeArticles.id, id), eq(knowledgeArticles.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!before) throw ApiError.notFound();
  await db.insert(knowledgeVersions).values({
    organizationId: ctx.user.organizationId,
    articleId: id,
    title: before.title,
    body: before.body,
    tags: before.tags,
    editorUserId: ctx.user.id,
  });
  await db.execute(sql`
    DELETE FROM knowledge_versions
    WHERE article_id = ${id}
      AND id NOT IN (
        SELECT id FROM knowledge_versions WHERE article_id = ${id}
        ORDER BY created_at DESC LIMIT 20
      )
  `);

  const visibility =
    input.visibility === "department" || input.visibility === "draft" || input.visibility === "company"
      ? input.visibility
      : undefined;
  if (visibility === "department" && !input.departmentId) {
    throw ApiError.badRequest("Department visibility requires a department");
  }
  const updated = await db
    .update(knowledgeArticles)
    .set({
      title: input.title.trim().slice(0, 200),
      body: input.body.trim().slice(0, 50_000),
      tags: (input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8),
      ...(visibility ? { visibility, departmentId: visibility === "department" ? input.departmentId : null } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(knowledgeArticles.id, id),
        eq(knowledgeArticles.organizationId, ctx.user.organizationId),
      ),
    )
    .returning({ id: knowledgeArticles.id });
  if (!updated[0]) throw ApiError.notFound();

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "ARTICLE_UPDATED",
    entityType: "knowledge_article",
    entityId: id,
  });
  void storeEmbedding(id, `${input.title}\n${input.body}`);
}

/** Phase 8 — version history for an article (knowledge.manage only). */
export async function listVersions(ctx: AuthContext, articleId: string) {
  if (!can(ctx.access, "knowledge.manage")) throw ApiError.forbidden("Missing permission: knowledge.manage");
  return db
    .select({
      id: knowledgeVersions.id,
      title: knowledgeVersions.title,
      tags: knowledgeVersions.tags,
      editorName: users.name,
      createdAt: knowledgeVersions.createdAt,
    })
    .from(knowledgeVersions)
    .leftJoin(users, eq(users.id, knowledgeVersions.editorUserId))
    .where(and(eq(knowledgeVersions.articleId, articleId), eq(knowledgeVersions.organizationId, ctx.user.organizationId)))
    .orderBy(desc(knowledgeVersions.createdAt))
    .limit(20);
}

/** Phase 8 — restore a previous version (creates a new snapshot first). */
export async function restoreVersion(ctx: AuthContext, articleId: string, versionId: string) {
  if (!can(ctx.access, "knowledge.manage")) throw ApiError.forbidden("Missing permission: knowledge.manage");
  const [v] = await db
    .select()
    .from(knowledgeVersions)
    .where(and(eq(knowledgeVersions.id, versionId), eq(knowledgeVersions.articleId, articleId), eq(knowledgeVersions.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!v) throw ApiError.notFound();
  await update(ctx, articleId, { title: v.title, body: v.body, tags: v.tags });
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "ARTICLE_VERSION_RESTORED",
    entityType: "knowledge_article",
    entityId: articleId,
    newValue: { versionId },
  });
}

/** Phase 8 — helpful vote (one per user per article; upsert + un-vote). */
export async function voteHelpful(ctx: AuthContext, articleId: string, helpful: boolean): Promise<{ helpfulCount: number; myVote: boolean | null }> {
  const [article] = await db
    .select({ id: knowledgeArticles.id })
    .from(knowledgeArticles)
    .where(and(eq(knowledgeArticles.id, articleId), eq(knowledgeArticles.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!article) throw ApiError.notFound();
  if (helpful) {
    await db
      .insert(knowledgeVotes)
      .values({ articleId, userId: ctx.user.id, helpful: true })
      .onConflictDoUpdate({ target: [knowledgeVotes.articleId, knowledgeVotes.userId], set: { helpful: true } });
  } else {
    await db
      .delete(knowledgeVotes)
      .where(and(eq(knowledgeVotes.articleId, articleId), eq(knowledgeVotes.userId, ctx.user.id)));
  }
  const [cnt] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(knowledgeVotes)
    .where(and(eq(knowledgeVotes.articleId, articleId), eq(knowledgeVotes.helpful, true)));
  const [mine] = await db
    .select({ helpful: knowledgeVotes.helpful })
    .from(knowledgeVotes)
    .where(and(eq(knowledgeVotes.articleId, articleId), eq(knowledgeVotes.userId, ctx.user.id)))
    .limit(1);
  return { helpfulCount: cnt?.count ?? 0, myVote: mine ? !!mine.helpful : null };
}

export async function remove(ctx: AuthContext, id: string) {
  if (!can(ctx.access, "knowledge.manage")) {
    throw ApiError.forbidden("Missing permission: knowledge.manage");
  }
  const deleted = await db
    .delete(knowledgeArticles)
    .where(
      and(
        eq(knowledgeArticles.id, id),
        eq(knowledgeArticles.organizationId, ctx.user.organizationId),
      ),
    )
    .returning({ id: knowledgeArticles.id });
  if (!deleted[0]) throw ApiError.notFound();

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "ARTICLE_DELETED",
    entityType: "knowledge_article",
    entityId: id,
  });
}

/** Full-text-ish + semantic (pgvector) match for global search. Org-scoped. */
export async function searchArticles(
  orgId: string,
  like: string,
  rawQuery: string,
  limit = 5,
): Promise<{ id: string; title: string; subtitle: string }[]> {
  const keywordLike = `%${like}%`;
  const queryVector = await embedText(rawQuery);

  if (!queryVector) {
    // keyword fallback when embeddings aren't configured
    const rows = await db
      .select({
        id: knowledgeArticles.id,
        title: knowledgeArticles.title,
        snippet: sql<string>`left(regexp_replace(${knowledgeArticles.body}, E'[\\n\\r]+', ' ', 'g'), 90)`,
      })
      .from(knowledgeArticles)
      .where(
        and(
          eq(knowledgeArticles.organizationId, orgId),
          sql`(${knowledgeArticles.title} ILIKE ${keywordLike}
               OR ${knowledgeArticles.body} ILIKE ${keywordLike}
               OR EXISTS (SELECT 1 FROM unnest(${knowledgeArticles.tags}) t WHERE t ILIKE ${keywordLike}))`,
        ),
      )
      .orderBy(desc(knowledgeArticles.updatedAt))
      .limit(limit);
    return rows.map((r) => ({ id: r.id, title: r.title, subtitle: r.snippet }));
  }

  const vectorLiteral = `[${queryVector.join(",")}]`;
  const rows = await db.execute(sql`
    SELECT id, title,
           left(regexp_replace(body, E'[\\n\\r]+', ' ', 'g'), 90) AS snippet
    FROM knowledge_articles
    WHERE organization_id = ${orgId}
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `);
  return (
    rows.rows as unknown as { id: string; title: string; snippet: string }[]
  ).map((r) => ({ id: r.id, title: r.title, subtitle: r.snippet }));
}
