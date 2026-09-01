import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { dashboardWidgets } from "@/db/schema";
import { overview } from "@/modules/analytics/service";

/** Current pinned metrics + their live values (scope-resolved). */
export const GET = route(async (_req, { auth }) => {
  const data = await overview(auth);
  if (!data) throw ApiError.forbidden("No analytics scope");
  return NextResponse.json({ widgets: data });
});

const toggleSchema = z.object({
  metricId: z.enum(["headcount", "on_leave_today", "pending_approvals", "approval_latency_hours"]),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = toggleSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Unknown metric");

    const existing = await db
      .select({ metricId: dashboardWidgets.metricId })
      .from(dashboardWidgets)
      .where(
        and(
          eq(dashboardWidgets.userId, auth.user.id),
          eq(dashboardWidgets.metricId, parsed.data.metricId),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await db
        .delete(dashboardWidgets)
        .where(
          and(
            eq(dashboardWidgets.userId, auth.user.id),
            eq(dashboardWidgets.metricId, parsed.data.metricId),
          ),
        );
      return NextResponse.json({ pinned: false });
    }
    await db
      .insert(dashboardWidgets)
      .values({ userId: auth.user.id, metricId: parsed.data.metricId })
      .onConflictDoNothing();
    return NextResponse.json({ pinned: true });
  },
);
