import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createTravel, listTravel } from "@/modules/finance/service";

export const GET = route(
  async (req: NextRequest, { auth }) => {
    const sp = req.nextUrl.searchParams;
    return NextResponse.json({ travel: await listTravel(auth, { status: sp.get("status") ?? undefined }) });
  },
  { permission: "finance.view_self" },
);

const schema = z.object({
  destination: z.string().min(2).max(200),
  purpose: z.string().max(2000).optional(),
  departAt: z.string().max(10).optional(),
  returnAt: z.string().max(10).optional(),
  estimatedCents: z.number().int().nonnegative(),
  currency: z.string().length(3).optional(),
  projectId: z.string().uuid().optional(),
  submit: z.boolean().optional(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Check the form", parsed.error.flatten());
    const id = await createTravel(auth, parsed.data);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  },
  { permission: "finance.submit" },
);
