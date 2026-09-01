import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { getUserDetail, setUserStatus } from "@/modules/admin/service";

export const GET = route(
  async (_req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("id required");
    return NextResponse.json({ user: await getUserDetail(auth, id) });
  },
  { permission: "users.manage" },
);

const patchSchema = z.object({
  status: z.enum(["active", "suspended"]),
});

export const PATCH = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("id required");
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid status", parsed.error.flatten());
    await setUserStatus(auth, id, parsed.data.status);
    return NextResponse.json({ ok: true });
  },
  { permission: "users.manage" },
);
