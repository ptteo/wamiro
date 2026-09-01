import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { listBudgets, upsertBudget } from "@/modules/finance/service";

export const GET = route(
  async (_req: NextRequest, { auth }) => {
    return NextResponse.json({ budgets: await listBudgets(auth) });
  },
  { permission: "finance.view_self" },
);

const schema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(200),
  periodLabel: z.string().min(2).max(20),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().length(3).optional(),
  departmentId: z.string().uuid().optional(),
  status: z.string().max(20).optional(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Check the form", parsed.error.flatten());
    const id = await upsertBudget(auth, parsed.data);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  },
  { permission: "finance.view_self" },
);
