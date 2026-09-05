import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { deleteGroup, updateGroup } from "@/modules/ticket-groups/service";

const patchSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(300).nullable().optional(),
});

export const PATCH = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Group id required");
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid group", parsed.error.flatten());
    await updateGroup(auth, id, parsed.data);
    return NextResponse.json({ ok: true });
  },
);

export const DELETE = route(
  async (_req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Group id required");
    await deleteGroup(auth, id);
    return NextResponse.json({ ok: true });
  },
);