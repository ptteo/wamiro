import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { review } from "@/modules/leave/service";

const bodySchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().max(500).optional(),
});

export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Missing request id");
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("decision must be approved|rejected");
    await review(auth, id, parsed.data.decision, parsed.data.note);
    return NextResponse.json({ ok: true });
  },
);
