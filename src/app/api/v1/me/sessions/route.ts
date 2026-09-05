import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { tokenFromRequest } from "@/lib/session";
import { listOwnSessions, revokeOtherSessions, revokeOwnSession } from "@/modules/auth/passwords";

export const GET = route(async (req: NextRequest, { auth }) => {
  return NextResponse.json({ sessions: await listOwnSessions(auth, tokenFromRequest(req)) });
});

export const DELETE = route(async (req: NextRequest, { auth }) => {
  const id = req.nextUrl.searchParams.get("id");
  const token = tokenFromRequest(req);
  if (id) await revokeOwnSession(auth, id, token);
  else if (token) await revokeOtherSessions(auth, token);
  return NextResponse.json({ ok: true });
});
