import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { commitImport, parseInviteCsv, previewImport } from "@/modules/invitations/service";

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const body = (await req.json().catch(() => null)) as { csv?: string; commit?: boolean } | null;
    if (!body?.csv || typeof body.csv !== "string") throw ApiError.badRequest("CSV required");
    const rows = parseInviteCsv(body.csv);
    if (rows.length === 0) throw ApiError.badRequest("No rows found");
    if (body.commit) {
      return NextResponse.json({ ok: true, ...(await commitImport(auth, rows)) });
    }
    return NextResponse.json({ ok: true, ...(await previewImport(auth, rows)) });
  },
  { permission: "users.manage" },
);
