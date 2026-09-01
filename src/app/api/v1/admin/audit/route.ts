import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { listAuditLogs } from "@/modules/admin/service";

export const GET = route(
  async (req: NextRequest, { auth }) => {
    const sp = req.nextUrl.searchParams;
    const entries = await listAuditLogs(auth, {
      q: sp.get("q") ?? undefined,
      action: sp.get("action") ?? undefined,
      actorId: sp.get("actorId") ?? undefined,
    });
    return NextResponse.json({ entries });
  },
  { permission: "audit.view" },
);
