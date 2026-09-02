export const dynamic = "force-dynamic";

import { AccessReviewsClient } from "@/components/access-reviews-client";
import { Card, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { listOverrides, listUsersWithRoles, listTenantRoles } from "@/modules/admin/service";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";

export const metadata = { title: "Access Reviews" };

export default async function AccessReviewsPage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "admin") || !can(ctx.access, "roles.manage")) {
    return (
      <>
        <PageHeader title="Access reviews" />
        <Card>
          <EmptyState
            title="Access reviews unavailable"
            hint="You don't have permission to review access."
          />
        </Card>
      </>
    );
  }

  const [overrides, usersWithRoles, tenantRoles] = await Promise.all([
    listOverrides(ctx),
    listUsersWithRoles(ctx),
    listTenantRoles(ctx),
  ]);

  const nameById = new Map(tenantRoles.map((r) => [r.id, r.name]));
  const elevatedRoles = usersWithRoles.flatMap((u) =>
    u.roles
      .filter((r) => r.key !== "employee")
      .map((r) => ({
        userId: u.id,
        roleId: r.id,
        roleName: nameById.get(r.id) ?? r.name,
        userName: u.name,
      })),
  );

  const liveOverrides = overrides.filter((o) => !o.expiresAt || o.expiresAt > new Date());

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Access reviews"
        subtitle="Confirm that grants and elevated roles are still justified."
      />
      <p className="text-[11px] text-tertiary">
        Keep writes the decision to the audit log. Revoke takes effect immediately.
      </p>
      <AccessReviewsClient
        overrides={liveOverrides.map((o) => ({
          id: o.id,
          userName: o.userName,
          permission: o.permission,
          effect: o.effect,
          scope: String(o.scope),
          reason: o.reason,
          expiresAt: o.expiresAt ? o.expiresAt.toISOString() : null,
        }))}
        elevatedRoles={elevatedRoles}
      />
    </div>
  );
}
