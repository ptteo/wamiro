import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { assignShifts } from "@/modules/shifts/service";

const assignSchema = z.object({
  employeeUserId: z.string().uuid(),
  shiftTypeId: z.string().uuid(),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(366),
});

export const POST = route(async (req: NextRequest, { auth }) => {
  const parsed = assignSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("Invalid assignment", parsed.error.flatten());
  const result = await assignShifts(auth, parsed.data);
  return NextResponse.json(result, { status: 201 });
});
