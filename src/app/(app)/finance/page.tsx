export const dynamic = "force-dynamic";

import Link from "next/link";

import { Badge, Card, CardHeader, EmptyState, Stat } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { financeHome } from "@/modules/finance/service";

export const metadata = { title: "Finance" };

function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}

const CATEGORY_LABELS: Record<string, string> = {
  travel: "Travel", meals: "Meals", software: "Software", office: "Office", other: "Other",
};

export default async function FinanceHomePage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "finance") || !can(ctx.access, "finance.view_self")) {
    return <Card><EmptyState title="Finance" hint="You don't have finance access." /></Card>;
  }
  const home = await financeHome(ctx);
  const canManageBudgets = can(ctx.access, "finance.manage_budgets");
  const canViewCompany = can(ctx.access, "finance.view_company");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-primary">Finance</h1>
        <p className="mt-1 text-sm text-secondary">Expenses, purchases, travel and budgets for {ctx.org.name}.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="My pending" value={home.myPendingCount} hint={home.myPendingByCurrency.length === 0 ? "none" : home.myPendingByCurrency.map((c) => `${money(c.cents, c.currency)} (${c.count})`).join(" · ")} />
        {home.pendingApprovalCount !== null ? (
          <Stat label="Awaiting approval" value={home.pendingApprovalCount} hint="across the company" />
        ) : (
          <Stat label="Open purchases" value={home.openPurchases} hint="submitted / approved / ordered" />
        )}
        {home.pendingApprovalCount !== null ? (
          <Stat label="Open purchases" value={home.openPurchases} hint="submitted / approved / ordered" />
        ) : null}
        <Stat label="Budget warnings" value={home.overBudget.length} hint="≥80% of allocation" tone={home.overBudget.length > 0 ? "amber" : "neutral"} />
      </div>

      <Card>
        <CardHeader title="Overview" subtitle="Your pipeline at a glance" />
        <ul className="divide-y divide-border-subtle text-sm">
          <li className="flex items-center justify-between px-5 py-2.5">
            <span className="text-tertiary">My pending reimbursements</span>
            <Link href="/finance/expenses?status=submitted&mine=1" className="font-medium hover:underline">
              {home.myPendingCount}
              {home.myPendingByCurrency.length > 0 && (
                <span className="ml-2 text-xs text-tertiary">
                  · {home.myPendingByCurrency.map((c) => money(c.cents, c.currency)).join(" · ")}
                </span>
              )}
            </Link>
          </li>
          {home.pendingApprovalCount !== null ? (
            <li className="flex items-center justify-between px-5 py-2.5">
              <span className="text-tertiary">Awaiting approval</span>
              <Link href="/finance/approvals" className="font-medium hover:underline">{home.pendingApprovalCount}</Link>
            </li>
          ) : null}
          <li className="flex items-center justify-between px-5 py-2.5">
            <span className="text-tertiary">Open purchase requests</span>
            <Link href="/finance/purchases" className="font-medium hover:underline">{home.openPurchases}</Link>
          </li>
        </ul>
      </Card>

      {home.myCategorySpend.length > 0 && (
        <Card>
          <CardHeader title="Your last 30 days" subtitle="By category, approved + reimbursed" />
          <ul className="divide-y divide-border-subtle text-sm">
            {home.myCategorySpend.map((c, i) => (
              <li key={`${c.category}-${c.currency}-${i}`} className="flex items-center justify-between px-5 py-2.5">
                <span>{CATEGORY_LABELS[c.category] ?? c.category} <span className="text-xs text-tertiary">· {c.count} item{c.count === 1 ? "" : "s"}</span></span>
                <span className="font-medium tabular-nums">{money(c.cents, c.currency)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {home.recentVendors.length > 0 && (can(ctx.access, "finance.manage_vendors") || home.recentVendors.length > 0) && (
        <Card>
          <CardHeader title="Recent vendors" subtitle="Most recently updated" />
          <ul className="divide-y divide-border-subtle text-sm">
            {home.recentVendors.map((v) => (
              <li key={v.id} className="flex items-center justify-between px-5 py-2.5">
                <Link href={`/finance/vendors/${v.id}`} className="font-medium hover:underline">{v.name}</Link>
                <Badge tone={v.status === "active" ? "green" : v.status === "blocked" ? "red" : "neutral"}>{v.status}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {(canManageBudgets || canViewCompany) ? (
        <Card>
          <CardHeader title="Budget warnings" subtitle="Active budgets at or above 80% of allocation." />
          {home.overBudget.length === 0 ? (
            <p className="px-5 py-4 text-sm text-tertiary">No budget warnings.</p>
          ) : (
            <ul className="divide-y divide-border-subtle text-sm">
              {home.overBudget.map((b) => {
                const pct = b.amountCents ? Math.min(100, Math.round((b.spentCents / b.amountCents) * 100)) : 100;
                return (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="font-medium">{b.name}</p>
                      <p className="text-xs text-tertiary">{money(b.spentCents, b.currency)} of {money(b.amountCents, b.currency)}</p>
                    </div>
                    <Badge tone={pct >= 100 ? "red" : "amber"}>{pct}% used</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Quick links" />
        <ul className="divide-y divide-border-subtle text-sm">
          {([
            ["/finance/expenses", "My expenses"],
            ["/finance/approvals", "Approval center"],
            ["/finance/purchases", "Purchase requests"],
            ["/finance/travel", "Travel requests"],
            ...(can(ctx.access, "finance.manage_vendors") ? [["/finance/vendors", "Vendors"]] : []),
            ...(canManageBudgets ? [["/finance/budgets", "Budgets"]] : []),
          ] as [string, string][]).map(([href, label]) => (
            <li key={href} className="px-5 py-2.5"><Link href={href} className="hover:underline">{label}</Link></li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
