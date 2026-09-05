import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { reviewCorrection } from "@/modules/attendance/corrections";

const reviewSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().max(1000).optional(),
});

export const POST = route(async (req: NextRequest, { auth, params }) => {
  const parsed = reviewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("Invalid decision", parsed.error.flatten());
  await reviewCorrection(auth, params["id"] ?? "", parsed.data.decision, parsed.data.note);
  return NextResponse.json({ ok: true });
});
