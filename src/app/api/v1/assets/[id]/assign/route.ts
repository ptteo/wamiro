import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { assignAsset } from "@/modules/assets/service";

const bodySchema = z.object({
  /** null/empty returns the asset to stock */
  email: z.string().email().max(200).nullish(),
});

export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Asset id required");
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Valid email (or empty to unassign) required");
    await assignAsset(auth, id, parsed.data.email ?? null);
    return NextResponse.json({ ok: true });
  },
  { permission: "assets.manage" },
);
