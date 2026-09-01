import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { logTime } from "@/modules/work/service";

const bodySchema = z.object({
  minutes: z.number().int().min(1).max(1440),
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(300).optional(),
});

export const POST = route(async (req: NextRequest, { auth, params }) => {
  const id = params["id"];
  if (!id) throw ApiError.badRequest("Task id required");
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("minutes (1-1440) required", parsed.error.flatten());
  await logTime(auth, id, parsed.data);
  return NextResponse.json({ ok: true }, { status: 201 });
});
