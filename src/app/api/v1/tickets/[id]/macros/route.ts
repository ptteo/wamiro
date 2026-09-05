import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { applyMacro } from "@/modules/tickets/toolkit";

const applySchema = z.object({ macroId: z.string().uuid() });

export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Ticket id required");
    const parsed = applySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid macro", parsed.error.flatten());
    const name = await applyMacro(auth, id, parsed.data.macroId);
    return NextResponse.json({ ok: true, name });
  },
  { permission: "tickets.manage" },
);