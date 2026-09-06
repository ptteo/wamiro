import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { resetPassword } from "@/modules/auth/passwords";

export const POST = route(
  async (req: NextRequest) => {
    const parsed = z
      .object({ token: z.string().min(8), password: z.string().min(10).max(200) })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Token and password required");
    await resetPassword(parsed.data.token, parsed.data.password);
    return NextResponse.json({ ok: true });
  },
  { auth: false },
);
