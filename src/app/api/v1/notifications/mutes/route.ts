import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { getMutedTypes, setMutedTypes } from "@/modules/notifications/service";

/** Phase 8 — per-type notification mutes (in-app). */
export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ muted: await getMutedTypes(auth) });
});

const putSchema = z.object({ muted: z.array(z.string().max(40)).max(30) });

export const PUT = route(async (req: NextRequest, { auth }) => {
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("Invalid mutes", parsed.error.flatten());
  const muted = await setMutedTypes(auth, parsed.data.muted);
  return NextResponse.json({ muted });
});
