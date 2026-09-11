import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { snapshotHealth } from "@/lib/health";

/** Readiness: same component gates as GET /api/v1/health. */
export const GET = route(
  async () => {
    const body = await snapshotHealth();
    return NextResponse.json(
      { ok: body.ok, db: body.components.database === "healthy", components: body.components },
      { status: body.ok ? 200 : 503 },
    );
  },
  { auth: false },
);
