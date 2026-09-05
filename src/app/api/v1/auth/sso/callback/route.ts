import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { SESSION_COOKIE, cookieOptions } from "@/lib/session";
import { completeLogin } from "@/modules/sso/service";

/**
 * GET /api/v1/auth/sso/callback?code=…&state=…
 * The identity provider redirects here after consent. We exchange the code,
 * verify the ID token, resolve/provision the user, and hand out a normal
 * Wamiro session cookie. Public (auth: false) — the state value is the CSRF
 * protection on this leg.
 */
export const GET = route(
  async (req, { meta }) => {
    const result = await completeLogin(
      {
        code: req.nextUrl.searchParams.get("code") ?? undefined,
        state: req.nextUrl.searchParams.get("state") ?? undefined,
        error: req.nextUrl.searchParams.get("error") ?? undefined,
      },
      { ip: meta.ip, userAgent: meta.userAgent },
    );

    const res = NextResponse.redirect(new URL(result.redirectTo, req.nextUrl.origin));
    res.cookies.set(SESSION_COOKIE, result.sessionToken, cookieOptions(result.sessionExpiresAt));
    return res;
  },
  { auth: false },
);