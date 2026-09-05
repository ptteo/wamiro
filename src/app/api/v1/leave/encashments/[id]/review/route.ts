import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { decide } from "@/modules/leave/encashment";

const reviewSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  rate: z.number().min(0).optional(),
  note: z.string().max(1000).optional(),
});

export const POST = route(async (req: NextRequest, { auth, params }) => {
  const parsed = reviewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("Invalid decision", parsed.error.flatten());
  await decide(auth, params["id"] ?? "", parsed.data.decision, {
    rate: parsed.data.rate,
    note: parsed.data.note,
  });
  return NextResponse.json({ ok: true });
});
