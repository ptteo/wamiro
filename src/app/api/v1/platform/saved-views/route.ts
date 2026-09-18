import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { db } from "@/lib/db";
import { platformPanelSavedViews } from "@/db/schema";
import { requirePlatformLevel } from "@/modules/platform/entitlements";

/**
 * Fold-in #9 — saved filter combos per operator, persisted SERVER-SIDE in
 * platform.panel_saved_views (the earlier localStorage version didn't
 * survive devices or operator turnover). Scoped to the signed-in operator;
 * views die with the user account (CASCADE).
 */

const createSchema = z.object({
  name: z.string().min(1).max(80),
  query: z.string().min(1).max(500),
});

export const GET = route(
  async (_req, { auth }) => {
    requirePlatformLevel(auth, "viewer");
    const rows = await db
      .select({ id: platformPanelSavedViews.id, name: platformPanelSavedViews.name, query: platformPanelSavedViews.query })
      .from(platformPanelSavedViews)
      .where(eq(platformPanelSavedViews.userId, auth.user.id))
      .orderBy(asc(platformPanelSavedViews.name))
      .limit(50);
    return NextResponse.json({ views: rows });
  },
  { permission: "platform.admin" },
);

export const POST = route(
  async (req: NextRequest, { auth }) => {
    requirePlatformLevel(auth, "viewer");
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid view", parsed.error.flatten());
    const [row] = await db
      .insert(platformPanelSavedViews)
      .values({ userId: auth.user.id, name: parsed.data.name.trim(), query: parsed.data.query.trim() })
      .onConflictDoUpdate({
        target: [platformPanelSavedViews.userId, platformPanelSavedViews.name],
        set: { query: parsed.data.query.trim() },
      })
      .returning({ id: platformPanelSavedViews.id });
    return NextResponse.json({ ok: true, id: row!.id }, { status: 201 });
  },
  { permission: "platform.admin" },
);

export const DELETE = route(
  async (req: NextRequest, { auth }) => {
    requirePlatformLevel(auth, "viewer");
    const id = req.nextUrl.searchParams.get("id") ?? "";
    if (!id) throw ApiError.badRequest("id required");
    await db
      .delete(platformPanelSavedViews)
      .where(and(eq(platformPanelSavedViews.id, id), eq(platformPanelSavedViews.userId, auth.user.id)));
    return NextResponse.json({ ok: true });
  },
  { permission: "platform.admin" },
);
