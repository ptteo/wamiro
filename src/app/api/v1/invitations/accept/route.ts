import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { SESSION_COOKIE, cookieOptions } from "@/lib/session";
import { acceptInvitation, peekInvitation } from "@/modules/invitations/service";

export const GET = route(
  async (req: NextRequest) => {
    const token = req.nextUrl.searchParams.get("token") ?? "";
    if (!token) throw ApiError.badRequest("Missing token");
    return NextResponse.json({ invite: await peekInvitation(token) });
  },
  { auth: false },
);

const bodySchema = z.object({
  token: z.string().min(8),
  password: z.string().min(10).max(200),
});

export const POST = route(
  async (req: NextRequest) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Password required");
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const result = await acceptInvitation(parsed.data.token, {
      password: parsed.data.password,
      ip,
      userAgent: req.headers.get("user-agent"),
    });
    const res = NextResponse.json({ ok: true, redirect: result.redirect });
    res.cookies.set(SESSION_COOKIE, result.token, cookieOptions(result.expiresAt));
    return res;
  },
  { auth: false },
);
