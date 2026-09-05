export const dynamic = "force-dynamic";

import { HrAnalyticsClient, type HrAnalyticsData } from "@/components/hr-analytics-client";
import { Card, EmptyState } from "@/components/ui";
import { Content, PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { can } from "@/modules/iam/engine";
import { hrAnalytics } from "@/modules/analytics/reports";

export const metadata = { title: "HR analytics" };

export default async function HrAnalyticsPage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "analytics") || !can(ctx.access, "analytics.view_company")) {
    return (
      <Content width="standard">
        <Card>
          <EmptyState
            title="HR analytics unavailable"
            hint="Company-wide analytics access is required to view HR reports."
          />
        </Card>
      </Content>
    );
  }

  const data = await hrAnalytics(ctx);
  if (!data) {
    return (
      <Content width="standard">
        <Card>
          <EmptyState title="HR analytics unavailable" />
        </Card>
      </Content>
    );
  }

  const clientData: HrAnalyticsData = {
    ...data,
    attrition: {
      ...data.attrition,
      rate12mPct: Number(data.attrition.rate12mPct),
    },
    payroll: {
      totalGross: Number(data.payroll.totalGross),
      totalNet: Number(data.payroll.totalNet),
      byDepartment: data.payroll.byDepartment.map((d) => ({ ...d, gross: Number(d.gross), net: Number(d.net) })),
    },
    overtime: {
      totalHours30d: Number(data.overtime.totalHours30d),
      top: data.overtime.top.map((t) => ({ ...t, hours: Number(t.hours) })),
    },
  };

  return (
    <Content width="wide">
      <PageHeader
        title="HR analytics"
        subtitle="Headcount, attrition, leave, payroll cost, recognition and hiring — company-wide."
      />
      <HrAnalyticsClient data={clientData} />
    </Content>
  );
}