import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createMacro, listMacros } from "@/modules/tickets/toolkit";

export const GET = route(
  async (_req: NextRequest, { auth }) => {
    return NextResponse.json(await listMacros(auth));
  },
  { permission: "tickets.manage" },
);

const macroAction = z.object({
  op: z.enum(["set_status", "set_priority", "assign", "add_tag", "add_reply", "add_note"]),
  value: z.string().min(1).max(10_000),
});
const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  actions: z.array(macroAction).min(1).max(20),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid macro", parsed.error.flatten());
    return NextResponse.json(await createMacro(auth, parsed.data), { status: 201 });
  },
  { permission: "tickets.manage" },
);