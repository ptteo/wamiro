import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import {
  createManualInvoice,
  listInvoices,
  recordPayment,
} from "@/modules/platform/billing-ledger";

/** Phase B-fix — the unified billing ledger (Paddle mirrors + manual invoices). */
export const GET = route(
  async (req, { auth }) => {
    const sp = req.nextUrl.searchParams;
    return NextResponse.json({
      invoices: await listInvoices(auth, {
        orgId: sp.get("orgId") ?? undefined,
        status: sp.get("status") ?? undefined,
      }),
    });
  },
  { permission: "platform.admin" },
);

const invoiceSchema = z.object({
  op: z.literal("create_invoice"),
  orgId: z.string().uuid(),
  currency: z.string().length(3).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  periodStart: z.string().date().nullable().optional(),
  periodEnd: z.string().date().nullable().optional(),
  lines: z
    .array(z.object({ desc: z.string().min(1).max(300), qty: z.number().int().min(1), unitCents: z.number().int().min(0) }))
    .min(1)
    .max(50),
});

const paymentSchema = z.object({
  op: z.literal("record_payment"),
  invoiceId: z.string().uuid(),
  amountCents: z.number().int().min(1).optional(),
  method: z.string().max(40).optional(),
  receivedAt: z.string().datetime().nullable().optional(),
  providerRef: z.string().max(200).nullable().optional(),
});

const bodySchema = z.discriminatedUnion("op", [invoiceSchema, paymentSchema]);

/** POST ?op=create_invoice | ?op=record_payment */
export const POST = route(
  async (req: NextRequest, { auth }) => {
    const op = req.nextUrl.searchParams.get("op");
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid request", parsed.error.flatten());

    if (parsed.data.op === "create_invoice") {
      if (op && op !== "create_invoice") throw ApiError.badRequest("op mismatch");
      const row = await createManualInvoice(auth, parsed.data);
      return NextResponse.json({ ok: true, invoice: { id: row.id, number: row.number, amountCents: row.amountCents } }, { status: 201 });
    }
    if (op && op !== "record_payment") throw ApiError.badRequest("op mismatch");
    const result = await recordPayment(auth, parsed.data);
    return NextResponse.json({ ok: true, ...result });
  },
  { permission: "platform.admin" },
);
