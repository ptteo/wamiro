import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { decodeAuditCursor, encodeAuditCursor, listAuditLogs } from "@/modules/admin/service";

export const GET = route(
  async (req: NextRequest, { auth }) => {
    const sp = req.nextUrl.searchParams;
    const entries = await listAuditLogs(auth, {
      q: sp.get("q") ?? undefined,
      action: sp.get("action") ?? undefined,
      actorId: sp.get("actorId") ?? undefined,
      // G-03: keyset cursor wins over offset when both are present.
      before: decodeAuditCursor(sp.get("before")),
      offset: sp.get("page") ? (Math.max(1, Number(sp.get("page")) || 1) - 1) * 50 : undefined,
    });
    const nextBefore =
      entries.length > 0 ? encodeAuditCursor(entries[entries.length - 1]!) : null;
    return NextResponse.json({
      entries,
      // Pass `nextBefore` as the `before` query param to fetch the next page
      // (keyset, O(log n) seeks); `page`-style offset still works for shallow
      // integrations.
      nextBefore,
    });
  },
  { permission: "audit.view" },
);
