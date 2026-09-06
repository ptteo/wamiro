import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { tokenFromRequest } from "@/lib/session";
import { changePassword } from "@/modules/auth/passwords";

export const POST = route(async (req: NextRequest, { auth }) => {
  const parsed = z
    .object({ current: z.string().min(1).max(200), next: z.string().min(10).max(200) })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("Current and new password required");
  const result = await changePassword(auth, {
    ...parsed.data,
    currentToken: tokenFromRequest(req),
  });
  return NextResponse.json({ ok: true, ...result });
});
