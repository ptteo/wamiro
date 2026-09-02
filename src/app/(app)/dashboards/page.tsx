export const dynamic = "force-dynamic";

import { DashboardsListClient } from "@/components/dashboards-list";
import { Card, EmptyState } from "@/components/ui";
import { Content, PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { widestScope } from "@/modules/iam/engine";
import { overview } from "@/modules/analytics/service";
import { pinnedMetrics } from "@/modules/analytics/dashboards";

export const metadata = { title: "Dashboards" };

const ALLOWED_SCOPES = new Set(["TEAM", "DEPARTMENT", "COMPANY", "GLOBAL"]);

export default async function DashboardsPage() {
  const ctx = await requireAuthPage();
  const scope = widestScope(ctx.access, "analytics.view");
  if (
    !isModuleEnabled(ctx.org.modules, "analytics") ||
    !scope ||
    !ALLOWED_SCOPES.has(scope)
  ) {
    return (
      <Content width="standard">
        <Card>
          <EmptyState
            title="Dashboards unavailable"
            hint="You need team or company analytics access to use dashboards."
          />
        </Card>
      </Content>
    );
  }

  const data = await overview(ctx);
  if (!data) {
    return (
      <Content width="standard">
        <Card>
          <EmptyState title="No analytics in your scope" />
        </Card>
      </Content>
    );
  }

  const pinned = await pinnedMetrics(ctx);
  const available = {
    headcount: data.headcount,
    on_leave_today: data.onLeaveToday,
    pending_approvals: data.pendingApprovals,
    approval_latency_hours: Number(data.approvalLatencyHours),
  };

  return (
    <Content width="wide">
      <PageHeader
        title="Dashboards"
        subtitle="Your personal metric board. Pin what you check every day; unpin what you don't."
      />
      <DashboardsListClient
        available={available}
        pinned={pinned.pinned.map((p) => ({ metricId: p.metricId, value: p.value }))}
        scopeLabel={data.scopeLabel}
        scope={data.scope}
      />
    </Content>
  );
}
