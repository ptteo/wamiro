import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { stopImpersonation } from "@/modules/platform/console";
import { tokenFromRequest, SESSION_COOKIE, cookieOptions, loadAuthContext, type AuthContext } from "@/lib/session";
import { OPERATOR_RETURN_COOKIE } from "@/lib/impersonation";
import { can } from "@/modules/iam/engine";

/**
 * End the impersonation window. Runs under the IMPERSONATED session (the
 * platform.admin gate can't apply — the operator is currently wearing the
 * tenant identity). The parked operator return session (httpOnly cookie from
 * the start call) is verified server-side, the impersonated session + ledger
 * row are closed, and the browser is set back onto the operator's session.
 */
export const POST = route(
  async (req: NextRequest) => {
    const impersonationToken = tokenFromRequest(req);
    const returnToken = req.cookies.get(OPERATOR_RETURN_COOKIE)?.value ?? null;
    if (!impersonationToken || !returnToken) {
      throw ApiError.badRequest("No impersonation window to stop");
    }

    // the return session must still be a live platform-operator session
    const operatorCtx: AuthContext = await loadAuthContext(returnToken);
    if (!can(operatorCtx.access, "platform.admin")) {
      throw ApiError.forbidden("Return session is not a platform operator");
    }

    await stopImpersonation(operatorCtx, impersonationToken);

    const res = NextResponse.json({ ok: true });
    const expires = new Date(Date.now() + 14 * 86_400_000);
    res.cookies.set(SESSION_COOKIE, returnToken, cookieOptions(expires));
    res.cookies.set(OPERATOR_RETURN_COOKIE, "", { ...cookieOptions(expires), expires: new Date(0) });
    return res;
  },
  { auth: true },
);
