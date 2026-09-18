export const dynamic = "force-dynamic";

import { PlatformControlsCard } from "@/components/platform-controls-card";
import { PlatformShell, PlatformPageHeader } from "@/components/platform-sub-nav";
import { Card, EmptyState } from "@/components/ui";
import { requireAuthPage, can } from "@/lib/page-auth";
import { listTenants } from "@/modules/platform/service";
import { listOperators, platformLevelOf } from "@/modules/platform/entitlements";

export const metadata = { title: "Controls" };

export default async function PlatformControlsPage() {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "platform.admin")) {
    return (
      <Card>
        <EmptyState title="Platform console" hint="Only the Platform Super Admin can access this area." />
      </Card>
    );
  }

  const [tenants, operators, myLevel] = await Promise.all([
    listTenants(ctx),
    listOperators(ctx),
    platformLevelOf(ctx),
  ]);

  return (
    <PlatformShell current="/platform/controls">
      <div className="mx-auto max-w-6xl space-y-4">
        <PlatformPageHeader
          title="Controls"
          lede="Per-tenant entitlements (module kill-switches, caps, limits), platform-team roles, and operator preferences. Entitlement changes take effect within 60 seconds fleet-wide."
        />
        <PlatformControlsCard
          tenants={tenants.map((t) => ({ id: t.id, name: t.name }))}
          operators={operators}
          myLevel={myLevel}
          myUserId={ctx.user.id}
        />
      </div>
    </PlatformShell>
  );
}
