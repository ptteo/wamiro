import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { moduleHeatmap, usageSummary } from "@/modules/platform/usage";

/** Phase A — fleet usage metering (platform.tenant_usage_daily reads). */
export const GET = route(
  async (_req: NextRequest, { auth }) => {
    const [rows, heatmap] = await Promise.all([usageSummary(auth), moduleHeatmap(auth, 30)]);
    return NextResponse.json({ rows, heatmap });
  },
  { permission: "platform.admin" },
);
