export const dynamic = "force-dynamic";

import { PlatformClient } from "@/components/platform-client";
import { PlatformOpsClient } from "@/components/platform-ops-client";
import { PlatformJobsCard } from "@/components/platform-jobs-card";
import { PlatformUsageCard } from "@/components/platform-usage-card";
import { PlatformBillingCard } from "@/components/platform-billing-card";
import { PlatformHealthCard } from "@/components/platform-health-card";
import { PlatformTenantSearch } from "@/components/platform-tenant-360";
import {
  PlatformShell,
  PlatformPageHeader,
} from "@/components/platform-sub-nav";
import { Badge, Card, EmptyState, Stat } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { listTenants, platformStats } from "@/modules/platform/service";
import { fleetStorage, formatBytes } from "@/modules/storage/service";
import {
  listImpersonationLedger,
  listAvailableGrants,
  platformSupportQueue,
  tenantRiskBoard,
} from "@/modules/platform/console";
import { listPending } from "@/modules/platform/destructive-ops";
import { listJobLedger } from "@/modules/platform/jobs";
import { listCredits, listInvoices } from "@/modules/platform/billing-ledger";
import { healthBoard } from "@/modules/platform/health";
import { alertInbox, listAlertRules } from "@/modules/platform/alerts";
import { moduleHeatmap, usageSummary } from "@/modules/platform/usage";

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

  const [tenants, stats, riskTenants, grants, queue, ledger, storage, jobs, pendingOps, usage, heatmap, ledgerInvoices, ledgerCredits, health, openAlerts, alertRules] = await Promise.all([
    listTenants(ctx),
    platformStats(ctx),
    tenantRiskBoard(ctx),
    listAvailableGrants(ctx),
    platformSupportQueue(ctx),
    listImpersonationLedger(ctx),
    fleetStorage(ctx),
    listJobLedger(ctx),
    listPending(ctx),
    // Phase A — usage metering (fleet Usage tab); empty until the usage_rollup
    // job has run, so a fresh deploy renders the empty-state, never an error.
    usageSummary(ctx).catch(() => []),
    moduleHeatmap(ctx, 30).catch(() => []),
    // Phase B-fix — unified billing ledger + credits (empty states on a fresh
    // deploy: the ledger only fills from the Paddle webhook or manual ops).
    listInvoices(ctx).catch(() => []),
    listCredits(ctx).catch(() => []),
    // Phase D — health board + alert inbox (empty until health_rollup runs).
    healthBoard(ctx).catch(() => []),
    alertInbox(ctx, "open").catch(() => []),
    listAlertRules(ctx).catch(() => []),
  ]);

  const failingJobs = jobs.filter((j) => j.everRan && (!j.ok || j.stale)).length;
  const redTenants = health.filter((h) => h.grade === "red").length;
  const openInvoices = ledgerInvoices.filter((i) => i.status === "open").length;

  return (
    <PlatformShell current="/platform">
      <div className="mx-auto max-w-6xl space-y-6">
        <PlatformPageHeader
          title="Platform Console"
          lede="Tenant registry, subscription lifecycle and fleet health. Suspending a tenant blocks all of its users at sign-in without touching their data."
        />

        {/* Fleet KPIs — the one-glance health line, lifted above the cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Stat
            label="Active tenants"
            value={stats.totalTenants}
            hint={stats.byPlan.map((p) => `${p.plan} ${p.count}`).join(" · ") || "no plans yet"}
          />
          <Stat label="Active seats" value={stats.activeSeats} hint="Across all tenants" />
          <Stat
            label="Active · 7d"
            value={`${stats.companiesActive7d}/${stats.totalTenants} orgs`}
            hint={`${stats.usersActive7d} users signed in`}
          />
          <Stat
            label="Trials ending ≤7d"
            value={stats.trialsEndingSoon}
            tone={stats.trialsEndingSoon > 0 ? "amber" : "neutral"}
            hint="Chase these before they lapse"
          />
          <Stat
            label="Fleet health"
            value={redTenants > 0 ? `${redTenants} at risk` : "All good"}
            tone={redTenants > 0 ? "red" : "green"}
            hint={`${openAlerts.length} open alert${openAlerts.length === 1 ? "" : "s"}`}
          />
          <Stat
            label="Ops watchlist"
            value={`${openInvoices} due · ${failingJobs} jobs`}
            tone={openInvoices + failingJobs > 0 ? "amber" : "neutral"}
            hint="Open invoices · stale/failed jobs"
          />
        </div>

        {/* Global tenant search (⌘K-style) from anywhere in the console */}
        <PlatformTenantSearch />

        {/* Support ops: risk board · impersonation · broadcast · queue */}
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
          pendingOps={pendingOps.map((o) => ({
            id: o.id,
            kind: o.kind,
            orgName: o.orgName,
            reason: o.reason,
            requestedBy: o.requestedBy,
            requesterName: String(o.requesterName ?? ""),
            createdAt: o.createdAt.toISOString(),
          }))}
          selfUserId={ctx.user.id}
        />

        <PlatformTenantRegistrySection>
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
            selfOrgId={ctx.user.organizationId}
          />
        </PlatformTenantRegistrySection>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-tertiary">Fleet operations</h2>
          <PlatformJobsCard jobs={jobs} />

          <PlatformUsageCard
            rows={usage.map((u) => ({
              organizationId: u.organizationId,
              name: u.name,
              slug: u.slug,
              plan: u.plan,
              seatsActive: u.seatsActive,
              seatLimit: u.seatLimit,
              seatUtilizationPct: u.seatUtilizationPct,
              activeActors7d: u.activeActors7d,
              actions30d: u.actions30d,
              logins30d: u.logins30d,
              mutations30d: u.mutations30d,
              storageBytes: u.storageBytes,
              documentsStored: u.documentsStored,
              lastActiveDay: u.lastActiveDay,
            }))}
            heatmap={heatmap}
          />

          <PlatformBillingCard
            invoices={ledgerInvoices}
            credits={ledgerCredits.map((c) => ({
              id: c.id,
              orgId: c.orgId,
              orgName: c.orgName,
              amountCents: c.amountCents,
              reason: c.reason,
              expiresAt: c.expiresAt,
              createdAt: c.createdAt,
            }))}
            tenants={tenants.map((t) => ({ id: t.id, name: t.name }))}
          />

          <PlatformHealthCard
            board={health.map((h) => ({
              orgId: h.orgId,
              orgName: h.orgName,
              orgSlug: h.orgSlug,
              plan: h.plan,
              score: h.score,
              grade: h.grade,
              factors: h.factors,
              trend: h.trend,
              daysSinceActive: h.daysSinceActive,
            }))}
            alerts={openAlerts.map((a) => ({
              id: a.id,
              ruleName: a.ruleName,
              kind: a.kind,
              orgId: a.orgId,
              orgName: a.orgName,
              state: a.state,
              payload: a.payload,
              firedAt: a.firedAt,
            }))}
            rules={alertRules}
          />

          <Card>
            <div className="flex flex-col gap-4 border-b border-border-subtle p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-tertiary">Fleet storage</p>
                <p className="mt-1 text-xl font-semibold text-primary">
                  {formatBytes(storage.totalBytes)}
                  <span className="ml-2 text-sm font-normal text-tertiary">
                    across {storage.totalObjects} object{storage.totalObjects === 1 ? "" : "s"} in {storage.tenantCount} tenant{storage.tenantCount === 1 ? "" : "s"}
                  </span>
                </p>
              </div>
              <Badge tone={storage.storageBackend === "s3" ? "green" : "neutral"}>
                {storage.storageBackend === "s3" ? "S3 / R2" : "Local disk"}
              </Badge>
            </div>
            {storage.topTenants.length > 0 ? (
              <ul className="divide-y divide-border-subtle">
                {storage.topTenants.map((t) => (
                  <li key={t.organizationId} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                    <span className="min-w-0 truncate font-medium text-primary">{t.name}</span>
                    <span className="shrink-0 text-secondary">
                      {formatBytes(t.totalBytes)}
                      <span className="ml-1.5 text-xs text-tertiary">· {t.totalObjects} obj</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-5">
                <EmptyState title="No stored files yet" hint="Uploaded documents and attachments across all tenants appear here." />
              </div>
            )}
          </Card>
        </section>
      </div>
    </PlatformShell>
  );
}

function PlatformTenantRegistrySection({ children }: { children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-tertiary">Tenant registry</h2>
      {children}
    </section>
  );
}
