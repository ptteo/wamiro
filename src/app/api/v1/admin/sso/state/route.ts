import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { setEnabled } from "@/modules/sso/service";

const bodySchema = { enabled: (v: unknown) => typeof v === "boolean" };

/** Enable or disable the org's SSO. */
export const POST = route(
  async (req, { auth }) => {
    const body = (await req.json().catch(() => null)) as { enabled?: boolean } | null;
    if (!body || !bodySchema.enabled(body.enabled)) throw ApiError.badRequest("enabled (boolean) is required");
    return NextResponse.json(await setEnabled(auth.user.organizationId, auth.user.id, body.enabled));
  },
  { permission: "settings.manage" },
);