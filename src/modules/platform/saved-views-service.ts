import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { platformPanelSavedViews } from "@/db/schema";
import { requirePlatformLevel } from "./entitlements";
import type { AuthContext } from "@/lib/session";

/**
 * Fold-in #9 — server-persisted saved views for the platform panel, backed by
 * platform.panel_saved_views. Unique per (operator, name); re-saving a name
 * upserts the filter expression. Scoped to the signed-in operator by
 * construction — every read/write filters on ctx.user.id.
 */

export interface PanelSavedView {
  id: string;
  name: string;
  query: string;
  createdAt: string;
}

export async function listViews(ctx: AuthContext): Promise<PanelSavedView[]> {
  requirePlatformLevel(ctx, "viewer");
  const rows = await db
    .select()
    .from(platformPanelSavedViews)
    .where(eq(platformPanelSavedViews.userId, ctx.user.id))
    .orderBy(asc(platformPanelSavedViews.name))
    .limit(50);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    query: r.query,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function saveView(ctx: AuthContext, name: string, query: string): Promise<string> {
  requirePlatformLevel(ctx, "viewer");
  const cleanName = String(name ?? "").trim();
  const cleanQuery = String(query ?? "").trim();
  if (cleanName.length < 1) throw ApiError.badRequest("View name is required");
  if (cleanQuery.length < 1) throw ApiError.badRequest("Filter expression is required");
  const [row] = await db
    .insert(platformPanelSavedViews)
    .values({ userId: ctx.user.id, name: cleanName.slice(0, 80), query: cleanQuery.slice(0, 500) })
    .onConflictDoUpdate({
      target: [platformPanelSavedViews.userId, platformPanelSavedViews.name],
      set: { query: cleanQuery.slice(0, 500) },
    })
    .returning({ id: platformPanelSavedViews.id });
  return row!.id;
}

export async function deleteView(ctx: AuthContext, id: string): Promise<void> {
  requirePlatformLevel(ctx, "viewer");
  await db
    .delete(platformPanelSavedViews)
    .where(and(eq(platformPanelSavedViews.id, id), eq(platformPanelSavedViews.userId, ctx.user.id)));
}
