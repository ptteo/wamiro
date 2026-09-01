import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { apply } from "@/modules/leave/service";

const applySchema = z.object({
  leaveTypeId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(500).optional(),
});

export const POST = route(async (req: NextRequest, { auth }) => {
  const parsed = applySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("Invalid leave request", parsed.error.flatten());
  const created = await apply(auth, parsed.data);
  return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
});
