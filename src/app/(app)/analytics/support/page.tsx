export const dynamic = "force-dynamic";

import { SupportAnalyticsClient, type SupportAnalyticsData } from "@/components/support-analytics-client";
import { Card, EmptyState } from "@/components/ui";
import { Content, PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { can } from "@/modules/iam/engine";
import { supportAnalytics } from "@/modules/analytics/reports";

export const metadata = { title: "Support analytics" };

export default async function SupportAnalyticsPage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "analytics") || !can(ctx.access, "tickets.sla_view")) {
    return (
      <Content width="standard">
        <Card>
          <EmptyState
            title="Support analytics unavailable"
            hint="SLA analytics access (tickets.sla_view) is required to view support reports."
          />
        </Card>
      </Content>
    );
  }

  const data = await supportAnalytics(ctx);
  if (!data) {
    return (
      <Content width="standard">
        <Card>
          <EmptyState title="Support analytics unavailable" />
        </Card>
      </Content>
    );
  }

  const clientData: SupportAnalyticsData = {
    ...data,
    sla: {
      ...data.sla,
      compliancePct: Number(data.sla.compliancePct),
      firstResponseAvgHours: Number(data.sla.firstResponseAvgHours),
      firstResponseCompliancePct: Number(data.sla.firstResponseCompliancePct),
      byPriority: data.sla.byPriority.map((p) => ({ ...p, pct: Number(p.pct) })),
    },
    csat: {
      ...data.csat,
      avg: Number(data.csat.avg),
      responseRatePct: Number(data.csat.responseRatePct),
    },
  };

  return (
    <Content width="wide">
      <PageHeader
        title="Support analytics"
        subtitle="Ticket volume, SLA compliance, first-response times, CSAT and team workload."
      />
      <SupportAnalyticsClient data={clientData} />
    </Content>
  );
}