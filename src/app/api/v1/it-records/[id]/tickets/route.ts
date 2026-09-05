import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { linkTicket, unlinkTicket } from "@/modules/it-records/service";

const bodySchema = z.object({ ticketId: z.string().uuid() });

export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Record id required");
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("ticketId required");
    await linkTicket(auth, id, parsed.data.ticketId);
    return NextResponse.json({ ok: true });
  },
);

export const DELETE = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Record id required");
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("ticketId required");
    await unlinkTicket(auth, id, parsed.data.ticketId);
    return NextResponse.json({ ok: true });
  },
);