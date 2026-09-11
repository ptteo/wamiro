import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createContract, listContracts, updateContract } from "@/modules/platform/contracts";

/** Fold-in #3 — contract registry (enterprise deals outside Paddle). */
export const GET = route(
  async (_req, { auth }) => {
    return NextResponse.json({ contracts: await listContracts(auth) });
  },
  { permission: "platform.admin" },
);

const createSchema = z.object({
  orgId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  annualValueCents: z.number().int().min(0),
  currency: z.string().length(3).optional(),
  poNumber: z.string().max(120).nullable().optional(),
  autoRenew: z.boolean().optional(),
  paymentMethod: z.enum(["card", "bank"]).optional(),
  notes: z.string().max(2000).optional(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid contract", parsed.error.flatten());
    const row = await createContract(auth, parsed.data);
    return NextResponse.json({ ok: true, contract: row }, { status: 201 });
  },
  { permission: "platform.admin" },
);

const patchSchema = z.object({
  id: z.string().uuid(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  annualValueCents: z.number().int().min(0).optional(),
  autoRenew: z.boolean().optional(),
  poNumber: z.string().max(120).nullable().optional(),
  notes: z.string().max(2000).optional(),
});

export const PATCH = route(
  async (req: NextRequest, { auth }) => {
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid contract patch", parsed.error.flatten());
    const { id, ...patch } = parsed.data;
    await updateContract(auth, id, patch);
    return NextResponse.json({ ok: true });
  },
  { permission: "platform.admin" },
);
