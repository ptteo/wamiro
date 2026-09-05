import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { decidePasswordChange, listPasswordChangeRequests } from "@/modules/auth/passwords";

export const GET = route(
  async (_req, { auth }) => {
    return NextResponse.json({ requests: await listPasswordChangeRequests(auth) });
  },
  { permission: "users.manage" },
);

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = z
      .object({ id: z.string().uuid(), approve: z.boolean() })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("id and approve required");
    await decidePasswordChange(auth, parsed.data.id, parsed.data.approve);
    return NextResponse.json({ ok: true });
  },
  { permission: "users.manage" },
);
