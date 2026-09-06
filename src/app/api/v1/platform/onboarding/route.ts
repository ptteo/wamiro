import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { forceCompleteOnboarding } from "@/modules/org/policies";

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = z.object({ organizationId: z.string().uuid() }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("organizationId required");
    await forceCompleteOnboarding(auth, parsed.data.organizationId);
    return NextResponse.json({ ok: true });
  },
  { permission: "platform.admin" },
);
