import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { savedViews } from "@/db/schema";

export interface SavedView {
  id: string;
  workspace: string;
  name: string;
  filters: Record<string, string>;
}

export async function listSavedViews(
  ctx: AuthContext,
  workspace: string,
): Promise<SavedView[]> {
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

export async function createSavedView(
  ctx: AuthContext,
  input: { workspace: string; name: string; filters: Record<string, string> },
) {
  const inserted = await db
    .insert(savedViews)
    .values({
      organizationId: ctx.user.organizationId,
      userId: ctx.user.id,
      workspace: input.workspace,
      name: input.name.trim().slice(0, 80),
      filters: input.filters,
    })
    .onConflictDoNothing()
    .returning({ id: savedViews.id });
  if (!inserted[0]) throw ApiError.conflict("A view with this name already exists");
}

export async function deleteSavedView(ctx: AuthContext, id: string) {
  await db
    .delete(savedViews)
    .where(and(eq(savedViews.id, id), eq(savedViews.userId, ctx.user.id)));
}
