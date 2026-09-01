import { DashboardsClient } from "@/components/dashboards-client";
import { Card, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { widestScope } from "@/modules/iam/engine";
import { pinnedMetrics } from "@/modules/analytics/dashboards";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboards" };

export default async function DashboardsPage() {
  const ctx = await requireAuthPage();
  if (
    !isModuleEnabled(ctx.org.modules, "analytics") ||
    !["TEAM", "DEPARTMENT", "COMPANY", "GLOBAL"].includes(
      widestScope(ctx.access, "analytics.view") ?? "",
    )
  ) {
    return (
      <Card>
        <EmptyState title="Dashboards unavailable" hint="You need team or company analytics access." />
      </Card>
    );
  }

  const { pinned, available } = await pinnedMetrics(ctx);
  if (!available) {
    return (
      <Card>
        <EmptyState title="Dashboards unavailable" />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-primary">Dashboards</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Pin the metrics you check daily — values respect your access scope
          ({available.scope === "company" ? "company-wide" : "your team"}).
        </p>
      </header>

      <DashboardsClient
        available={{
          headcount: available.headcount,
          on_leave_today: available.onLeaveToday,
          pending_approvals: available.pendingApprovals,
          approval_latency_hours: available.approvalLatencyHours,
        }}
        pinned={pinned.map((p) => ({ metricId: p.metricId, label: p.label, value: p.value }))}
      />
    </div>
  );
}
