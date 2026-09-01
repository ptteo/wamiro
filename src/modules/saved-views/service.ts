/**
 * Saved views (D2 §14 / D3 §56): named filter sets per workspace.
 * Each user owns their views; they are permission-aware at query time.
 */
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { savedViews } from "@/db/schema";
import type { AuthContext } from "@/lib/session";

export interface SavedViewRow {
  id: string;
  workspace: string;
  name: string;
  filters: Record<string, string>;
}

export async function listForWorkspace(
  ctx: AuthContext,
  workspace: string,
): Promise<SavedViewRow[]> {
  return db
    .select({
      id: savedViews.id,
      workspace: savedViews.workspace,
      name: savedViews.name,
      filters: savedViews.filters,
    })
    .from(savedViews)
    .where(
      and(eq(savedViews.userId, ctx.user.id), eq(savedViews.workspace, workspace)),
    )
    .orderBy(asc(savedViews.name));
}

export async function createView(
  ctx: AuthContext,
  workspace: string,
  name: string,
  filters: Record<string, string>,
): Promise<void> {
  await db.insert(savedViews).values({
    organizationId: ctx.user.organizationId,
    userId: ctx.user.id,
    workspace,
    name: name.trim().slice(0, 80),
    filters,
  });
}

export async function deleteView(ctx: AuthContext, id: string): Promise<void> {
  await db.delete(savedViews).where(and(eq(savedViews.id, id), eq(savedViews.userId, ctx.user.id)));
}


