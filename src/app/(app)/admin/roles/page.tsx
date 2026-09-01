export const dynamic = "force-dynamic";

import Link from "next/link";

import { Badge, Card, CardHeader, EmptyState, btn } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { listRolesWithCounts } from "@/modules/admin/service";

export const metadata = { title: "Roles" };

export default async function RolesPage() {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "roles.manage")) {
    return (
      <Card>
        <EmptyState title="Roles" hint="You don't have role management permissions." />
      </Card>
    );
  }

  const roles = await listRolesWithCounts(ctx);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-primary">Roles</h1>
        <p className="mt-1 text-sm text-secondary">
          Permission bundles. Click a role to see its permission set and holders.
        </p>
      </header>

      <Card>
        <CardHeader title="Role list" />
        {roles.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-tertiary">No roles defined.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {roles.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <Link href={`/admin/roles/${r.id}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                  {r.description ? <p className="truncate text-xs text-tertiary">{r.description}</p> : null}
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone="brand">{r.members} member{r.members === 1 ? "" : "s"}</Badge>
                  {r.isSystem ? <Badge tone="neutral">System</Badge> : <Badge tone="amber">Custom</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
