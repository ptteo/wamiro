import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { snapshotHealth } from "@/lib/health";

export const GET = route(
  async () => {
    const body = await snapshotHealth();
    return NextResponse.json(body, { status: body.ok ? 200 : 503 });
  },
  { auth: false },
);
