export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionButton, SimpleForm } from "@/components/finance-people-actions";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { ApiError } from "@/lib/errors";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { getVendor } from "@/modules/finance/service";

export const metadata = { title: "Vendor detail" };

export default async function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "finance") || !can(ctx.access, "finance.view_self")) {
    return <Card><EmptyState title="Vendors" hint="You don't have finance access." /></Card>;
  }
  const { id } = await params;
  let data;
  try {
    data = await getVendor(ctx, id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const v = data.vendor;
  const manage = can(ctx.access, "finance.manage_vendors");
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/finance/vendors" className="text-xs text-tertiary hover:underline">← Back to vendors</Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-primary">{v.name}</h1>
          {v.category ? <p className="mt-0.5 text-sm text-secondary">{v.category}</p> : null}
        </div>
        <Badge tone={v.status === "active" ? "green" : v.status === "blocked" ? "red" : v.status === "pending" ? "amber" : "neutral"}>
          {v.status}
        </Badge>
      </header>

      <Card>
        <CardHeader title="Contact & status" />
        <dl className="divide-y divide-border-subtle text-sm">
          {[["Contact", v.contactName ?? "—"], ["Email", v.contactEmail ?? "—"], ["Notes", v.notes ?? "—"]].map(([k, val]) => (
            <div key={k} className="flex items-center justify-between gap-3 px-5 py-2.5">
              <dt className="text-tertiary">{k}</dt><dd className="font-medium">{val}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {manage ? (
        <>
          <Card>
            <CardHeader title="Set status" />
            <div className="flex flex-wrap gap-2 px-5 py-4">
              {["active", "inactive", "blocked"].map((s) => (
                <ActionButton key={s} label={s[0]!.toUpperCase() + s.slice(1)} path="/api/v1/finance/vendors"
                  body={{ id: v.id, name: v.name, category: v.category ?? undefined, contactName: v.contactName ?? undefined,
                    contactEmail: v.contactEmail ?? undefined, notes: v.notes ?? undefined, status: s }}
                  className="rounded-md border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-hover" />
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Add document record" subtitle="Track licenses, insurance and certificates with expiry." />
            <SimpleForm
              path={`/api/v1/finance/vendors/${v.id}`}
              submitLabel="Add document"
              fields={[
                { name: "fileName", label: "Document name", required: true },
                { name: "kind", label: "Kind", type: "select", options: [
                  { value: "license", label: "License" }, { value: "insurance", label: "Insurance" },
                  { value: "cert", label: "Certificate" }, { value: "other", label: "Other" },
                ]},
                { name: "expiresAt", label: "Expires", type: "date" },
              ]}
            />
          </Card>
        </>
      ) : null}

      <Card>
        <CardHeader title="Documents" />
        {data.documents.length === 0 ? (
          <p className="px-5 py-4 text-sm text-tertiary">No documents recorded.</p>
        ) : (
          <ul className="divide-y divide-border-subtle text-sm">
            {data.documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between px-5 py-2.5">
                <span>{d.fileName} <span className="text-xs text-tertiary">({d.kind})</span></span>
                {d.expiresAt ? (
                  <Badge tone={new Date(d.expiresAt) < new Date() ? "red" : "neutral"}>expires {new Date(d.expiresAt).toLocaleDateString()}</Badge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Purchase activity" />
        {data.purchases.length === 0 ? (
          <p className="px-5 py-4 text-sm text-tertiary">No purchase requests for this vendor.</p>
        ) : (
          <ul className="divide-y divide-border-subtle text-sm">
            {data.purchases.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-5 py-2.5">
                <Link href="/finance/purchases" className="hover:underline">{p.title}</Link>
                <Badge tone="neutral">{p.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
