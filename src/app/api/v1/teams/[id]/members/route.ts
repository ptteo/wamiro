import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { addMember, removeMember } from "@/modules/teams/service";

const bodySchema = z.object({ email: z.string().email().max(200) });

export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Team id required");
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Valid email required");
    await addMember(auth, id, parsed.data.email);
    return NextResponse.json({ ok: true }, { status: 201 });
  },
  { permission: "teams.manage" },
);

export const DELETE = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Team id required");
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Valid email required");
    await removeMember(auth, id, parsed.data.email);
    return NextResponse.json({ ok: true });
  },
  { permission: "teams.manage" },
);
