export const dynamic = "force-dynamic";

import { AdminUsersClient } from "@/components/admin-users";
import { Card, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import {
  listOverrides,
  listTenantRoles,
  listUsersWithRoles,
} from "@/modules/admin/service";
import { ALL_PERMISSIONS } from "@/modules/iam/catalog";
import { can } from "@/modules/iam/engine";

export const metadata = { title: "Access control" };

export default async function AdminUsersPage() {
  const ctx = await requireAuthPage();
  const canUsers = can(ctx.access, "users.manage");
  const canRoles = can(ctx.access, "roles.manage");

  if (!canUsers && !canRoles) {
    return (
      <Card>
        <EmptyState title="Access control" hint="You don't have permission to manage users or roles." />
      </Card>
    );
  }

  const [users, roles, overrides] = await Promise.all([
    canUsers ? listUsersWithRoles(ctx) : Promise.resolve([]),
    canRoles ? listTenantRoles(ctx) : Promise.resolve([]),
    canRoles ? listOverrides(ctx) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Access control</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Users, role assignment and temporary permissions for {ctx.org.name}.
        </p>
      </header>

      <AdminUsersClient
        users={users.map((u) => ({
          ...u,
          lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        }))}
        roles={roles}
        overrides={overrides.map((o) => ({
          ...o,
          createdAt: o.createdAt.toISOString(),
          expiresAt: o.expiresAt ? o.expiresAt.toISOString() : null,
        }))}
        permissions={ALL_PERMISSIONS}
        canManageUsers={canUsers}
        canManageRoles={canRoles}
      />
    </div>
  );
}
