import { AdminNav } from "@/components/admin-ui";
import { PageHeader } from "@/components/page-header";
import { Badge, Card, EmptyState } from "@/components/ui";
import { adminTabsFor } from "@/lib/admin-nav";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { formatBytes, orgStorageUsage } from "@/modules/storage/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Storage" };

export default async function AdminStoragePage() {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "users.manage") && !can(ctx.access, "settings.manage")) {
    return (
      <Card>
        <EmptyState title="Storage" hint="Only administrators can view storage usage." />
      </Card>
    );
  }

  const usage = await orgStorageUsage(ctx);
  const maxCategory = Math.max(1, ...usage.byCategory.map((c) => c.sizeBytes));

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Storage"
        subtitle="How much space this organization uses in object storage, by category."
      />

      <AdminNav
        items={adminTabsFor(
          (p) => can(ctx.access, p),
          ctx.org.modules
        )}
      />

      {usage.truncated ? (
        <p className="rounded-lg border border-warning/30 bg-warning-subtle px-4 py-3 text-sm text-warning">
          This organization has more than {usage.totalObjects.toLocaleString()} stored objects — the totals below
          count the first {usage.totalObjects.toLocaleString()} only and are under-counted.
        </p>
      ) : null}

      <section className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
        <div className="flex flex-col gap-4 border-b border-border-subtle p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-tertiary">Total usage</p>
            <p className="mt-1 text-2xl font-semibold text-primary">
              {formatBytes(usage.totalBytes)}
              <span className="ml-2 text-sm font-normal text-tertiary">
                across {usage.totalObjects} object{usage.totalObjects === 1 ? "" : "s"}
              </span>
            </p>
          </div>
          <Badge tone={usage.storageBackend === "s3" ? "green" : "neutral"}>
            {usage.storageBackend === "s3" ? "S3 / R2 object storage" : "Local disk"}
          </Badge>
        </div>

        {usage.byCategory.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nothing stored yet" hint="Uploaded documents, HR files and ticket attachments will appear here." />
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {usage.byCategory.map((c) => (
              <li key={c.category} className="px-5 py-4">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-sm font-medium capitalize text-primary">{c.category.replace(/-/g, " ")}</p>
                  <p className="text-sm text-secondary">
                    {formatBytes(c.sizeBytes)}
                    <span className="ml-1.5 text-xs text-tertiary">· {c.objectCount} object{c.objectCount === 1 ? "" : "s"}</span>
                  </p>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border-subtle" aria-hidden>
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${Math.max(2, (c.sizeBytes / maxCategory) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}