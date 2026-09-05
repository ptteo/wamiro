import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { addTag, removeTag, tagsForTicket } from "@/modules/tickets/toolkit";

export const GET = route(async (_req: NextRequest, { auth, params }) => {
  const id = params["id"] ?? "";
  return NextResponse.json(await tagsForTicket(auth, id));
});

const addSchema = z.object({ name: z.string().min(1).max(40) });

export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Ticket id required");
    const parsed = addSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid tag", parsed.error.flatten());
    return NextResponse.json(await addTag(auth, id, parsed.data.name));
  },
  { permission: "tickets.manage" },
);

export const DELETE = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    const name = new URL(req.url).searchParams.get("name") ?? "";
    if (!id || !name) throw ApiError.badRequest("Ticket id and tag name required");
    return NextResponse.json(await removeTag(auth, id, name));
  },
  { permission: "tickets.manage" },
);