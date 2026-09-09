import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { voteHelpful } from "@/modules/knowledge/service";

const voteSchema = z.object({ helpful: z.boolean() });

/** Phase 8 — helpful vote on an article (self + colleagues). */
export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Article id required");
    const parsed = voteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("helpful boolean required", parsed.error.flatten());
    const result = await voteHelpful(auth, id, parsed.data.helpful);
    return NextResponse.json(result);
  },
  { permission: "knowledge.view" },
);
