/**
 * Admin panel B-fix — platform billing ledger: manual invoices + payments.
 *
 * The unified ledger lives in the `platform` schema (platform.billing_invoices)
 * and holds BOTH provider mirrors (source='paddle', written by the webhook)
 * and manual invoices raised by operators (source='manual', here). Rows are
 * Historical class: soft org reference + name/slug snapshots, so revenue
 * history survives tenant deletion. The panel never writes tenant tables.
 */
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import { organizations, platformBillingInvoices, platformBillingPayments } from "@/db/schema";
import { requirePlatform } from "./console";
import type { AuthContext } from "@/lib/session";

export interface InvoiceLineInput {
  desc: string;
  qty: number;
  unitCents: number;
}

async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getUTCFullYear();
  for (let attempt = 0; attempt < 3; attempt++) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(platformBillingInvoices)
      .where(sql`${platformBillingInvoices.number} LIKE ${`INV-${year}-%`}`);
    const next = (Number(row?.n ?? 0) + 1 + attempt).toString().padStart(4, "0");
    const candidate = `INV-${year}-${next}`;
    const [taken] = await db
      .select({ id: platformBillingInvoices.id })
      .from(platformBillingInvoices)
      .where(eq(platformBillingInvoices.number, candidate))
      .limit(1);
    if (!taken) return candidate;
  }
  // unique suffix fallback — uniqueness is also enforced by index
  return `INV-${year}-${Date.now().toString(36)}`;
}

/** Raise a manual invoice against a tenant (enterprise deals, comp months). */
export async function createManualInvoice(
  ctx: AuthContext,
  input: {
    orgId: string;
    currency?: string;
    dueAt?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    lines: InvoiceLineInput[];
  },
) {
  requirePlatform(ctx);
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw ApiError.badRequest("At least one line item is required");
  }
  const lines = input.lines.slice(0, 50).map((l) => {
    const desc = String(l.desc ?? "").trim().slice(0, 300);
    const qty = Math.round(Number(l.qty));
    const unitCents = Math.round(Number(l.unitCents));
    if (!desc || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitCents) || unitCents < 0) {
      throw ApiError.badRequest("Invalid line item");
    }
    return { desc, qty, unitCents, totalCents: qty * unitCents };
  });
  const amountCents = lines.reduce((s, l) => s + l.totalCents, 0);
  if (amountCents <= 0) throw ApiError.badRequest("Invoice total must be positive");

  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, input.orgId))
    .limit(1);
  if (!org) throw ApiError.notFound("Organization not found");

  const number = await nextInvoiceNumber();
  const [row] = await db
    .insert(platformBillingInvoices)
    .values({
      orgId: org.id,
      orgName: org.name,
      orgSlug: org.slug,
      number,
      amountCents,
      currency: (input.currency ?? "USD").slice(0, 3).toUpperCase(),
      status: "open",
      source: "manual",
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      lines,
      createdBy: ctx.user.id,
    })
    .returning();

  await audit({
    organizationId: null,
    actorUserId: ctx.user.id,
    action: "PLATFORM_INVOICE_CREATED",
    entityType: "billing_invoice",
    entityId: row!.id,
    newValue: { number, orgName: org.name, amountCents, currency: row!.currency },
  });
  return row!;
}

/** Record a payment against an invoice; auto-closes the invoice when fully paid. */
export async function recordPayment(
  ctx: AuthContext,
  input: { invoiceId: string; amountCents?: number; method?: string; receivedAt?: string | null; providerRef?: string | null },
) {
  requirePlatform(ctx);
  const [inv] = await db
    .select()
    .from(platformBillingInvoices)
    .where(eq(platformBillingInvoices.id, input.invoiceId))
    .limit(1);
  if (!inv) throw ApiError.notFound("Invoice not found");
  if (inv.status === "paid" || inv.status === "void") {
    throw ApiError.conflict(`Invoice is already ${inv.status}`);
  }

  const amountCents = Math.round(Number(input.amountCents ?? inv.amountCents));
  if (!Number.isFinite(amountCents) || amountCents <= 0) throw ApiError.badRequest("Invalid payment amount");

  const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();
  await db.insert(platformBillingPayments).values({
    invoiceId: inv.id,
    amountCents,
    method: (input.method ?? "card").slice(0, 40),
    receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
    providerRef: input.providerRef?.slice(0, 200) ?? null,
    recordedBy: ctx.user.id,
  });

  const [totals] = await db
    .select({ paid: sql<number>`COALESCE(sum(CASE WHEN status = 'succeeded' THEN amount_cents ELSE 0 END), 0)::bigint` })
    .from(platformBillingPayments)
    .where(and(eq(platformBillingPayments.invoiceId, inv.id), eq(platformBillingPayments.status, "succeeded")));
  const paidTotal = Number(totals?.paid ?? 0);
  const closed = paidTotal >= inv.amountCents;

  await db
    .update(platformBillingInvoices)
    .set({ status: closed ? "paid" : inv.status, paidAt: closed ? new Date() : inv.paidAt })
    .where(eq(platformBillingInvoices.id, inv.id));

  await audit({
    organizationId: null,
    actorUserId: ctx.user.id,
    action: "PLATFORM_PAYMENT_RECORDED",
    entityType: "billing_invoice",
    entityId: inv.id,
    newValue: { number: inv.number, amountCents, closed },
  });
  return { closed, paidTotal };
}

/** Ledger list for the Revenue tab (historical class — includes deleted tenants). */
export async function listInvoices(
  ctx: AuthContext,
  opts: { orgId?: string; status?: string } = {},
) {
  requirePlatform(ctx);
  const conds = [];
  if (opts.orgId) conds.push(eq(platformBillingInvoices.orgId, opts.orgId));
  if (opts.status) conds.push(eq(platformBillingInvoices.status, opts.status));
  const rows = await db
    .select()
    .from(platformBillingInvoices)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(platformBillingInvoices.issuedAt))
    .limit(200);
  return rows.map((r) => ({
    id: r.id,
    orgId: r.orgId,
    orgName: r.orgName,
    orgSlug: r.orgSlug,
    number: r.number,
    providerInvoiceId: r.providerInvoiceId,
    amountCents: r.amountCents,
    currency: r.currency,
    status: r.status,
    source: r.source,
    issuedAt: r.issuedAt.toISOString(),
    dueAt: r.dueAt ? r.dueAt.toISOString() : null,
    paidAt: r.paidAt ? r.paidAt.toISOString() : null,
    lines: r.lines,
  }));
}

