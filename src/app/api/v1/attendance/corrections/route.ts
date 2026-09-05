import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import {
  listCorrections,
  pendingCorrections,
  requestCorrection,
} from "@/modules/attendance/corrections";
import { widestScope } from "@/modules/iam/engine";

const requestSchema = z.object({
  recordDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["clock_in", "clock_out", "missing"]),
  requestedInAt: z.string().datetime().nullable().optional(),
  requestedOutAt: z.string().datetime().nullable().optional(),
  reason: z.string().min(1).max(1000),
});

export const GET = route(async (req: NextRequest, { auth }) => {
  const pending = req.nextUrl.searchParams.get("pending") === "1";
  const scope = widestScope(auth.access, "attendance.correct");
  if (pending && scope) {
    return NextResponse.json({ corrections: await pendingCorrections(auth), mode: "pending" });
  }
  return NextResponse.json({ corrections: await listCorrections(auth), mode: "all" });
});

export const POST = route(async (req: NextRequest, { auth }) => {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("Invalid correction request", parsed.error.flatten());
  const row = await requestCorrection(auth, parsed.data);
  return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
});
