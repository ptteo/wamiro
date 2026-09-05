import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createShiftType, listShiftTypes } from "@/modules/shifts/service";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  startMinutes: z.number().int().min(0).max(1439),
  endMinutes: z.number().int().min(0).max(1439),
  graceMinutes: z.number().int().min(0).max(180).optional(),
  workingHours: z.number().min(0).max(24).optional(),
  color: z.string().max(30).nullable().optional(),
});

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ types: await listShiftTypes(auth) });
});

export const POST = route(async (req: NextRequest, { auth }) => {
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("Invalid shift type", parsed.error.flatten());
  const row = await createShiftType(auth, parsed.data);
  return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
});
