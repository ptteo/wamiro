import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { apply, mine, pendingForApprover } from "@/modules/leave/encashment";
import { can } from "@/modules/iam/engine";

const applySchema = z.object({
  leaveTypeId: z.string().uuid(),
  days: z.number().min(0.5).max(365),
  reason: z.string().max(1000).optional(),
});

export const GET = route(async (req: NextRequest, { auth }) => {
  const mineRows = await mine(auth);
  const canApprove = can(auth.access, "leave.approve");
  const pending = canApprove ? await pendingForApprover(auth) : [];
  return NextResponse.json({ mine: mineRows, pending, canApprove });
});

export const POST = route(async (req: NextRequest, { auth }) => {
  const parsed = applySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("Invalid encashment request", parsed.error.flatten());
  const row = await apply(auth, parsed.data);
  return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
});
