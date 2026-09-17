export const dynamic = "force-dynamic";

import { AdminNav } from "@/components/admin-ui";
import { AdminUsersClient } from "@/components/admin-users";
import { Card, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { adminTabsFor } from "@/lib/admin-nav";
import { requireAuthPage } from "@/lib/page-auth";
import {
  listOverrides,
  listTenantRoles,
  listUsersBounded,
} from "@/modules/admin/service";
import { mailerConfigured } from "@/lib/mailer";
import { ALL_PERMISSIONS, isModuleEnabled } from "@/modules/iam/catalog";
import { can } from "@/modules/iam/engine";

export const metadata = { title: "Access control" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
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

  const tabs = adminTabsFor(
    (p) => can(ctx.access, p),
    ctx.org.modules
  );

  // G-20 — bounded, server-side search; the client keeps instant filtering on
  // the hydrated page and the banner below tells admins when it's truncated.
  const listing = canUsers ? await listUsersBounded(ctx, { q }) : { rows: [], total: 0 };
  const users = listing.rows;

  const [roles, overrides] = await Promise.all([
    canRoles ? listTenantRoles(ctx) : Promise.resolve([]),
    canRoles ? listOverrides(ctx) : Promise.resolve([]),
  ]);

  // G-16 — invite emails silently no-op without SMTP; admins must know why
  // new users are not receiving their links.
  const smtpReady = mailerConfigured();

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Access control"
        subtitle={`Users, role assignment and temporary permissions for ${ctx.org.name}.`}
      />

      <AdminNav items={tabs} />

      {!smtpReady && users.some((u) => u.status === "invited") ? (
        <p className="rounded-lg border border-warning/30 bg-warning-subtle px-4 py-3 text-sm text-warning">
          <strong>Email is not configured.</strong> Pending invites cannot be emailed —
          share the invite link manually (shown when you invite) or set <code>SMTP_URL</code> in the environment.
        </p>
      ) : null}

      <AdminUsersClient
        totalUsers={listing.total}
        initialQuery={q ?? ""}
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
