import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import {
  addTicketLink,
  linksForTicket,
  removeTicketLink,
} from "@/modules/tickets/toolkit";

export const GET = route(async (_req: NextRequest, { auth, params }) => {
  const id = params["id"] ?? "";
  return NextResponse.json(await linksForTicket(auth, id));
});

const addSchema = z.object({
  linkedTicketId: z.string().uuid(),
  relation: z.enum(["related", "blocks", "duplicates"]).optional(),
});

export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Ticket id required");
    const parsed = addSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid link", parsed.error.flatten());
    return NextResponse.json(await addTicketLink(auth, id, parsed.data));
  },
  { permission: "tickets.manage" },
);

export const DELETE = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    const linkedTicketId = new URL(req.url).searchParams.get("linked_ticket_id") ?? "";
    if (!id || !linkedTicketId) throw ApiError.badRequest("Ticket ids required");
    return NextResponse.json(await removeTicketLink(auth, id, linkedTicketId));
  },
  { permission: "tickets.manage" },
);