import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { verifyExitClearance } from "@/modules/people-ops/service";

/** Phase 8 — verify exit clearance for an offboarding journey. */
export const POST = route(
  async (_req, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Journey id required");
    return NextResponse.json(await verifyExitClearance(auth, id));
  },
  { permission: "lifecycle.manage" },
);
