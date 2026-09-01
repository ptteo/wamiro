import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { addReply } from "@/modules/tickets/service";

const bodySchema = z.object({
  body: z.string().min(1).max(10_000),
  isInternal: z.boolean().optional(),
});

export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Ticket id required");
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Reply body required");
    await addReply(auth, id, parsed.data.body, parsed.data.isInternal ?? false);
    return NextResponse.json({ ok: true }, { status: 201 });
  },
);
