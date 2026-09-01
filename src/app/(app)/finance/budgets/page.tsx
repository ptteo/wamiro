export const dynamic = "force-dynamic";

import { SimpleForm } from "@/components/finance-people-actions";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { listBudgets } from "@/modules/finance/service";

export const metadata = { title: "Budgets" };

function money(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}

export default async function BudgetsPage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "finance") || !can(ctx.access, "finance.view_self")) {
    return <Card><EmptyState title="Budgets" hint="You don't have finance access." /></Card>;
  }
  const rows = await listBudgets(ctx);
  const manage = can(ctx.access, "finance.manage_budgets");
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-primary">Budgets</h1>
        <p className="mt-1 text-sm text-secondary">Allocations vs spend. Approved expenses and purchases charge the linked budget.</p>
      </header>

      {manage ? (
        <Card>
          <CardHeader title="New budget" />
          <SimpleForm
            path="/api/v1/finance/budgets"
            submitLabel="Create budget"
            fields={[
              { name: "name", label: "Name", required: true },
              { name: "periodLabel", label: "Period (e.g. 2026 or 2026-Q1)", required: true },
              { name: "amount", label: "Amount (major units)", type: "numberCents", required: true },
              { name: "currency", label: "Currency", placeholder: "USD" },
            ]}
          />
        </Card>
      ) : null}

      <Card>
        <CardHeader title="All budgets" />
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-tertiary">No budgets yet.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {rows.map((b) => {
              const pct = b.amountCents ? Math.min(100, Math.round((b.spentCents / b.amountCents) * 100)) : 0;
              return (
                <li key={b.id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{b.name}</p>
                      <p className="text-xs text-tertiary">
                        {b.periodLabel}{b.departmentName ? ` · ${b.departmentName}` : ""}{b.ownerName ? ` · owner ${b.ownerName}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums">{money(b.spentCents, b.currency)} / {money(b.amountCents, b.currency)}</span>
                      <Badge tone={b.status !== "active" ? "neutral" : pct >= 100 ? "red" : pct >= 80 ? "amber" : "green"}>
                        {b.status === "active" ? `${pct}%` : b.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
                    <div className={`h-full ${pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-success"}`} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
