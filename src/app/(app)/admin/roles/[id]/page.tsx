export const dynamic = "force-dynamic";

import Link from "next/link";

import { Badge, Card, CardHeader, EmptyState, btn } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
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
  if (!can(ctx.access, "roles.manage")) {
    return (
      <Card>
        <EmptyState title="Role detail" hint="You don't have role management permissions." />
      </Card>
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

  // Group permissions by their "family" prefix (e.g. "leave" from "leave.apply").
  const byFamily = new Map<string, { permission: string; scope: string }[]>();
  for (const p of detail.permissions) {
    const family = p.permission.split(".")[0] ?? p.permission;
    const list = byFamily.get(family) ?? [];
    list.push(p);
    byFamily.set(family, list);
  }
  const families = [...byFamily.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin/roles" className="text-xs text-tertiary hover:underline">
          ← Back to roles
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-primary">{detail.role.name}</h1>
          <Badge tone="brand">{detail.role.key}</Badge>
          {detail.role.isSystem ? <Badge tone="neutral">System</Badge> : <Badge tone="amber">Custom</Badge>}
        </div>
        {detail.role.description ? (
          <p className="mt-1 text-sm text-secondary">{detail.role.description}</p>
        ) : null}
      </header>

      <Card>
        <CardHeader
          title="Permissions"
          subtitle={`${detail.permissions.length} grant${detail.permissions.length === 1 ? "" : "s"}, grouped by family.`}
        />
        {families.length === 0 ? (
          <p className="px-5 py-4 text-sm text-tertiary">No permissions in this role.</p>
        ) : (
          <div className="divide-y divide-border-subtle">
            {families.map(([family, perms]) => (
              <div key={family} className="px-5 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">{family}</p>
                <ul className="mt-1 space-y-0.5">
                  {perms.map((p) => (
                    <li key={p.permission} className="flex items-center justify-between text-sm">
                      <span className="font-mono text-xs">{p.permission}</span>
                      <Badge tone="neutral">{p.scope}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Holders" subtitle={`Users with this role. ${detail.holders.length} max shown.`} />
        {detail.holders.length === 0 ? (
          <p className="px-5 py-4 text-sm text-tertiary">No users hold this role.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {detail.holders.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <Link href={`/admin/users/${u.id}`} className="min-w-0 hover:underline">
                  <p className="font-medium">{u.name}</p>
                  <p className="truncate text-xs text-tertiary">{u.email}</p>
                </Link>
                <Badge tone={u.status === "active" ? "green" : u.status === "suspended" ? "amber" : "neutral"}>
                  {u.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
