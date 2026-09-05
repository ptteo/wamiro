import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createRun, listRuns } from "@/modules/payroll/service";

const createSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodLabel: z.string().max(80).optional(),
  currency: z.string().max(10).optional(),
});

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ runs: await listRuns(auth) });
});

export const POST = route(async (req: NextRequest, { auth }) => {
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("Invalid payroll run", parsed.error.flatten());
  const row = await createRun(auth, parsed.data);
  return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
});
