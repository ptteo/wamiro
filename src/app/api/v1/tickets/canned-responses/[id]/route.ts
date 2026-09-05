import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { deleteCannedResponse, updateCannedResponse } from "@/modules/tickets/toolkit";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  category: z.string().max(80).optional().nullable(),
  body: z.string().min(1).max(10_000).optional(),
});

export const PATCH = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Canned response id required");
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid canned response", parsed.error.flatten());
    return NextResponse.json(await updateCannedResponse(auth, id, parsed.data));
  },
  { permission: "tickets.manage" },
);

export const DELETE = route(
  async (_req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Canned response id required");
    await deleteCannedResponse(auth, id);
    return NextResponse.json({ ok: true });
  },
  { permission: "tickets.manage" },
);