import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { overview } from "@/modules/analytics/service";

export const GET = route(async (_req, { auth }) => {
  const data = await overview(auth);
  if (!data) {
    return NextResponse.json(
      {
        error: {
          code: "forbidden",
          message: "No analytics scope",
          request_id: "n/a",
        },
      },
      { status: 403 },
    );
  }
  return NextResponse.json(data);
});
