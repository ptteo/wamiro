export const dynamic = "force-dynamic";

import Link from "next/link";

import { AdminSection } from "@/components/admin-ui";
import { Badge, Card, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { listRolesWithCounts } from "@/modules/admin/service";

export const metadata = { title: "Roles" };

export default async function RolesPage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "admin") || !can(ctx.access, "roles.manage")) {
    return (
      <>
        <PageHeader title="Roles" />
        <Card>
          <EmptyState title="Roles" hint="You don't have role management permissions." />
        </Card>
      </>
    );
  }

  const roles = await listRolesWithCounts(ctx);

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Roles"
        subtitle="Permission bundles. Open a role to see grants and holders."
      />
      <p className="text-[11px] text-tertiary">
        System roles are seeded per tenant. Assign them from Access control.
      </p>

      <AdminSection title="Role list" subtitle={`${roles.length} defined`}>
        {roles.length === 0 ? (
          <p className="py-6 text-center text-sm text-tertiary">No roles defined.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {roles.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="min-w-0">
                  <Link href={`/admin/roles/${r.id}`} className="font-medium text-primary hover:underline">
                    {r.name}
                  </Link>
                  {r.description ? <p className="text-xs text-tertiary sm:truncate">{r.description}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">
                    {r.members} member{r.members === 1 ? "" : "s"}
                  </Badge>
                  {r.isSystem ? <Badge tone="neutral">System</Badge> : <Badge tone="amber">Custom</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>
    </div>
  );
}
