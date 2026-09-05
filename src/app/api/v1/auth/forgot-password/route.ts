import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { requestPasswordReset } from "@/modules/auth/passwords";

export const POST = route(
  async (req: NextRequest) => {
    const parsed = z.object({ email: z.string().email().max(200) }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Email required");
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    await requestPasswordReset(parsed.data.email, ip);
    return NextResponse.json({ ok: true });
  },
  { auth: false },
);
