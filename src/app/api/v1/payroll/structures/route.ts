import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createStructure, listStructures } from "@/modules/payroll/service";

const lineSchema = z.object({
  componentId: z.string().uuid(),
  amount: z.number().min(0).nullable().optional(),
  percentOfBasic: z.number().min(0).max(100).nullable().optional(),
});

const createSchema = z.object({
  employeeUserId: z.string().uuid(),
  name: z.string().max(120).optional(),
  base: z.number().positive(),
  currency: z.string().max(10).optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lines: z.array(lineSchema).min(1).max(40),
});

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ structures: await listStructures(auth) });
});

export const POST = route(async (req: NextRequest, { auth }) => {
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("Invalid structure", parsed.error.flatten());
  const row = await createStructure(auth, parsed.data);
  return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
});
