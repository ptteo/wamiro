import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { review } from "@/modules/requests/service";

const bodySchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().max(500).optional(),
});

export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("decision must be approved|rejected");
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Request id required");
    await review(auth, id, parsed.data.decision, parsed.data.note);
    return NextResponse.json({ ok: true });
  },
  { permission: "requests.approve" },
);
