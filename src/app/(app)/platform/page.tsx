export const dynamic = "force-dynamic";

import { PlatformClient } from "@/components/platform-client";
import { PlatformOpsClient } from "@/components/platform-ops-client";
import { Card, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { listTenants, platformStats } from "@/modules/platform/service";
import {
  listImpersonationLedger,
  listAvailableGrants,
  platformSupportQueue,
  tenantRiskBoard,
} from "@/modules/platform/console";

export const metadata = { title: "Platform" };

export default async function PlatformPage() {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "platform.admin")) {
    return (
      <Card>
        <EmptyState title="Platform console" hint="Only the Platform Super Admin can access this area." />
      </Card>
    );
  }

  const [tenants, stats, riskTenants, grants, queue, ledger] = await Promise.all([
    listTenants(ctx),
    platformStats(ctx),
    tenantRiskBoard(ctx),
    listAvailableGrants(ctx),
    platformSupportQueue(ctx),
    listImpersonationLedger(ctx),
  ]);

  return (
    <div className="space-y-6" data-fill-workspace>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-primary">Platform Console</h1>
        <p className="mt-1 text-sm text-secondary">
          Tenant registry, subscription lifecycle and fleet health. Suspending a tenant blocks all of its users at
          sign-in without touching their data.
        </p>
      </header>

      <PlatformOpsClient
        riskTenants={riskTenants.map((t) => ({
          organizationId: t.organizationId,
          name: t.name,
          slug: t.slug,
          plan: t.plan,
          billingStatus: t.billingStatus,
          userCount: t.userCount,
          active7d: t.active7d,
          lastActiveAt: t.lastActiveAt ? t.lastActiveAt.toISOString() : null,
          dormantHours: t.dormantHours,
          risk: t.risk,
          setupDone: t.setupDone,
          trialDaysLeft: t.trialDaysLeft,
        }))}
        grants={grants.map((g) => ({
          grantId: g.grantId,
          organizationId: g.organizationId,
          orgName: g.orgName,
          reason: g.reason,
          operatorLabel: g.operatorLabel,
          expiresAt: g.expiresAt.toISOString(),
        }))}
        queue={queue.map((t) => ({
          id: t.id,
          orgName: t.orgName,
          title: t.title,
          status: t.status,
          priority: t.priority,
          slaState: t.slaState,
          escalatedAt: t.escalatedAt ? t.escalatedAt.toISOString() : null,
          createdAt: t.createdAt.toISOString(),
          requesterName: t.requesterName,
        }))}
        ledger={ledger.map((l) => ({
          id: l.id,
          orgName: l.orgName,
          operatorName: l.operatorName,
          reason: l.reason,
          startedAt: l.startedAt.toISOString(),
          endedAt: l.endedAt ? l.endedAt.toISOString() : null,
        }))}
      />

      <PlatformClient
        tenants={tenants.map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          status: t.status,
          plan: t.plan,
          billingStatus: t.billingStatus,
          trialEndsAt: t.trialEndsAt ? t.trialEndsAt.toISOString() : null,
          seatLimit: t.seatLimit,
          seatCount: t.seatCount,
          userCount: t.userCount,
          lastActiveAt: t.lastActiveAt ? t.lastActiveAt.toISOString() : null,
          createdAt: t.createdAt.toISOString(),
        }))}
        stats={{
          totalTenants: stats.totalTenants,
          activeSeats: stats.activeSeats,
          byPlan: stats.byPlan,
          trialsEndingSoon: stats.trialsEndingSoon,
          usersActive7d: stats.usersActive7d,
          companiesActive7d: stats.companiesActive7d,
        }}
        selfOrgId={ctx.user.organizationId}
      />
    </div>
  );
}
