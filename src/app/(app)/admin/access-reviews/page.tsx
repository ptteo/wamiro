export const dynamic = "force-dynamic";

import { AccessReviewsClient } from "@/components/access-reviews-client";
import { Card, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { listOverrides, listUsersWithRoles, listTenantRoles } from "@/modules/admin/service";
import { can } from "@/modules/iam/engine";

export const metadata = { title: "Access Reviews" };

/**
 * Access review (blueprint §58): a live queue of every direct permission
 * grant and elevated role assignment. Decisions are recorded via audit;
 * revocations reuse the existing audited removal paths.
 */
export default async function AccessReviewsPage() {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "roles.manage")) {
    return (
      <Card>
        <EmptyState
          title="Access reviews unavailable"
          hint="You don't have permission to review access."
        />
      </Card>
    );
  }

  const [overrides, usersWithRoles, tenantRoles] = await Promise.all([
    listOverrides(ctx),
    listUsersWithRoles(ctx),
    listTenantRoles(ctx),
  ]);

  const nameById = new Map(tenantRoles.map((r) => [r.id, r.name]));
  // every non-employee role assignment is an elevated grant worth reviewing
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

  const liveOverrides = overrides.filter(
    (o) => !o.expiresAt || o.expiresAt > new Date(),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
          Access Reviews
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Periodically confirm that grants and elevated roles are still justified.
        </p>
      </header>

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
