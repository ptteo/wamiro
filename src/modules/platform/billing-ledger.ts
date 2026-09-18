/**
 * Admin panel B-fix — platform billing ledger: manual invoices + payments + credits.
 *
 * The unified ledger lives in the `platform` schema (platform.billing_invoices)
 * and holds BOTH provider mirrors (source='paddle', written by the webhook)
 * and manual invoices raised by operators (source='manual', here). Rows are
 * Historical class: soft org reference + name/slug snapshots, so revenue
 * history survives tenant deletion. The panel never writes tenant tables.
 *
 * Reason prompts (§10.4 #14 folded into B-fix): manual invoices and credits
 * require a short reason stored on the row — six months later "why did Bruito
 * get a comp month?" is answerable from the ledger itself.
 */
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import {
  organizations,
  platformBillingCredits,
  platformBillingInvoices,
  platformBillingPayments,
} from "@/db/schema";
import { requirePlatformLevel } from "./entitlements";
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
    /** Why this invoice exists (discount, comp month, enterprise deal). */
    reason: string;
  },
) {
  requirePlatformLevel(ctx, "operator"); // Phase F: billing mutations are operator-level
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw ApiError.badRequest("At least one line item is required");
  }
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 5) {
    throw ApiError.badRequest("Add a short reason (min 5 chars) so the ledger explains itself later");
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
      reason: reason.slice(0, 500),
      createdBy: ctx.user.id,
    })
    .returning();

  await audit({
    organizationId: null,
    actorUserId: ctx.user.id,
    action: "PLATFORM_INVOICE_CREATED",
    entityType: "billing_invoice",
    entityId: row!.id,
    newValue: { number, orgName: org.name, amountCents, currency: row!.currency, reason },
  });
  return row!;
}

/**
 * Record a payment against an invoice; auto-closes the invoice when fully
 * paid. Overpayment succeeds and carries the balance forward (§8) — the
 * surplus stays visible as a succeeded payment row and is returned here.
 */
export async function recordPayment(
  ctx: AuthContext,
  input: { invoiceId: string; amountCents?: number; method?: string; receivedAt?: string | null; providerRef?: string | null },
) {
  requirePlatformLevel(ctx, "operator");
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
  return { closed, paidTotal, overpaymentCents: Math.max(0, paidTotal - inv.amountCents) };
}

/**
 * Issue a goodwill/discount credit against a tenant. Credits are standalone
 * ledger rows (Historical class) — applying them to a specific invoice is a
 * later Revenue-phase concern; the reason keeps the ledger self-explanatory.
 */
export async function createCredit(
  ctx: AuthContext,
  input: { orgId: string; amountCents: number; reason: string; expiresAt?: string | null },
) {
  requirePlatformLevel(ctx, "operator");
  const amountCents = Math.round(Number(input.amountCents));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw ApiError.badRequest("Invalid credit amount");
  }
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 5) {
    throw ApiError.badRequest("Credit requires a short reason (min 5 chars)");
  }
  let expiresAt: Date | null = null;
  if (input.expiresAt) {
    const parsed = new Date(input.expiresAt);
    if (Number.isNaN(parsed.getTime())) throw ApiError.badRequest("Invalid expiry date");
    expiresAt = parsed;
  }

  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, input.orgId))
    .limit(1);
  if (!org) throw ApiError.notFound("Organization not found");

  const [row] = await db
    .insert(platformBillingCredits)
    .values({
      orgId: org.id,
      orgName: org.name,
      amountCents,
      reason: reason.slice(0, 500),
      expiresAt,
      createdBy: ctx.user.id,
    })
    .returning();

  await audit({
    organizationId: null,
    actorUserId: ctx.user.id,
    action: "PLATFORM_CREDIT_ISSUED",
    entityType: "billing_credit",
    entityId: row!.id,
    newValue: { orgName: org.name, amountCents, reason, expiresAt: expiresAt?.toISOString() ?? null },
  });
  return row!;
}

/** Ledger list for the Revenue tab (historical class — includes deleted tenants). */
export async function listInvoices(
  ctx: AuthContext,
  opts: { orgId?: string; status?: string } = {},
) {
  requirePlatformLevel(ctx, "viewer");
  const conds = [];
  if (opts.orgId) conds.push(eq(platformBillingInvoices.orgId, opts.orgId));
  if (opts.status) conds.push(eq(platformBillingInvoices.status, opts.status));
  const rows = await db
    .select({
      id: platformBillingInvoices.id,
      orgId: platformBillingInvoices.orgId,
      orgName: platformBillingInvoices.orgName,
      orgSlug: platformBillingInvoices.orgSlug,
      number: platformBillingInvoices.number,
      providerInvoiceId: platformBillingInvoices.providerInvoiceId,
      amountCents: platformBillingInvoices.amountCents,
      currency: platformBillingInvoices.currency,
      status: platformBillingInvoices.status,
      source: platformBillingInvoices.source,
      issuedAt: platformBillingInvoices.issuedAt,
      dueAt: platformBillingInvoices.dueAt,
      paidAt: platformBillingInvoices.paidAt,
      lines: platformBillingInvoices.lines,
      reason: platformBillingInvoices.reason,
      paidCents: sql<number>`COALESCE((
        SELECT sum(p.amount_cents) FROM platform.billing_payments p
        WHERE p.invoice_id = ${platformBillingInvoices.id} AND p.status = 'succeeded'
      ), 0)::int`,
    })
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
    reason: r.reason,
    paidCents: Number(r.paidCents ?? 0),
  }));
}

/** Credit ledger list (historical class — includes deleted tenants). */
export async function listCredits(
  ctx: AuthContext,
  opts: { orgId?: string } = {},
) {
  requirePlatformLevel(ctx, "viewer");
  const rows = await db
    .select()
    .from(platformBillingCredits)
    .where(opts.orgId ? eq(platformBillingCredits.orgId, opts.orgId) : undefined)
    .orderBy(desc(platformBillingCredits.createdAt))
    .limit(200);
  return rows.map((r) => ({
    id: r.id,
    orgId: r.orgId,
    orgName: r.orgName,
    amountCents: r.amountCents,
    reason: r.reason,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * 3-year retention prune (§3.3 + amendment #8). Historical rows outlive
 * tenants but not forever — the ledger stays bounded like every other table.
 * Called by the hourly usage_rollup job (cheap DELETE, runs in milliseconds).
 */
export async function pruneLedgerRetention(): Promise<{ invoices: number; payments: number; credits: number; events: number }> {
  const res = await db.execute(sql`
    WITH old_inv AS (
      DELETE FROM platform.billing_invoices WHERE issued_at < (now() - interval '3 years') RETURNING id
    ), old_pay AS (
      DELETE FROM platform.billing_payments WHERE received_at < (now() - interval '3 years') RETURNING id
    ), old_cred AS (
      DELETE FROM platform.billing_credits WHERE created_at < (now() - interval '3 years') RETURNING id
    ), old_evt AS (
      DELETE FROM platform.billing_events WHERE created_at < (now() - interval '3 years') RETURNING event_id
    )
    SELECT
      (SELECT count(*) FROM old_inv)::int AS invoices,
      (SELECT count(*) FROM old_pay)::int AS payments,
      (SELECT count(*) FROM old_cred)::int AS credits,
      (SELECT count(*) FROM old_evt)::int AS events
  `);
  const r = (res.rows[0] ?? {}) as Record<string, number>;
  return {
    invoices: Number(r.invoices ?? 0),
    payments: Number(r.payments ?? 0),
    credits: Number(r.credits ?? 0),
    events: Number(r.events ?? 0),
  };
}
