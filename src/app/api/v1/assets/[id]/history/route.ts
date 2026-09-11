import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { assetHistory } from "@/modules/assets/service";

/** Phase 8 — check-in/check-out history for one asset. */
export const GET = route(
  async (_req, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Asset id required");
    return NextResponse.json({ events: await assetHistory(auth, id) });
  },
  { permission: "assets.manage" },
);
