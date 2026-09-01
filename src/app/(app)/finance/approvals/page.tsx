export const dynamic = "force-dynamic";

import { Card, CardHeader, EmptyState } from "@/components/ui";
import { BulkApprovalList, type ApprovalItem } from "@/components/finance-bulk-approvals";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { listExpenses, listPurchases, listTravel } from "@/modules/finance/service";

export const metadata = { title: "Finance approvals" };

function money(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}

export default async function FinanceApprovalsPage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "finance") || !can(ctx.access, "finance.approve")) {
    return <Card><EmptyState title="Approvals" hint="You don't have finance approval permission." /></Card>;
  }
  const [expenses, purchases, travel] = await Promise.all([
    listExpenses(ctx, { status: "submitted" }),
    listPurchases(ctx, { status: "submitted" }),
    listTravel(ctx, { status: "submitted" }),
  ]);

  const expenseItems: ApprovalItem[] = expenses.map((e) => ({
    id: `e:${e.id}`,
    title: e.title,
    href: `/finance/expenses/${e.id}`,
    amountLabel: money(e.amountCents, e.currency),
    approvePath: `/api/v1/finance/expenses/${e.id}`,
    canApprove: e.submittedBy !== ctx.user.id,
    notApproveReason: e.submittedBy === ctx.user.id ? "your own — needs another approver" : undefined,
  }));
  const purchaseItems: ApprovalItem[] = purchases.map((p) => ({
    id: `p:${p.id}`,
    title: p.title,
    amountLabel: money(p.estimatedCents, p.currency),
    approvePath: `/api/v1/finance/purchases/${p.id}`,
    canApprove: true,
  }));
  const travelItems: ApprovalItem[] = travel.map((t) => ({
    id: `t:${t.id}`,
    title: t.destination,
    approvePath: `/api/v1/finance/travel/${t.id}`,
    canApprove: true,
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-primary">Approval center</h1>
        <p className="mt-1 text-sm text-secondary">Everything waiting on a finance decision. Select rows and approve in bulk.</p>
      </header>

      <Card>
        <CardHeader title={`Expenses (${expenseItems.length})`} subtitle="Items you've already submitted are shown but disabled." />
        <BulkApprovalList items={expenseItems} />
      </Card>

      <Card>
        <CardHeader title={`Purchase requests (${purchaseItems.length})`} />
        <BulkApprovalList items={purchaseItems} />
      </Card>

      <Card>
        <CardHeader title={`Travel (${travelItems.length})`} />
        <BulkApprovalList items={travelItems} />
      </Card>
    </div>
  );
}
