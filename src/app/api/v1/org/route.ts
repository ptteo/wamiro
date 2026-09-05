import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { deleteOrganization } from "@/modules/org/service";

/**
 * Permanently delete this company's tenant and all of its data.
 * Requires `{ confirm: "<exact org name>" }` — the typed-confirmation guard.
 * The caller's session is destroyed by the users cascade.
 */
export const DELETE = route(
  async (req: NextRequest, { auth }) => {
    const body = (await req.json().catch(() => null)) as { confirm?: string } | null;
    if (!body || typeof body.confirm !== "string" || body.confirm.trim().length === 0) {
      throw ApiError.badRequest("confirm field (exact company name) is required");
    }
    const result = await deleteOrganization(auth, body.confirm);
    return NextResponse.json(result);
  },
  { permission: "settings.manage" },
);