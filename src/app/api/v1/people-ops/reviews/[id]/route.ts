import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { finalizeReview, saveManagerReview, saveSelfReview } from "@/modules/people-ops/service";

const schema = z.union([
  z.object({
    action: z.literal("self"),
    achievements: z.string().min(1).max(5000),
    challenges: z.string().max(5000).optional(),
    goals: z.string().max(5000).optional(),
  }),
  z.object({
    action: z.literal("manager"),
    feedback: z.string().min(1).max(5000),
    rating: z.number().int().min(1).max(5).optional(),
    outcome: z.string().max(2000).optional(),
  }),
  z.object({ action: z.literal("finalize"), outcome: z.string().min(1).max(2000) }),
]);

export const PATCH = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("id required");
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid payload");
    if (parsed.data.action === "self") {
      await saveSelfReview(auth, id, parsed.data);
    } else if (parsed.data.action === "manager") {
      await saveManagerReview(auth, id, parsed.data);
    } else {
      await finalizeReview(auth, id, parsed.data.outcome);
    }
    return NextResponse.json({ ok: true });
  },
  { auth: true },
);
