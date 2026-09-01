export const dynamic = "force-dynamic";

import { ActionButton, SimpleForm } from "@/components/finance-people-actions";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { listPurchases } from "@/modules/finance/service";

export const metadata = { title: "Purchases" };

const TONES: Record<string, "neutral" | "amber" | "green" | "red" | "brand"> = {
  draft: "neutral", submitted: "brand", approved: "green", rejected: "red", ordered: "amber", received: "green", canceled: "neutral",
};

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "finance") || !can(ctx.access, "finance.view_self")) {
    return <Card><EmptyState title="Purchases" hint="You don't have finance access." /></Card>;
  }
  const sp = await searchParams;
  const rows = await listPurchases(ctx, { status: sp.status });
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-primary">Purchase requests</h1>
        <p className="mt-1 text-sm text-secondary">Request → approval → procurement → completion.</p>
      </header>

      <Card>
        <CardHeader title="New purchase request" />
        <SimpleForm
          path="/api/v1/finance/purchases"
          submitLabel="Submit request"
          payload={{ submit: true }}
          fields={[
            { name: "title", label: "What is needed", required: true },
            { name: "justification", label: "Justification", type: "textarea" },
            { name: "amount", label: "Estimated amount (major units)", type: "numberCents", required: true },
            { name: "currency", label: "Currency", placeholder: "USD" },
            { name: "neededBy", label: "Needed by", type: "date" },
          ]}
        />
      </Card>

      <Card>
        <CardHeader title={sp.status ? `Queue: ${sp.status}` : "All requests"} />
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-tertiary">Nothing in this queue.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {rows.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <p className="font-medium">{p.title}</p>
                  <p className="text-xs text-tertiary">{p.requesterName}{p.vendorName ? ` · ${p.vendorName}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">{new Intl.NumberFormat(undefined, { style: "currency", currency: p.currency }).format(p.estimatedCents / 100)}</span>
                  <Badge tone={TONES[p.status] ?? "neutral"}>{p.status}</Badge>
                  {can(ctx.access, "finance.approve") && p.status === "submitted" ? (
                    <>
                      <ActionButton label="Approve" path={`/api/v1/finance/purchases/${p.id}`} body={{ action: "approve" }} className={`${btnS}`} />
                      <ActionButton label="Reject" path={`/api/v1/finance/purchases/${p.id}`} body={{ action: "reject" }} confirm="Reject?" className={`${btnS}`} />
                    </>
                  ) : null}
                  {can(ctx.access, "finance.manage_procurement") && p.status === "approved" ? (
                    <ActionButton label="Mark ordered" path={`/api/v1/finance/purchases/${p.id}`} body={{ action: "order" }} className={`${btnS}`} />
                  ) : null}
                  {can(ctx.access, "finance.manage_procurement") && p.status === "ordered" ? (
                    <ActionButton label="Mark received" path={`/api/v1/finance/purchases/${p.id}`} body={{ action: "receive" }} className={`${btnS}`} />
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

const btnS = "rounded-md border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-hover";
