import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { getTicket, zammadConfig } from "@/modules/integrations/zammad";

function requireZammad() {
  if (!zammadConfig()) {
    throw ApiError.badRequest(
      "Helpdesk is not connected yet. An administrator must set ZAMMAD_BASE_URL and ZAMMAD_TOKEN.",
    );
  }
}

/**
 * Single ticket view: customer-scoped (the authenticated user must be the
 * customer on the Zammad side, otherwise we return 404 to avoid revealing
 * ticket existence). Mirrors the list endpoint's authz.
 */
export const GET = route(async (_req: NextRequest, { auth, params }) => {
  requireZammad();
  const raw = params["id"];
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest("Ticket id must be a positive integer");
  }
  try {
    const detail = await getTicket(auth.user.email, id);
    return NextResponse.json({ ticket: detail });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("zammad 403")) {
      throw ApiError.notFound();
    }
    if (e instanceof Error && e.message.startsWith("zammad ")) {
      throw ApiError.badRequest("Helpdesk unreachable — please try again later");
    }
    throw e;
  }
});
