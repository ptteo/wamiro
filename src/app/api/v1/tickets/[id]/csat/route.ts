import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { submitCsat } from "@/modules/tickets/service";

const csatSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Ticket id required");
    const parsed = csatSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid CSAT submission", parsed.error.flatten());
    await submitCsat(auth, id, parsed.data.score, parsed.data.comment);
    return NextResponse.json({ ok: true });
  },
);