export const dynamic = "force-dynamic";

import { PlatformControlsCard } from "@/components/platform-controls-card";
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
    <div className="space-y-4" data-fill-workspace>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-primary">Controls</h1>
        <p className="mt-1 text-sm text-secondary">
          Per-tenant entitlements (module kill-switches, caps, limits), platform-team roles, and operator preferences.
          Entitlement changes take effect within 60 seconds fleet-wide.
        </p>
      </header>
      <PlatformControlsCard
        tenants={tenants.map((t) => ({ id: t.id, name: t.name }))}
        operators={operators}
        myLevel={myLevel}
        myUserId={ctx.user.id}
      />
    </div>
  );
}
