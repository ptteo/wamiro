import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { cancelSelfServe } from "@/modules/billing/service";

const bodySchema = z.object({
  confirm: z.literal(true),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Confirm cancellation to continue");
    return NextResponse.json(await cancelSelfServe(auth));
  },
  { permission: "settings.manage" },
);
