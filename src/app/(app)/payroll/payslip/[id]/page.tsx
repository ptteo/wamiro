import { redirect } from "next/navigation";

import { PayslipActions } from "@/components/payslip-actions";
import { requireAuthPage } from "@/lib/page-auth";
import { getPayslip } from "@/modules/payroll/service";
import { can } from "@/modules/iam/engine";

export const dynamic = "force-dynamic";

function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function dateLabel(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Phase 8 — authenticated A4 payslip. The browser print dialog provides both
 * physical printing and Save as PDF without storing a public PDF file.
 */
export default async function PayslipPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthPage();
  const { id } = await params;
  const slip = await getPayslip(ctx, id);
  if (!can(ctx.access, "payroll.manage") && slip.employeeUserId !== ctx.user.id) {
    redirect("/payroll");
  }

  return (
    <div className="payslip-page fixed inset-0 z-50 overflow-y-auto bg-neutral-100 text-neutral-900">
      <PayslipActions />

      <main className="payslip-sheet mx-auto mb-8 min-h-[297mm] w-full max-w-[210mm] bg-white px-[15mm] py-[14mm] shadow-xl">
        <header className="flex items-start justify-between gap-6 border-b-2 border-neutral-900 pb-5">
          <div className="flex items-center gap-3">
            {slip.organizationLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={slip.organizationLogoUrl}
                alt=""
                className="h-12 w-12 object-contain"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-neutral-900 text-lg font-bold text-white">
                {slip.organizationName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold tracking-tight">{slip.organizationName}</h1>
              <p className="mt-0.5 text-xs text-neutral-500">Employee salary statement</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tracking-tight">PAYSLIP</p>
            <p className="mt-1 text-sm font-semibold text-neutral-600">{slip.periodLabel}</p>
            <p className="mt-1 text-[11px] uppercase tracking-wider text-neutral-400">
              Status: {slip.runStatus}
            </p>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-x-10 gap-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Employee name</p>
            <p className="mt-0.5 font-semibold">{slip.employeeName}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Employee ID</p>
            <p className="mt-0.5 font-semibold">{slip.employeeCode ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Designation</p>
            <p className="mt-0.5">{slip.employeeJobTitle ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Pay period</p>
            <p className="mt-0.5">
              {dateLabel(slip.periodStart)} – {dateLabel(slip.periodEnd)}
            </p>
          </div>
        </section>

        <section className="mt-6 grid grid-cols-2 gap-5">
          <div className="overflow-hidden rounded-lg border border-neutral-200">
            <div className="flex items-center justify-between bg-neutral-900 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-white">
              <span>Earnings</span>
              <span>Amount</span>
            </div>
            <div className="min-h-48 px-4 py-2">
              {slip.earnings.map((earning) => (
                <div
                  key={earning.component}
                  className="flex items-center justify-between gap-4 border-b border-neutral-100 py-2.5 text-sm last:border-0"
                >
                  <span>{earning.component}</span>
                  <span className="whitespace-nowrap tabular-nums">
                    {money(earning.amount, slip.currency)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-neutral-300 bg-neutral-50 px-4 py-3 text-sm font-bold">
              <span>Gross earnings</span>
              <span className="tabular-nums">{money(slip.gross, slip.currency)}</span>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-neutral-200">
            <div className="flex items-center justify-between bg-neutral-700 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-white">
              <span>Deductions</span>
              <span>Amount</span>
            </div>
            <div className="min-h-48 px-4 py-2">
              {slip.deductions.length ? (
                slip.deductions.map((deduction) => (
                  <div
                    key={deduction.component}
                    className="flex items-center justify-between gap-4 border-b border-neutral-100 py-2.5 text-sm last:border-0"
                  >
                    <span>{deduction.component}</span>
                    <span className="whitespace-nowrap tabular-nums">
                      {money(deduction.amount, slip.currency)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="py-3 text-sm text-neutral-400">No deductions</p>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-neutral-300 bg-neutral-50 px-4 py-3 text-sm font-bold">
              <span>Total deductions</span>
              <span className="tabular-nums">{money(slip.totalDeductions, slip.currency)}</span>
            </div>
          </div>
        </section>

        <section className="mt-6 flex items-center justify-between rounded-lg border-2 border-neutral-900 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Net salary payable</p>
            <p className="mt-1 text-xs text-neutral-500">Gross earnings less total deductions</p>
          </div>
          <p className="text-2xl font-bold tabular-nums">{money(slip.net, slip.currency)}</p>
        </section>

        <footer className="mt-12 border-t border-neutral-200 pt-4 text-center text-[10px] leading-5 text-neutral-400">
          <p>This is a computer-generated payslip and does not require a signature.</p>
          <p>Generated securely by Wamiro for {slip.organizationName}.</p>
        </footer>
      </main>

      <style>{`
        @page {
          size: A4;
          margin: 0;
        }
        @media print {
          html, body {
            background: white !important;
          }
          .payslip-page {
            position: static !important;
            overflow: visible !important;
            background: white !important;
          }
          .payslip-toolbar {
            display: none !important;
          }
          .payslip-sheet {
            margin: 0 !important;
            min-height: 297mm !important;
            width: 210mm !important;
            max-width: none !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
}
