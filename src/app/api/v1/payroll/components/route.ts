import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createComponent, listComponents } from "@/modules/payroll/service";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(["earning", "deduction"]),
  amountType: z.enum(["fixed", "percent_of_basic"]),
  defaultAmount: z.number().min(0).optional(),
  isTaxable: z.boolean().optional(),
});

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ components: await listComponents(auth) });
});

export const POST = route(async (req: NextRequest, { auth }) => {
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("Invalid component", parsed.error.flatten());
  const row = await createComponent(auth, parsed.data);
  return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
});
