import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { invoiceAging, mrrWaterfall, renewalForecast, revenueKpis } from "@/modules/platform/revenue";

/** Phase E — revenue analytics (§4.2). */
export const GET = route(
  async (req: NextRequest, { auth }) => {
    const months = Math.min(24, Math.max(3, Number(req.nextUrl.searchParams.get("months") ?? 6)));
    const [kpis, waterfall, aging, renewals] = await Promise.all([
      revenueKpis(auth),
      mrrWaterfall(months),
      invoiceAging(auth),
      renewalForecast(auth),
    ]);
    return NextResponse.json({ kpis, waterfall, aging, renewals });
  },
  { permission: "platform.admin" },
);
