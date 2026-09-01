import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { revokeSession, revokeUserSessions } from "@/modules/admin/service";

const schema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ sessionId: z.string().uuid() }),
]);

export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("id required");
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("sessionId or all required");
    if ("all" in parsed.data && parsed.data.all) {
      const n = await revokeUserSessions(auth, id);
      return NextResponse.json({ ok: true, revoked: n });
    }
    if ("sessionId" in parsed.data) {
      await revokeSession(auth, parsed.data.sessionId);
      return NextResponse.json({ ok: true });
    }
    throw ApiError.badRequest("invalid payload");
  },
  { permission: "users.manage" },
);
