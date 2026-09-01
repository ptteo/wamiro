import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { deactivateRule } from "@/modules/automations/service";

export const DELETE = route(
  async (_req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Rule id required");
    await deactivateRule(auth, id);
    return NextResponse.json({ ok: true });
  },
  { permission: "automations.manage" },
);
