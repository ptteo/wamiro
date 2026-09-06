import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { demoStatus, purgeDemo, seedDemo } from "@/modules/onboarding/demo";

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json(await demoStatus(auth));
});

const schema = z.object({ action: z.enum(["seed", "purge"]) });

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid payload", parsed.error.flatten());
    const result = parsed.data.action === "seed" ? await seedDemo(auth) : await purgeDemo(auth);
    return NextResponse.json({ ok: true, ...result });
  },
);
