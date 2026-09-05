import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { applyAdvance, listAdvances, myAdvances } from "@/modules/payroll/advances";
import { can } from "@/modules/iam/engine";

export const GET = route(
  async (_req: NextRequest, { auth }) => {
    // Managers see the whole queue; everyone else sees their own requests.
    const advances = can(auth.access, "payroll.manage")
      ? await listAdvances(auth)
      : await myAdvances(auth);
    return NextResponse.json({ advances });
  },
  { permission: "payroll.view_self" },
);

const applySchema = z.object({
  amount: z.number().positive().max(1_000_000),
  reason: z.string().max(500).optional().nullable(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = applySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid advance request", parsed.error.flatten());
    const created = await applyAdvance(auth, parsed.data);
    return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
  },
  { permission: "payroll.view_self" },
);