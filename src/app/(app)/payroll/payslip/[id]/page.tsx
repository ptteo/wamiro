import { redirect } from "next/navigation";

import { requireAuthPage } from "@/lib/page-auth";
import { getPayslip } from "@/modules/payroll/service";
import { can } from "@/modules/iam/engine";
import { db } from "@/lib/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

/**
 * Phase 8 — print-ready payslip (print CSS → free PDF via the browser).
 * Server-rendered, minimal chrome, auto-opens the print dialog.
 */
export default async function PayslipPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthPage();
  const { id } = await params;
  const slip = await getPayslip(ctx, id);
  if (!can(ctx.access, "payroll.manage") && slip.employeeUserId !== ctx.user.id) {
    redirect("/payroll");
  }
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, ctx.org.id))
    .limit(1);

  const rows: [string, string, string][] = [
    ...slip.earnings.map((e) => ["Earning", e.component, money(e.amount, slip.currency)] as [string, string, string]),
    ...slip.deductions.map((d) => ["Deduction", d.component, money(d.amount, slip.currency)] as [string, string, string]),
  ];

  return (
    <div className="mx-auto max-w-2xl bg-white p-8 text-neutral-900 print:p-0">
      <script
        dangerouslySetInnerHTML={{ __html: "window.addEventListener('load',()=>setTimeout(()=>window.print(),300));" }}
      />
      <header className="mb-6 flex items-start justify-between border-b border-neutral-300 pb-4">
        <div>
          <h1 className="text-lg font-bold">{org?.name ?? "Company"}</h1>
          <p className="text-xs text-neutral-500">Payslip · {slip.periodLabel}</p>
        </div>
        <div className="text-right text-xs text-neutral-600">
          <p className="font-semibold text-neutral-900">{slip.employeeName}</p>
          {slip.employeeCode ? <p>Employee #{slip.employeeCode}</p> : null}
          <p>
            {slip.periodStart} → {slip.periodEnd}
          </p>
          <p className="capitalize">{slip.runStatus}</p>
        </div>
      </header>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-300 text-left text-xs uppercase tracking-wide text-neutral-500">
            <th className="py-1.5 pr-3">Type</th>
            <th className="py-1.5 pr-3">Component</th>
            <th className="py-1.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([type, component, amount], i) => (
            <tr key={`${type}-${component}-${i}`} className="border-b border-neutral-100">
              <td className="py-1.5 pr-3 text-neutral-500">{type}</td>
              <td className="py-1.5 pr-3">{component}</td>
              <td className="py-1.5 text-right tabular-nums">{amount}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-neutral-300">
            <td colSpan={2} className="pt-2 text-neutral-600">
              Gross
            </td>
            <td className="pt-2 text-right tabular-nums">{money(slip.gross, slip.currency)}</td>
          </tr>
          <tr>
            <td colSpan={2} className="text-neutral-600">
              Total deductions
            </td>
            <td className="text-right tabular-nums">−{money(slip.totalDeductions, slip.currency)}</td>
          </tr>
          <tr className="text-base font-bold">
            <td colSpan={2} className="pt-1">
              Net pay
            </td>
            <td className="pt-1 text-right tabular-nums">{money(slip.net, slip.currency)}</td>
          </tr>
        </tfoot>
      </table>

      <footer className="mt-8 border-t border-neutral-200 pt-3 text-[10px] text-neutral-400">
        Computer-generated payslip from Wamiro. No signature required.
      </footer>
    </div>
  );
}
