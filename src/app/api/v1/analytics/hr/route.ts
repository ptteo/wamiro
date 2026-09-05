import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { hrAnalytics } from "@/modules/analytics/reports";

export const GET = route(async (_req, { auth }) => {
  const data = await hrAnalytics(auth);
  if (!data) {
    return NextResponse.json(
      { error: { code: "forbidden", message: "Missing permission: analytics.view_company", request_id: "n/a" } },
      { status: 403 },
    );
  }
  return NextResponse.json(data);
}, { permission: "analytics.view_company" });