import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { giveRecognition, recognitionFeed } from "@/modules/people-ops/service";

export const GET = route(
  async (_req: NextRequest, { auth }) => {
    return NextResponse.json({ recognitions: await recognitionFeed(auth) });
  },
  { permission: "learning.view" },
);

const schema = z.object({
  toUserId: z.string().uuid(),
  message: z.string().min(2).max(1000),
  badge: z.string().max(40).optional(),
  visibility: z.string().max(20).optional(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Check the form", parsed.error.flatten());
    await giveRecognition(auth, parsed.data);
    return NextResponse.json({ ok: true }, { status: 201 });
  },
  { permission: "recognition.give" },
);
