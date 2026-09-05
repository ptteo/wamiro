import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { listImpersonationTargets, startImpersonation } from "@/modules/platform/console";
import { SESSION_COOKIE, tokenFromRequest } from "@/lib/session";
import { OPERATOR_RETURN_COOKIE } from "@/lib/impersonation";

/** Active targets (tenant admins) under a live grant. */
export const GET = route(
  async (req, { auth }) => {
    const grantId = req.nextUrl.searchParams.get("grantId") ?? "";
    if (!grantId) throw ApiError.badRequest("grantId required");
    return NextResponse.json({ targets: await listImpersonationTargets(auth, grantId) });
  },
  { permission: "platform.admin" },
);

const startSchema = z.object({
  grantId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

/**
 * Open an impersonation window. The response swaps the browser onto the
 * impersonated session and parks the operator's fresh return session in a
 * second httpOnly cookie (never exposed to JS).
 */
export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = startSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid impersonation request", parsed.error.flatten());
    const operatorToken = tokenFromRequest(req);
    if (!operatorToken) throw ApiError.unauthorized();

    const win = await startImpersonation(auth, { ...parsed.data, operatorToken });

    const res = NextResponse.json({ ok: true, orgName: win.orgName, targetName: win.targetName });
    res.cookies.set(SESSION_COOKIE, win.impersonationToken, win.impersonationCookie);
    res.cookies.set(OPERATOR_RETURN_COOKIE, win.returnToken, win.returnCookie);
    return res;
  },
  { permission: "platform.admin" },
);
