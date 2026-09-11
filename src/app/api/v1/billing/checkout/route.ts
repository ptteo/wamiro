import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { startCheckout } from "@/modules/billing/service";

const bodySchema = z.object({
  plan: z.enum(["growth", "scale"]),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Choose Growth or Scale");
    return NextResponse.json(await startCheckout(auth, parsed.data.plan));
  },
  { permission: "settings.manage" },
);
