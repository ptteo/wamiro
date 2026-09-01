/**
 * Favorites (saved items): per-user stars on projects and knowledge articles.
 * Visibility is re-checked at read time — if the user loses access to the
 * underlying object it simply disappears from the list.
 */
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { favorites, knowledgeArticles, projects } from "@/db/schema";

export type FavKind = "project" | "article";

export async function isFavorite(
  userId: string,
  kind: FavKind,
  refId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ userId: favorites.userId })
    .from(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.kind, kind), eq(favorites.refId, refId)))
    .limit(1);
  return !!row;
}

export async function toggle(
  orgId: string,
  userId: string,
  kind: FavKind,
  refId: string,
): Promise<{ starred: boolean }> {
  const existing = await db
    .select({ userId: favorites.userId })
    .from(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.kind, kind), eq(favorites.refId, refId)))
    .limit(1);

  if (existing[0]) {
    await db
      .delete(favorites)
      .where(
        and(
          eq(favorites.userId, userId),
          eq(favorites.kind, kind),
          eq(favorites.refId, refId),
        ),
      );
    return { starred: false };
  }

  // only star items that exist inside the caller's organization
  if (kind === "project") {
    const [p] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, refId), eq(projects.organizationId, orgId)))
      .limit(1);
    if (!p) throw new Error("not_in_org");
  } else {
    const [a] = await db
      .select({ id: knowledgeArticles.id })
      .from(knowledgeArticles)
      .where(and(eq(knowledgeArticles.id, refId), eq(knowledgeArticles.organizationId, orgId)))
      .limit(1);
    if (!a) throw new Error("not_in_org");
  }

  await db.insert(favorites).values({ userId, kind, refId }).onConflictDoNothing();
  return { starred: true };
}

/** Resolve favorites into clickable links, dropping items that vanished. */
export async function listFavorites(
  orgId: string,
  userId: string,
): Promise<{ kind: string; refId: string; title: string; href: string }[]> {
  const rows = await db
    .select({ kind: favorites.kind, refId: favorites.refId })
    .from(favorites)
    .where(eq(favorites.userId, userId))
    .orderBy(sql`${favorites.createdAt} DESC`);

  const out: { kind: string; refId: string; title: string; href: string }[] = [];
  for (const r of rows) {
    if (r.kind === "project") {
      const [p] = await db
        .select({ name: projects.name })
        .from(projects)
        .where(and(eq(projects.id, r.refId), eq(projects.organizationId, orgId)))
        .limit(1);
      if (p) out.push({ kind: "project", refId: r.refId, title: p.name, href: `/projects/${r.refId}` });
    } else if (r.kind === "article") {
      const [a] = await db
        .select({ title: knowledgeArticles.title })
        .from(knowledgeArticles)
        .where(and(eq(knowledgeArticles.id, r.refId), eq(knowledgeArticles.organizationId, orgId)))
        .limit(1);
      if (a) out.push({ kind: "article", refId: r.refId, title: a.title, href: `/knowledge?id=${r.refId}` });
    }
  }
  return out;
}
