import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { resendInvitation, revokeInvitation } from "@/modules/invitations/service";

export const POST = route(async (req: NextRequest, { auth, params }) => {
  const id = params["id"];
  const action = req.nextUrl.searchParams.get("action");
  if (action === "resend" && id) {
    return NextResponse.json({ ok: true, ...(await resendInvitation(auth, id)) });
  }
  return NextResponse.json({ ok: false }, { status: 400 });
});

export const DELETE = route(async (_req, { auth, params }) => {
  const id = params["id"];
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  await revokeInvitation(auth, id);
  return NextResponse.json({ ok: true });
});
