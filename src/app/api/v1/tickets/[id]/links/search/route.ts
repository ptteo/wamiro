import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { linkableTickets } from "@/modules/tickets/toolkit";

export const GET = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    const q = new URL(req.url).searchParams.get("q") ?? "";
    return NextResponse.json(await linkableTickets(auth, id, q));
  },
  { permission: "tickets.manage" },
);