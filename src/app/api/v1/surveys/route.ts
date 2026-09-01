import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createSurvey, listActive } from "@/modules/surveys/service";

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ surveys: await listActive(auth) });
});

const createSchema = z.object({
  question: z.string().min(3).max(300),
  options: z.array(z.string().min(1).max(80)).min(2).max(8),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Question + 2-8 options required", parsed.error.flatten());
    const id = await createSurvey(auth, parsed.data);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  },
  // authoring reuses the announcements gate (HR/Admin)
);
