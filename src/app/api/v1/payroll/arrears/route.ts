import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createArrears, listArrears } from "@/modules/payroll/service";

/** Phase 8 — arrears ledger (payroll.manage): pending recovery + applied history. */
export const GET = route(
  async (req: NextRequest, { auth }) => {
    const status = req.nextUrl.searchParams.get("status") ?? undefined;
    const arrears = await listArrears(auth, { status: status ?? undefined });
    return NextResponse.json({ arrears });
  },
  { permission: "payroll.manage" },
);

const createSchema = z.object({
  employeeUserId: z.string().uuid(),
  amount: z.number().positive().max(100_000_000),
  reason: z.string().max(300).optional().nullable(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid arrears", parsed.error.flatten());
    const created = await createArrears(auth, { ...parsed.data, reason: parsed.data.reason ?? undefined });
    return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
  },
  { permission: "payroll.manage" },
);
