export const dynamic = "force-dynamic";

import Link from "next/link";

import { AdminSection } from "@/components/admin-ui";
import { Badge, Card, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { getRoleDetail } from "@/modules/admin/service";
import { ApiError } from "@/lib/errors";
import { notFound } from "next/navigation";

export const metadata = { title: "Role detail" };

export default async function RoleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "admin") || !can(ctx.access, "roles.manage")) {
    return (
      <>
        <PageHeader title="Role" />
        <Card>
          <EmptyState title="Role detail" hint="You don't have role management permissions." />
        </Card>
      </>
    );
  }
  const { id } = await params;
  let detail;
  try {
    detail = await getRoleDetail(ctx, id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const byFamily = new Map<string, { permission: string; scope: string }[]>();
  for (const p of detail.permissions) {
    const family = p.permission.split(".")[0] ?? p.permission;
    const list = byFamily.get(family) ?? [];
    list.push(p);
    byFamily.set(family, list);
  }
  const families = [...byFamily.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title={detail.role.name}
        subtitle={detail.role.description ?? undefined}
        breadcrumb={[
          { label: "Admin", href: "/admin" },
          { label: "Roles", href: "/admin/roles" },
        ]}
      >
        <Badge tone="brand">{detail.role.key}</Badge>
        {detail.role.isSystem ? <Badge tone="neutral">System</Badge> : <Badge tone="amber">Custom</Badge>}
      </PageHeader>

      <AdminSection
        title="Permissions"
        subtitle={`${detail.permissions.length} grant${detail.permissions.length === 1 ? "" : "s"}, grouped by family`}
      >
        {families.length === 0 ? (
          <p className="py-4 text-sm text-tertiary">No permissions in this role.</p>
        ) : (
          <div className="divide-y divide-border-subtle">
            {families.map(([family, perms]) => (
              <div key={family} className="py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">{family}</p>
                <ul className="mt-1 space-y-1">
                  {perms.map((p) => (
                    <li key={p.permission} className="flex min-w-0 items-start justify-between gap-2 text-sm">
                      <span className="min-w-0 break-all font-mono text-xs">{p.permission}</span>
                      <Badge tone="neutral">{p.scope}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </AdminSection>

      <AdminSection title="Holders" subtitle={`${detail.holders.length} shown`}>
        {detail.holders.length === 0 ? (
          <p className="py-4 text-sm text-tertiary">No users hold this role.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {detail.holders.map((u) => (
              <li key={u.id} className="flex flex-col gap-2 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <Link href={`/admin/users/${u.id}`} className="min-w-0 hover:underline">
                  <p className="font-medium text-primary">{u.name}</p>
                  <p className="truncate text-xs text-tertiary">{u.email}</p>
                </Link>
                <Badge tone={u.status === "active" ? "green" : u.status === "suspended" ? "amber" : "neutral"}>
                  {u.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>
    </div>
  );
}
