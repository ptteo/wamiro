import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { updateProgress } from "@/modules/goals/service";

const bodySchema = z.object({ progress: z.number().int().min(0).max(100) });

export const PATCH = route(async (req: NextRequest, { auth, params }) => {
  const id = params["id"];
  if (!id) throw ApiError.badRequest("Goal id required");
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("progress must be 0–100");
  await updateProgress(auth, id, parsed.data.progress);
  return NextResponse.json({ ok: true });
});
