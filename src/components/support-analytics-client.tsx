/** Support analytics — Zammad-parity reports, rendered with shared primitives. */
import { Download } from "lucide-react";

import { Badge } from "./ui";
import { CsvExportLink } from "./csv-export";
import { KpiStrip, BarChart } from "./analytics-bars";
import { cx } from "@/lib/cx";

export interface SupportAnalyticsData {
  volume: {
    total: number;
    open: number;
    resolved: number;
    byStatus: { status: string; count: number }[];
    byCategory: { category: string; count: number }[];
    byPriority: { priority: string; count: number }[];
    trend30d: { date: string; count: number }[];
  };
  sla: {
    compliancePct: number;
    met: number;
    due: number;
    byPriority: { priority: string; met: number; due: number; pct: number }[];
    firstResponseAvgHours: number;
    firstResponseCount: number;
    firstResponseCompliancePct: number;
  };
  csat: {
    avg: number;
    count: number;
    responseRatePct: number;
    distribution: { score: number; count: number }[];
  };
  groups: { name: string; open: number; total: number }[];
  unassignedOpen: number;
  assignees: { name: string; open: number; total: number }[];
}

export function SupportAnalyticsClient({ data }: { data: SupportAnalyticsData }) {
  const csvRows: (string | number | null)[][] = [
    ["section", "key", "value"],
    ["volume", "total", data.volume.total],
    ["volume", "open", data.volume.open],
    ["volume", "resolved", data.volume.resolved],
    ["sla", "compliance_pct", data.sla.compliancePct],
    ["sla", "met", data.sla.met],
    ["sla", "due", data.sla.due],
    ["sla", "first_response_avg_hours", data.sla.firstResponseAvgHours],
    ["csat", "avg", data.csat.avg],
    ["csat", "responses", data.csat.count],
    ["csat", "response_rate_pct", data.csat.responseRatePct],
    ["workload", "unassigned_open", data.unassignedOpen],
  ];

  const maxCsat = Math.max(1, ...data.csat.distribution.map((d) => d.count));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="brand">Company scope</Badge>
        <div className="ml-auto">
          <CsvExportLink
            filename={`support-analytics-${new Date().toISOString().slice(0, 10)}.csv`}
            rows={csvRows}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-default bg-surface px-3 py-1.5 text-xs font-medium text-secondary transition hover:bg-surface-hover"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </CsvExportLink>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
        <KpiStrip
          metrics={[
            { label: "Open tickets", value: data.volume.open, comparison: `${data.volume.total} total` },
            {
              label: "SLA compliance",
              value: `${data.sla.compliancePct}%`,
              comparison: `${data.sla.met} of ${data.sla.due} resolved in time`,
              comparisonTone: data.sla.compliancePct >= 90 ? "positive" : data.sla.compliancePct >= 70 ? "neutral" : "negative",
            },
            {
              label: "First response",
              value: `${fmt1(data.sla.firstResponseAvgHours)}h`,
              comparison: `${data.sla.firstResponseCompliancePct}% within target`,
            },
            {
              label: "CSAT",
              value: data.csat.count === 0 ? "—" : fmt1(data.csat.avg),
              comparison: data.csat.count === 0 ? "no responses yet" : `${data.csat.responseRatePct}% response rate`,
            },
          ]}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Volume" subtitle="Created per day, last 30 days" tone="brand">
          <BarChart
            title="Tickets per day"
            points={data.volume.trend30d.map((d) => ({ label: d.date, value: d.count }))}
          />
        </Section>

        <Section title="Breakdown" subtitle="By status, category and priority" tone="neutral">
          <BarChart
            title="By status"
            points={data.volume.byStatus.map((s) => ({ label: s.status, value: s.count }))}
          />
          <div className="mt-3">
            <BarChart
              title="By priority"
              points={data.volume.byPriority.map((p) => ({ label: p.priority, value: p.count }))}
            />
          </div>
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="SLA by priority" subtitle="Resolved within the per-priority deadline" tone="success">
          {data.sla.byPriority.length === 0 ? (
            <p className="py-4 text-sm text-tertiary">No resolved tickets with SLA deadlines yet.</p>
          ) : (
            <BarChart
              title="Compliance % by priority"
              points={data.sla.byPriority.map((p) => ({ label: p.priority, value: p.pct }))}
            />
          )}
        </Section>

        <Section title="CSAT" subtitle="Scores from resolved tickets" tone="brand">
          <div className="space-y-2">
            {data.csat.distribution.map((d) => (
              <div key={d.score} className="flex items-center gap-3">
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-tertiary">{d.score}★</span>
                <div className="relative h-5 grow rounded-sm bg-surface-subtle">
                  <div
                    className="absolute inset-y-0 left-0 rounded-sm bg-brand"
                    style={{ width: `${Math.max(0, Math.min(100, Math.round((d.count / maxCsat) * 100)))}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-secondary">{d.count}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Group workload" subtitle="Open tickets per assignment group" tone="warning">
          {data.groups.length === 0 ? (
            <p className="py-4 text-sm text-tertiary">No ticket groups configured.</p>
          ) : (
            <BarChart
              title="Open by group"
              points={data.groups.map((g) => ({ label: g.name, value: g.open }))}
            />
          )}
        </Section>

        <Section title="Agent workload" subtitle="Open and total tickets per assignee" tone="neutral">
          {data.assignees.length === 0 ? (
            <p className="py-4 text-sm text-tertiary">No assigned tickets yet.</p>
          ) : (
            <BarChart
              title="Open by agent"
              points={data.assignees.map((a) => ({ label: a.name, value: a.open }))}
            />
          )}
          <p className={cx("mt-2 text-[11px]", data.unassignedOpen > 0 ? "text-danger" : "text-tertiary")}>
            {data.unassignedOpen > 0 ? `${data.unassignedOpen} open tickets unassigned` : "All open tickets assigned"}
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  tone,
  children,
}: {
  title: string;
  subtitle: string;
  tone: "brand" | "success" | "warning" | "danger" | "neutral";
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border-subtle bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cx(
            "inline-block h-1.5 w-1.5 rounded-full",
            tone === "brand" && "bg-brand",
            tone === "success" && "bg-success",
            tone === "warning" && "bg-warning",
            tone === "danger" && "bg-danger",
            tone === "neutral" && "bg-tertiary",
          )}
          aria-hidden
        />
        <h2 className="text-sm font-semibold text-primary">{title}</h2>
        <span className="text-xs text-tertiary">· {subtitle}</span>
      </div>
      {children}
    </section>
  );
}

function fmt1(n: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n);
}