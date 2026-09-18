/**
 * Admin panel — invoice PDF (§3.3 "PDFs via print-CSS → storage key").
 *
 * The plan deliberately avoids a PDF library ($0 cost rule): the invoice is
 * rendered as a print-styled HTML page (A4 @page rules, @media print) and the
 * browser's print-to-PDF produces the artifact — the same pattern the payslip
 * screen uses. Two entry points:
 *
 *   GET /api/v1/platform/invoices/[id]/pdf?render=1 → print-ready HTML (→ ⌘P)
 *   GET /api/v1/platform/invoices/[id]/pdf          → stored PDF bytes, or
 *                                                     404 if never archived
 *   POST /api/v1/platform/invoices/[id]/pdf         → archive: the operator
 *                                                     prints-to-PDF and the
 *                                                     browser uploads the
 *                                                     bytes; row gets pdf_key
 */
import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import { saveObject } from "@/lib/storage";
import { platformBillingInvoices } from "@/db/schema";
import { requirePlatformLevel } from "./entitlements";
import type { AuthContext } from "@/lib/session";

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function invoiceKey(invoiceId: string): string {
  return `platform/invoices/${invoiceId}.pdf`;
}

/** Print-styled invoice document (A4, @page rules, auto window.print()). */
export function renderInvoiceHtml(inv: {
  number: string;
  orgName: string;
  orgSlug: string;
  amountCents: number;
  currency: string;
  status: string;
  source: string;
  issuedAt: Date;
  dueAt: Date | null;
  paidAt: Date | null;
  lines: { desc: string; qty: number; unitCents: number; totalCents: number }[];
  reason: string;
}): string {
  const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");
  const rows = inv.lines
    .map(
      (l) =>
        `<tr><td>${esc(l.desc)}</td><td class="num">${l.qty}</td><td class="num">${money(l.unitCents, inv.currency)}</td><td class="num">${money(l.totalCents, inv.currency)}</td></tr>`,
    )
    .join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Invoice ${esc(inv.number)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: #111; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-start; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .muted { color: #666; font-size: 12px; }
  .meta { text-align: right; font-size: 13px; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin-top: 28px; font-size: 13px; }
  th { text-align: left; border-bottom: 2px solid #111; padding: 6px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  td { border-bottom: 1px solid #ddd; padding: 8px; }
  .num { text-align: right; }
  .total td { border-bottom: none; font-weight: 700; font-size: 15px; padding-top: 12px; }
  .reason { margin-top: 20px; font-size: 12px; color: #444; }
  footer { margin-top: 48px; font-size: 10px; color: #999; text-align: center; }
  @media print { .noprint { display: none !important; } }
</style>
</head>
<body>
  <header>
    <div>
      <h1>Wamiro</h1>
      <p class="muted">Invoice ${esc(inv.number)} · ${esc(inv.status)} · via ${esc(inv.source)}</p>
    </div>
    <div class="meta">
      <div><strong>Billed to</strong></div>
      <div>${esc(inv.orgName)}</div>
      <div class="muted">/${esc(inv.orgSlug)}</div>
      <div>Issued ${fmt(inv.issuedAt)}</div>
      <div>Due ${fmt(inv.dueAt)}</div>
      ${inv.paidAt ? `<div>Paid ${fmt(inv.paidAt)}</div>` : ""}
    </div>
  </header>
  <table>
    <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount</th></tr></thead>
    <tbody>
      ${rows}
      <tr class="total"><td colspan="3" class="num">Total due</td><td class="num">${money(inv.amountCents, inv.currency)}</td></tr>
    </tbody>
  </table>
  ${inv.reason ? `<p class="reason">Note: ${esc(inv.reason)}</p>` : ""}
  <footer>This is a computer-generated invoice from the Wamiro billing ledger.</footer>
  <p class="noprint" style="margin-top:24px;text-align:center;">
    <button onclick="window.print()" style="padding:8px 16px;font-size:14px;">Print / Save as PDF</button>
  </p>
  <script>if (!window.matchMedia || window.matchMedia("print").matches === false) { /* leave printing to the operator */ }</script>
</body>
</html>`;
}

async function loadInvoice(invoiceId: string) {
  const [inv] = await db
    .select()
    .from(platformBillingInvoices)
    .where(eq(platformBillingInvoices.id, invoiceId))
    .limit(1);
  if (!inv) throw ApiError.notFound("Invoice not found");
  return inv;
}

/** Archive the operator's print-to-PDF output against the invoice row. */
export async function archiveInvoicePdf(
  ctx: AuthContext,
  invoiceId: string,
  pdf: Buffer,
): Promise<{ pdfKey: string }> {
  requirePlatformLevel(ctx, "operator");
  const inv = await loadInvoice(invoiceId);
  if (pdf.length === 0 || pdf.length > 20 * 1024 * 1024) {
    throw ApiError.badRequest("PDF payload missing or larger than 20 MB");
  }
  if (pdf.subarray(0, 4).toString("ascii") !== "%PDF") {
    throw ApiError.badRequest("Payload is not a PDF");
  }
  const key = invoiceKey(invoiceId);
  await saveObject(key, pdf);
  await db
    .update(platformBillingInvoices)
    .set({ pdfKey: key })
    .where(eq(platformBillingInvoices.id, invoiceId));
  await audit({
    organizationId: null,
    actorUserId: ctx.user.id,
    action: "PLATFORM_INVOICE_PDF_ARCHIVED",
    entityType: "billing_invoice",
    entityId: invoiceId,
    newValue: { number: inv.number, bytes: pdf.length },
  });
  return { pdfKey: key };
}

/** Whether a stored PDF exists (drives the UI link). */
export async function invoiceHasPdf(invoiceId: string): Promise<boolean> {
  const [row] = await db
    .select({ pdfKey: platformBillingInvoices.pdfKey })
    .from(platformBillingInvoices)
    .where(eq(platformBillingInvoices.id, invoiceId))
    .limit(1);
  return Boolean(row?.pdfKey);
}

/** Latest archived pdf keys for a set of invoices (batch — billing tables). */
export async function pdfKeysFor(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const rows = await db.execute(sql`
    SELECT id::text AS id, pdf_key AS key
    FROM platform.billing_invoices
    WHERE pdf_key IS NOT NULL AND id = ANY(${ids}::uuid[])
  `);
  const out: Record<string, string> = {};
  for (const r of rows.rows as { id: string; key: string }[]) out[r.id] = r.key;
  return out;
}
