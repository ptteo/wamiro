import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { supportAnalytics } from "@/modules/analytics/reports";

export const GET = route(async (_req, { auth }) => {
  const data = await supportAnalytics(auth);
  if (!data) {
    return NextResponse.json(
      { error: { code: "forbidden", message: "Missing permission: tickets.sla_view", request_id: "n/a" } },
      { status: 403 },
    );
  }
  return NextResponse.json(data);
}, { permission: "tickets.sla_view" });