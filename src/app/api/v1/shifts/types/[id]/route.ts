import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { deleteShiftType, updateShiftType } from "@/modules/shifts/service";

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  startMinutes: z.number().int().min(0).max(1439).optional(),
  endMinutes: z.number().int().min(0).max(1439).optional(),
  graceMinutes: z.number().int().min(0).max(180).optional(),
  workingHours: z.number().min(0).max(24).optional(),
  color: z.string().max(30).nullable().optional(),
});

export const PATCH = route(async (req: NextRequest, { auth, params }) => {
  const id = params["id"] ?? "";
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("Invalid shift type", parsed.error.flatten());
  const row = await updateShiftType(auth, id, parsed.data);
  return NextResponse.json({ ok: true, id: row.id });
});

export const DELETE = route(async (_req, { auth, params }) => {
  await deleteShiftType(auth, params["id"] ?? "");
  return NextResponse.json({ ok: true });
});
