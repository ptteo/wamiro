import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import { embedText } from "@/lib/embeddings";
import type { AuthContext } from "@/lib/session";
import { knowledgeArticles, users } from "@/db/schema";
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
  return db
    .select({
      id: knowledgeArticles.id,
      title: knowledgeArticles.title,
      body: knowledgeArticles.body,
      tags: knowledgeArticles.tags,
      authorName: users.name,
      updatedAt: knowledgeArticles.updatedAt,
    })
    .from(knowledgeArticles)
    .leftJoin(users, eq(users.id, knowledgeArticles.authorUserId))
    .where(eq(knowledgeArticles.organizationId, ctx.user.organizationId))
    .orderBy(desc(knowledgeArticles.updatedAt))
    .limit(limit);
}

export async function get(ctx: AuthContext, id: string): Promise<ArticleRow | null> {
  const [row] = await db
    .select({
      id: knowledgeArticles.id,
      title: knowledgeArticles.title,
      body: knowledgeArticles.body,
      tags: knowledgeArticles.tags,
      authorName: users.name,
      updatedAt: knowledgeArticles.updatedAt,
    })
    .from(knowledgeArticles)
    .leftJoin(users, eq(users.id, knowledgeArticles.authorUserId))
    .where(
      and(
        eq(knowledgeArticles.id, id),
        eq(knowledgeArticles.organizationId, ctx.user.organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function create(
  ctx: AuthContext,
  input: { title: string; body: string; tags?: string[] },
) {
  if (!can(ctx.access, "knowledge.manage")) {
    throw ApiError.forbidden("Missing permission: knowledge.manage");
  }
  const inserted = await db
    .insert(knowledgeArticles)
    .values({
      organizationId: ctx.user.organizationId,
      authorUserId: ctx.user.id,
      title: input.title.trim().slice(0, 200),
      body: input.body.trim().slice(0, 50_000),
      tags: (input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8),
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
    newValue: { title: input.title },
  });
  // fire-and-forget semantic index
  void storeEmbedding(row.id, `${input.title}\n${input.body}`);
  return row;
}

export async function update(
  ctx: AuthContext,
  id: string,
  input: { title: string; body: string; tags?: string[] },
) {
  if (!can(ctx.access, "knowledge.manage")) {
    throw ApiError.forbidden("Missing permission: knowledge.manage");
  }
  const updated = await db
    .update(knowledgeArticles)
    .set({
      title: input.title.trim().slice(0, 200),
      body: input.body.trim().slice(0, 50_000),
      tags: (input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8),
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
