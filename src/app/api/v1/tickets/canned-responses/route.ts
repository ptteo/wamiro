import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createCannedResponse, listCannedResponses } from "@/modules/tickets/toolkit";

export const GET = route(
  async (_req: NextRequest, { auth }) => {
    return NextResponse.json(await listCannedResponses(auth));
  },
  { permission: "tickets.manage" },
);

const createSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.string().max(80).optional().nullable(),
  body: z.string().min(1).max(10_000),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid canned response", parsed.error.flatten());
    return NextResponse.json(await createCannedResponse(auth, parsed.data), { status: 201 });
  },
  { permission: "tickets.manage" },
);