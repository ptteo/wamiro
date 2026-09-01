import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { SESSION_COOKIE, destroySession, tokenFromRequest } from "@/lib/session";

export const POST = route(async (req: NextRequest) => {
  const token = tokenFromRequest(req);
  if (token) await destroySession(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", expires: new Date(0) });
  return res;
});
