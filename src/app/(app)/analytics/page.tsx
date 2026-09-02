export const dynamic = "force-dynamic";

import { AnalyticsOverviewClient, type AnalyticsOverview } from "@/components/analytics-overview";
import { Card, EmptyState } from "@/components/ui";
import { Content, PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { overview } from "@/modules/analytics/service";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "analytics")) {
    return (
      <Content width="standard">
        <Card>
          <EmptyState
            title="Analytics unavailable"
            hint="This module is disabled for your organization."
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
          <EmptyState
            title="No analytics in your scope"
            hint="You need team or company analytics access to see metrics here."
          />
        </Card>
      </Content>
    );
  }

  const clientData: AnalyticsOverview = {
    ...data,
    expensePendingCents: Number(data.expensePendingCents),
    budgetUtilizationPct: Number(data.budgetUtilizationPct),
    approvalLatencyHours: Number(data.approvalLatencyHours),
  };

  return (
    <Content width="wide">
      <PageHeader
        title="Analytics"
        subtitle="A snapshot of the metrics that matter — headcount, activity, finance, and risk."
      />
      <AnalyticsOverviewClient data={clientData} />
    </Content>
  );
}
