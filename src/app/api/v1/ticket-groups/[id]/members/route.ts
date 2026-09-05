import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { setMembers } from "@/modules/ticket-groups/service";

const bodySchema = z.object({ userIds: z.array(z.string().uuid()).max(200) });

export const PUT = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Group id required");
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("userIds required");
    await setMembers(auth, id, parsed.data.userIds);
    return NextResponse.json({ ok: true });
  },
);