export const dynamic = "force-dynamic";

import Link from "next/link";

import { ActionButton, SimpleForm } from "@/components/finance-people-actions";
import { Badge, Card, CardHeader, EmptyState, Stat, btn } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { listExpenses } from "@/modules/finance/service";

export const metadata = { title: "Expenses" };

const TONES: Record<string, "neutral" | "amber" | "green" | "red" | "brand"> = {
  draft: "neutral", submitted: "brand", approved: "green", rejected: "red", reimbursed: "green", canceled: "neutral",
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}

const SORT_OPTIONS: Array<{ value: "recent" | "amount" | "date"; label: string }> = [
  { value: "recent", label: "Recently submitted" },
  { value: "amount", label: "Largest first" },
  { value: "date", label: "Most recently incurred" },
];

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; mine?: string; q?: string; sort?: "recent" | "amount" | "date" }>;
}) {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "finance") || !can(ctx.access, "finance.view_self")) {
    return <Card><EmptyState title="Expenses" hint="You don't have finance access." /></Card>;
  }
  const sp = await searchParams;
  const rows = await listExpenses(ctx, {
    status: sp.status,
    mine: sp.mine === "1",
    q: sp.q,
    sort: sp.sort ?? "recent",
  });

  // Per-currency totals (roll-up of the visible rows)
  const totals = rows.reduce<Record<string, { cents: number; count: number }>>((acc, r) => {
    const k = r.currency;
    if (!acc[k]) acc[k] = { cents: 0, count: 0 };
    acc[k].cents += r.amountCents;
    acc[k].count += 1;
    return acc;
  }, {});
  const currencyKeys = Object.keys(totals);
  const submittedCount = rows.filter((r) => r.status === "submitted").length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-primary">Expenses</h1>
          <p className="mt-1 text-sm text-secondary">Submit, track and approve expenses.</p>
        </div>
        <Link href="/finance/approvals" className={`${btn.secondary} ${btn.small}`}>Approval center</Link>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Visible" value={rows.length} />
        <Stat label="Submitted" value={submittedCount} tone={submittedCount > 0 ? "amber" : "neutral"} />
        {currencyKeys.slice(0, 2).map((cur) => {
          const t = totals[cur];
          if (!t) return null;
          return (
            <Stat
              key={cur}
              label={`Total (${cur})`}
              value={money(t.cents, cur)}
              hint={`${t.count} item${t.count === 1 ? "" : "s"}`}
            />
          );
        })}
        {currencyKeys.length === 0 ? (
          <Stat label="Total" value="—" hint="no rows" />
        ) : null}
      </div>

      {can(ctx.access, "finance.submit") ? (
        <Card>
          <CardHeader title="New expense" subtitle="Save as draft or submit for approval." />
          <SimpleForm
            path="/api/v1/finance/expenses"
            submitLabel="Create expense"
            payload={{ category: "other", submit: true }}
            fields={[
              { name: "title", label: "Description", required: true, placeholder: "Client lunch" },
              { name: "category", label: "Category", type: "select", options: [
                { value: "travel", label: "Travel" }, { value: "meals", label: "Meals" },
                { value: "software", label: "Software" }, { value: "office", label: "Office" }, { value: "other", label: "Other" },
              ]},
              { name: "amount", label: "Amount (major units)", type: "numberCents", required: true },
              { name: "currency", label: "Currency", placeholder: "USD" },
              { name: "incurredAt", label: "Date", type: "date", required: true },
              { name: "costCenter", label: "Cost center" },
            ]}
          />
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={sp.mine === "1" ? "My expenses" : "All visible expenses"}
          subtitle={currencyKeys.length > 1 ? `Multi-currency view: ${currencyKeys.join(", ")}` : undefined}
          action={
            <form className="flex flex-wrap items-center gap-2 text-xs">
              <input type="hidden" name="mine" value={sp.mine ?? ""} />
              <input
                type="search"
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder="Search title or category…"
                className="h-8 w-44 rounded-md border border-border-default bg-surface px-2"
              />
              <select name="status" defaultValue={sp.status ?? ""} className="h-8 rounded-md border border-border-default bg-surface px-2">
                <option value="">All statuses</option>
                {["draft", "submitted", "approved", "rejected", "reimbursed", "canceled"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select name="sort" defaultValue={sp.sort ?? "recent"} className="h-8 rounded-md border border-border-default bg-surface px-2">
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button className={`${btn.secondary} ${btn.small}`} type="submit">Filter</button>
            </form>
          }
        />
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-tertiary">
            {sp.q || sp.status ? "No expenses match your filter." : "No expenses yet."}
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {rows.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <Link href={`/finance/expenses/${e.id}`} className="font-medium hover:underline">{e.title}</Link>
                  <p className="text-xs text-tertiary">{e.category} · {new Date(e.incurredAt).toLocaleDateString()} · {e.submitterName}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium tabular-nums">{money(e.amountCents, e.currency)}</span>
                  <Badge tone={TONES[e.status] ?? "neutral"}>{e.status}</Badge>
                  {e.status === "submitted" && can(ctx.access, "finance.approve") && e.submittedBy !== ctx.user.id ? (
                    <>
                      <ActionButton label="Approve" path={`/api/v1/finance/expenses/${e.id}`} body={{ action: "approve" }}
                        className={`${btn.secondary} ${btn.small}`} />
                      <ActionButton label="Reject" path={`/api/v1/finance/expenses/${e.id}`} body={{ action: "reject" }}
                        confirm="Reject this expense?" className={`${btn.secondary} ${btn.small}`} />
                    </>
                  ) : null}
                  {e.status === "approved" && can(ctx.access, "finance.reimburse") ? (
                    <ActionButton label="Mark reimbursed" path={`/api/v1/finance/expenses/${e.id}`} body={{ action: "reimburse" }}
                      className={`${btn.secondary} ${btn.small}`} />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
