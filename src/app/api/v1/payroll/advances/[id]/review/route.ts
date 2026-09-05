import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { reviewAdvance } from "@/modules/payroll/advances";

const reviewSchema = z.object({
  approve: z.boolean(),
  note: z.string().max(500).optional().nullable(),
});

export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Advance id required");
    const parsed = reviewSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid review", parsed.error.flatten());
    return NextResponse.json(await reviewAdvance(auth, id, parsed.data));
  },
  { permission: "payroll.manage" },
);