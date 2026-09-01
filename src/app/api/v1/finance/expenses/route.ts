import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createExpense, listExpenses } from "@/modules/finance/service";

export const GET = route(
  async (req: NextRequest, { auth }) => {
    const sp = req.nextUrl.searchParams;
    return NextResponse.json({
      expenses: await listExpenses(auth, { status: sp.get("status") ?? undefined, mine: sp.get("mine") === "1" }),
    });
  },
  { permission: "finance.view_self" },
);

const schema = z.object({
  title: z.string().min(2).max(300),
  category: z.string().max(50).optional(),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().length(3).optional(),
  incurredAt: z.string().min(8).max(10),
  projectId: z.string().uuid().optional(),
  costCenter: z.string().max(80).optional(),
  budgetId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
  submit: z.boolean().optional(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Check the form", parsed.error.flatten());
    const id = await createExpense(auth, parsed.data);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  },
  { permission: "finance.submit" },
);
