"use client";

import Link from "next/link";

export function PayslipActions() {
  return (
    <div className="payslip-toolbar mx-auto flex w-full max-w-[210mm] items-center justify-between gap-3 px-4 py-3">
      <Link
        href="/payroll"
        className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
      >
        ← Back to payroll
      </Link>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700"
      >
        Print / Download PDF
      </button>
    </div>
  );
}
