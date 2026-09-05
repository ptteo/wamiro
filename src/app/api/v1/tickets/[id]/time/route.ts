import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { addTimeEntry, timeForTicket } from "@/modules/tickets/toolkit";

export const GET = route(async (_req: NextRequest, { auth, params }) => {
  const id = params["id"] ?? "";
  return NextResponse.json(await timeForTicket(auth, id));
});

const addSchema = z.object({
  minutes: z.number().int().min(1).max(1440),
  note: z.string().max(2000).optional().nullable(),
});

export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Ticket id required");
    const parsed = addSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid time entry", parsed.error.flatten());
    return NextResponse.json(await addTimeEntry(auth, id, parsed.data));
  },
  { permission: "tickets.manage" },
);