export const dynamic = "force-dynamic";

import { ActionButton, SimpleForm } from "@/components/finance-people-actions";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { listTravel } from "@/modules/finance/service";

export const metadata = { title: "Travel" };

const btnS = "rounded-md border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-hover";

export default async function TravelPage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "finance") || !can(ctx.access, "finance.view_self")) {
    return <Card><EmptyState title="Travel" hint="You don't have finance access." /></Card>;
  }
  const rows = await listTravel(ctx);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-primary">Travel requests</h1>
        <p className="mt-1 text-sm text-secondary">Approved travel connects to expenses for reimbursement.</p>
      </header>

      <Card>
        <CardHeader title="New travel request" />
        <SimpleForm
          path="/api/v1/finance/travel"
          submitLabel="Submit request"
          payload={{ submit: true }}
          fields={[
            { name: "destination", label: "Destination", required: true },
            { name: "purpose", label: "Purpose", type: "textarea" },
            { name: "departAt", label: "Departure", type: "date" },
            { name: "returnAt", label: "Return", type: "date" },
            { name: "amount", label: "Estimated cost (major units)", type: "numberCents", required: true },
          ]}
        />
      </Card>

      <Card>
        <CardHeader title="Requests" />
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-tertiary">No travel requests yet.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {rows.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <p className="font-medium">{t.destination}</p>
                  <p className="text-xs text-tertiial">{t.requesterName} · {t.purpose?.slice(0, 60) ?? ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">{new Intl.NumberFormat(undefined, { style: "currency", currency: t.currency }).format(t.estimatedCents / 100)}</span>
                  <Badge tone={t.status === "approved" ? "green" : t.status === "rejected" ? "red" : t.status === "submitted" ? "brand" : "neutral"}>{t.status}</Badge>
                  {can(ctx.access, "finance.approve") && t.status === "submitted" ? (
                    <>
                      <ActionButton label="Approve" path={`/api/v1/finance/travel/${t.id}`} body={{ action: "approve" }} className={btnS} />
                      <ActionButton label="Reject" path={`/api/v1/finance/travel/${t.id}`} body={{ action: "reject" }} confirm="Reject?" className={btnS} />
                    </>
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
