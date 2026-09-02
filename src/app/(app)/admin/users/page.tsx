export const dynamic = "force-dynamic";

import { AdminUsersClient } from "@/components/admin-users";
import { Card, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import {
  listOverrides,
  listTenantRoles,
  listUsersWithRoles,
} from "@/modules/admin/service";
import { ALL_PERMISSIONS, isModuleEnabled } from "@/modules/iam/catalog";
import { can } from "@/modules/iam/engine";

export const metadata = { title: "Access control" };

export default async function AdminUsersPage() {
  const ctx = await requireAuthPage();
  const canUsers = can(ctx.access, "users.manage");
  const canRoles = can(ctx.access, "roles.manage");

  if (!isModuleEnabled(ctx.org.modules, "admin") || (!canUsers && !canRoles)) {
    return (
      <>
        <PageHeader title="Access control" />
        <Card>
          <EmptyState title="Access control" hint="You don't have permission to manage users or roles." />
        </Card>
      </>
    );
  }

  const [users, roles, overrides] = await Promise.all([
    canUsers ? listUsersWithRoles(ctx) : Promise.resolve([]),
    canRoles ? listTenantRoles(ctx) : Promise.resolve([]),
    canRoles ? listOverrides(ctx) : Promise.resolve([]),
  ]);

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Access control"
        subtitle={`Users, role assignment and temporary permissions for ${ctx.org.name}.`}
      />
      <p className="text-[11px] text-tertiary">
        Invites return a one-time password once. Overrides are audited and can expire.
      </p>
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
