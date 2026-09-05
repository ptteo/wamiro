import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { deleteMacro, updateMacro } from "@/modules/tickets/toolkit";

const macroAction = z.object({
  op: z.enum(["set_status", "set_priority", "assign", "add_tag", "add_reply", "add_note"]),
  value: z.string().min(1).max(10_000),
});
const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  actions: z.array(macroAction).min(1).max(20).optional(),
});

export const PATCH = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Macro id required");
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid macro", parsed.error.flatten());
    return NextResponse.json(await updateMacro(auth, id, parsed.data));
  },
  { permission: "tickets.manage" },
);

export const DELETE = route(
  async (_req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Macro id required");
    await deleteMacro(auth, id);
    return NextResponse.json({ ok: true });
  },
  { permission: "tickets.manage" },
);