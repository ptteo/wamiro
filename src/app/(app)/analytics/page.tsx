export const dynamic = "force-dynamic";

import { KpiStrip, BarChart, SectionHeading } from "@/components/analytics-bars";
import { Badge, Card, btn } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { overview } from "@/modules/analytics/service";
import { CsvExportLink } from "@/components/csv-export";

export const metadata = { title: "Analytics" };

function fmtMoney(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}

function delta(curr: number, prev: number): { sign: "up" | "down" | "flat"; pct: number | null; label: string } {
  if (prev === 0) return { sign: "flat", pct: null, label: curr === 0 ? "—" : `+${curr}` };
  const diff = curr - prev;
  const pct = Math.round((diff / prev) * 100);
  if (Math.abs(pct) < 1) return { sign: "flat", pct: 0, label: "no change" };
  return { sign: pct > 0 ? "up" : "down", pct, label: `${pct > 0 ? "+" : ""}${pct}% vs 30d ago` };
}

function fmtMoneyCents(cents: number, byCurrency: { currency: string; cents: number }[]): string {
  if (byCurrency.length === 0) return "—";
  if (byCurrency.length === 1 && byCurrency[0]) return fmtMoney(byCurrency[0].cents, byCurrency[0].currency);
  return `${byCurrency.length} currencies`;
}

export default async function AnalyticsPage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "analytics")) {
    return (
      <Card>
        <p className="px-5 py-4 text-sm text-secondary">
          This module is disabled for your organization.
        </p>
      </Card>
    );
  }

  const data = await overview(ctx);
  if (!data) {
    return (
      <Card>
        <p className="px-5 py-4 text-sm text-secondary">
          You need team or company analytics access.
        </p>
      </Card>
    );
  }

  const dHead = delta(data.headcount, data.headcountPrior30d);
  const dLeave = delta(data.onLeaveToday, data.onLeaveTodayPrior30d);
  const dPend = delta(data.pendingApprovals, data.pendingApprovalsPrior30d);

  // CSV snapshot rows
  const csvRows: (string | number)[][] = [
    ["metric", "value", "comparison_30d"],
    ["scope", data.scopeLabel, ""],
    ["headcount", data.headcount, data.headcountPrior30d],
    ["on_leave_today", data.onLeaveToday, data.onLeaveTodayPrior30d],
    ["pending_approvals", data.pendingApprovals, data.pendingApprovalsPrior30d],
    ["avg_approval_hours", data.approvalLatencyHours, ""],
    ["open_positions", data.openPositions, ""],
    ["hires_30d", data.hires30d, ""],
    ["expense_pending_cents", data.expensePendingCents, ""],
    ["knowledge_articles", data.knowledgeArticles, ""],
    ["overdue_obligations", data.overdueObligations, ""],
    ["budget_utilization_pct", data.budgetUtilizationPct, ""],
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-primary">Analytics</h1>
          <p className="mt-0.5 text-sm text-tertiary">{data.scopeLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={data.scope === "company" ? "brand" : "neutral"}>{data.scope === "company" ? "Company scope" : "Team scope"}</Badge>
          <CsvExportLink filename={`analytics-${new Date().toISOString().slice(0, 10)}.csv`} rows={csvRows} className={`${btn.secondary} ${btn.small}`} />
        </div>
      </header>

      <KpiStrip
        metrics={[
          { label: "Headcount", value: data.headcount, comparison: dHead.label, comparisonTone: dHead.sign === "up" ? "positive" : dHead.sign === "down" ? "negative" : "neutral" },
          { label: "On leave today", value: data.onLeaveToday, comparison: dLeave.label, comparisonTone: "neutral" },
          { label: "Pending approvals", value: data.pendingApprovals, comparison: dPend.label, comparisonTone: dPend.sign === "up" ? "negative" : dPend.sign === "down" ? "positive" : "neutral" },
          { label: "Avg approval (h)", value: data.approvalLatencyHours, comparison: "last 30 days" },
        ]}
      />

      <section className="space-y-4">
        <SectionHeading title="Operations" />
        <KpiStrip
          metrics={[
            { label: "Open positions", value: data.openPositions },
            { label: "Hires (30d)", value: data.hires30d },
            { label: "Knowledge articles", value: data.knowledgeArticles },
            { label: "Overdue obligations", value: data.overdueObligations, comparison: data.overdueObligations > 0 ? "needs attention" : "all on track" },
          ]}
        />
      </section>

      <section className="space-y-4">
        <SectionHeading title="Finance & risk" />
        <KpiStrip
          metrics={[
            {
              label: "Expenses awaiting approval",
              value: fmtMoneyCents(data.expensePendingCents, data.expensePendingByCurrency),
              comparison: data.expensePendingByCurrency.length > 1
                ? data.expensePendingByCurrency.map((c) => fmtMoney(c.cents, c.currency)).join(" · ")
                : "all submitted",
            },
            {
              label: "Budget utilization",
              value: `${data.budgetUtilizationPct}%`,
              comparison: data.budgetUtilizationPct >= 90 ? "near cap" : data.budgetUtilizationPct >= 70 ? "healthy" : "under-utilized",
            },
            {
              label: "Avg approval (h)",
              value: data.approvalLatencyHours,
              comparison: "last 30 days",
            },
            {
              label: "Overdue obligations",
              value: data.overdueObligations,
              comparison: data.overdueObligations > 0 ? "see Governance" : "—",
            },
          ]}
        />
      </section>

      <section className="space-y-4">
        <SectionHeading title="Clock-ins" />
        <BarChart
          title="Last 7 days"
          points={data.attendanceLast7Days.map((d) => ({ label: d.date, value: d.clockIns }))}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <BarChart
          title="Expenses by category (30d)"
          points={data.expenseByCategory30d.map((c) => ({
            label: c.category,
            value: Math.round(c.cents / 100),
          }))}
        />
        <BarChart
          title="Leave by type (30d, days)"
          points={data.leaveByType30d.map((l) => ({ label: l.type, value: l.days }))}
        />
      </section>
    </div>
  );
}
