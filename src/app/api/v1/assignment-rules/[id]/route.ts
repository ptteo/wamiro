import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { deleteRule, updateRule } from "@/modules/ticket-groups/service";

const patchSchema = z.object({
  active: z.boolean().optional(),
  category: z.string().max(40).nullable().optional(),
  groupId: z.string().uuid().nullable().optional(),
});

export const PATCH = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Rule id required");
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid rule", parsed.error.flatten());
    await updateRule(auth, id, parsed.data);
    return NextResponse.json({ ok: true });
  },
);

export const DELETE = route(
  async (_req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Rule id required");
    await deleteRule(auth, id);
    return NextResponse.json({ ok: true });
  },
);