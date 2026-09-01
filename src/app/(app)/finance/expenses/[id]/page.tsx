export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionButton } from "@/components/finance-people-actions";
import { Badge, Card, CardHeader, btn } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { ApiError } from "@/lib/errors";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { getExpense } from "@/modules/finance/service";

export const metadata = { title: "Expense detail" };

const STATUS_TONES: Record<string, "neutral" | "amber" | "green" | "red" | "brand"> = {
  draft: "neutral", submitted: "brand", approved: "green", rejected: "red", reimbursed: "green", canceled: "neutral",
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}

interface TimelineStep {
  key: string;
  label: string;
  at: string | null;
  done: boolean;
  tone: "neutral" | "amber" | "green" | "red" | "brand";
}

function buildTimeline(e: { createdAt: Date; decidedAt?: Date | null; reimbursedAt?: Date | null; status: string }): TimelineStep[] {
  const rejected = e.status === "rejected";
  const canceled = e.status === "canceled";
  const reimbursed = e.status === "reimbursed";
  const decided = !!e.decidedAt || ["approved", "rejected", "reimbursed", "canceled"].includes(e.status);

  return [
    { key: "created", label: "Created", at: e.createdAt?.toISOString() ?? null, done: true, tone: "neutral" },
    {
      key: "decided",
      label: rejected ? "Rejected" : canceled ? "Canceled" : "Approved",
      at: e.decidedAt?.toISOString() ?? null,
      done: decided,
      tone: rejected ? "red" : canceled ? "neutral" : "green",
    },
    {
      key: "reimbursed",
      label: "Reimbursed",
      at: e.reimbursedAt?.toISOString() ?? null,
      done: reimbursed,
      tone: reimbursed ? "green" : "neutral",
    },
  ];
}

export default async function ExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "finance") || !can(ctx.access, "finance.view_self")) {
    return <Card>No access.</Card>;
  }
  const { id } = await params;
  let data;
  try {
    data = await getExpense(ctx, id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const e = data.e;
  const timeline = buildTimeline(e);

  return (
    <div className="space-y-6">
      <header>
        <Link href="/finance/expenses" className="text-xs text-tertiary hover:underline">← Back to expenses</Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-primary">{e.title}</h1>
          <Badge tone={STATUS_TONES[e.status] ?? "neutral"}>{e.status}</Badge>
        </div>
      </header>

      <Card>
        <CardHeader title="Details" />
        <dl className="divide-y divide-border-subtle text-sm">
          {[
            ["Amount", `${money(e.amountCents, e.currency)} ${e.currency}`],
            ["Date incurred", new Date(e.incurredAt).toLocaleDateString()],
            ["Category", e.category],
            ["Submitted by", data.submitterName],
            ...(data.projectName ? [["Project", data.projectName]] : []),
            ...(data.budgetName ? [["Budget", data.budgetName]] : []),
            ...(data.vendorName ? [["Vendor", data.vendorName]] : []),
            ...(e.costCenter ? [["Cost center", e.costCenter]] : []),
            ["Created", new Date(e.createdAt).toLocaleString()],
            ...(e.decidedAt ? [["Decided", new Date(e.decidedAt).toLocaleString()]] : []),
            ...(e.reimbursedAt ? [["Reimbursed", new Date(e.reimbursedAt).toLocaleString()]] : []),
          ].map(([k, v]) => (
            <div key={String(k)} className="flex items-center justify-between gap-3 px-5 py-2.5">
              <dt className="text-tertiary">{k as string}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <CardHeader title="Activity" subtitle="Where this expense is in its lifecycle" />
        <ol className="px-5 py-4">
          {timeline.map((s, i) => {
            const isLast = i === timeline.length - 1;
            return (
              <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
                <div className="flex flex-col items-center">
                  <span
                    className={[
                      "mt-1 inline-flex h-3 w-3 shrink-0 rounded-full",
                      s.done ? (s.tone === "red" ? "bg-danger" : s.tone === "green" ? "bg-success" : s.tone === "brand" ? "bg-brand" : "bg-tertiary") : "bg-surface-subtle border border-border-default",
                    ].join(" ")}
                    aria-hidden
                  />
                  {!isLast && <span aria-hidden className="mt-1 w-px flex-1 bg-border-subtle" />}
                </div>
                <div className="flex-1 pb-2">
                  <p className="text-sm font-medium text-primary">
                    {s.label}
                    {!s.done && <span className="ml-2 text-xs text-tertiary">pending</span>}
                  </p>
                  <p className="text-xs text-tertiary">{s.at ? new Date(s.at).toLocaleString() : "—"}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      <Card>
        <CardHeader title="Actions" />
        <div className="flex flex-wrap gap-2 px-5 py-4">
          {e.status === "submitted" && can(ctx.access, "finance.approve") && e.submittedBy !== ctx.user.id ? (
            <>
              <ActionButton label="Approve" path={`/api/v1/finance/expenses/${id}`} body={{ action: "approve" }} className={btn.primary} />
              <ActionButton label="Reject" path={`/api/v1/finance/expenses/${id}`} body={{ action: "reject" }}
                confirm="Reject this expense?" className={btn.danger} />
            </>
          ) : null}
          {e.status === "approved" && can(ctx.access, "finance.reimburse") ? (
            <ActionButton label="Mark reimbursed" path={`/api/v1/finance/expenses/${id}`} body={{ action: "reimburse" }} className={btn.secondary} />
          ) : null}
          {["draft", "submitted"].includes(e.status) && (e.submittedBy === ctx.user.id || can(ctx.access, "finance.approve")) ? (
            <ActionButton label="Cancel" path={`/api/v1/finance/expenses/${id}`} body={{ action: "cancel" }}
              confirm="Cancel this expense?" className={btn.secondary} />
          ) : null}
        </div>
      </Card>
    </div>
  );
}
