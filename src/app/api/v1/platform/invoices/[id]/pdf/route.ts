import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { readObject } from "@/lib/storage";
import {
  archiveInvoicePdf,
  invoiceHasPdf,
  renderInvoiceHtml,
} from "@/modules/platform/invoice-pdf";

/**
 * Invoice PDF surface (§3.3): print-ready HTML render (?render=1) + stored
 * PDF download. The operator prints-to-PDF from the HTML view and archives
 * the bytes via POST — no PDF library, $0 cost, pdf_key set on the row.
 */

/** Print-ready HTML (browser → ⌘P → PDF). */
export const GET = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    const sp = req.nextUrl.searchParams;

    if (sp.get("render") !== "1") {
      // Stored artifact download — operator-level.
      const svc = await import("@/modules/platform/invoice-pdf");
      const { db } = await import("@/lib/db");
      const { platformBillingInvoices } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const [inv] = await db
        .select({ pdfKey: platformBillingInvoices.pdfKey, number: platformBillingInvoices.number })
        .from(platformBillingInvoices)
        .where(eq(platformBillingInvoices.id, id))
        .limit(1);
      if (!inv) throw ApiError.notFound("Invoice not found");
      if (!inv.pdfKey) throw ApiError.notFound("No archived PDF for this invoice yet — open ?render=1 and print-to-PDF, then archive it.");
      const buf = await readObject(inv.pdfKey);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${inv.number}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Render path: HTML for the print dialog (viewer+ can look).
    const { db } = await import("@/lib/db");
    const { platformBillingInvoices } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const [inv] = await db
      .select()
      .from(platformBillingInvoices)
      .where(eq(platformBillingInvoices.id, id))
      .limit(1);
    if (!inv) throw ApiError.notFound("Invoice not found");
    void auth;
    const html = renderInvoiceHtml({
      number: inv.number,
      orgName: inv.orgName,
      orgSlug: inv.orgSlug,
      amountCents: inv.amountCents,
      currency: inv.currency,
      status: inv.status,
      source: inv.source,
      issuedAt: inv.issuedAt,
      dueAt: inv.dueAt,
      paidAt: inv.paidAt,
      lines: inv.lines,
      reason: inv.reason,
    });
    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  },
  { permission: "platform.admin" },
);

/** Archive the printed PDF against the invoice (operator-level). */
export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    const buf = Buffer.from(await req.arrayBuffer());
    const result = await archiveInvoicePdf(auth, id, buf);
    return NextResponse.json({ ok: true, ...result });
  },
  { permission: "platform.admin" },
);

/** Whether an archived PDF exists (UI link state). */
export const HEAD = route(
  async (_req, { params }) => {
    const id = params["id"] ?? "";
    const exists = await invoiceHasPdf(id);
    if (!exists) throw ApiError.notFound("No archived PDF");
    return new NextResponse(null, { status: 200 });
  },
  { permission: "platform.admin" },
);
