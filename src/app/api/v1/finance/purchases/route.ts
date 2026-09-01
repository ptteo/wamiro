import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createPurchase, listPurchases } from "@/modules/finance/service";

export const GET = route(
  async (req: NextRequest, { auth }) => {
    const sp = req.nextUrl.searchParams;
    return NextResponse.json({ purchases: await listPurchases(auth, { status: sp.get("status") ?? undefined }) });
  },
  { permission: "finance.view_self" },
);

const schema = z.object({
  title: z.string().min(2).max(300),
  justification: z.string().max(4000).optional(),
  estimatedCents: z.number().int().nonnegative(),
  currency: z.string().length(3).optional(),
  vendorId: z.string().uuid().optional(),
  budgetId: z.string().uuid().optional(),
  neededBy: z.string().max(10).optional(),
  submit: z.boolean().optional(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Check the form", parsed.error.flatten());
    const id = await createPurchase(auth, parsed.data);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  },
  { permission: "finance.submit" },
);
