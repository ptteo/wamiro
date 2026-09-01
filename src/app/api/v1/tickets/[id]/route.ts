import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { getTicket, updateStatus } from "@/modules/tickets/service";

export const GET = route(async (_req: NextRequest, { auth, params }) => {
  const id = params["id"] ?? "";
  return NextResponse.json(await getTicket(auth, id));
});

const patchSchema = z.object({
  status: z.enum(["new", "open", "waiting", "resolved", "closed"]),
});

export const PATCH = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Ticket id required");
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid status");
    await updateStatus(auth, id, parsed.data.status);
    return NextResponse.json({ ok: true });
  },
);
