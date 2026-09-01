export const dynamic = "force-dynamic";

import Link from "next/link";

import { SimpleForm } from "@/components/finance-people-actions";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { listVendors } from "@/modules/finance/service";

export const metadata = { title: "Vendors" };

const TONES: Record<string, "neutral" | "amber" | "green" | "red"> = {
  active: "green", pending: "amber", inactive: "neutral", blocked: "red",
};

export default async function VendorsPage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "finance") || !can(ctx.access, "finance.view_self")) {
    return <Card><EmptyState title="Vendors" hint="You don't have finance access." /></Card>;
  }
  const rows = await listVendors(ctx);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-primary">Vendors</h1>
        <p className="mt-1 text-sm text-secondary">Supplier directory with status and ownership.</p>
      </header>

      {can(ctx.access, "finance.manage_vendors") ? (
        <Card>
          <CardHeader title="Add vendor" />
          <SimpleForm
            path="/api/v1/finance/vendors"
            submitLabel="Add vendor"
            fields={[
              { name: "name", label: "Vendor name", required: true },
              { name: "category", label: "Category", placeholder: "IT services" },
              { name: "contactName", label: "Contact name" },
              { name: "contactEmail", label: "Contact email" },
            ]}
          />
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Directory" />
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-tertiary">No vendors yet.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {rows.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <Link href={`/finance/vendors/${v.id}`} className="font-medium hover:underline">{v.name}</Link>
                  <p className="text-xs text-tertiary">{v.category ?? "—"} · owner {v.ownerName ?? "—"}</p>
                </div>
                <Badge tone={TONES[v.status] ?? "neutral"}>{v.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
