/** HR analytics — Frappe-parity reports, rendered with shared primitives. */
import { Download } from "lucide-react";

import { Badge } from "./ui";
import { CsvExportLink } from "./csv-export";
import { KpiStrip, BarChart } from "./analytics-bars";
import { cx } from "@/lib/cx";

export interface HrAnalyticsData {
  headcountByDepartment: { department: string; count: number }[];
  headcountByStatus: { status: string; count: number }[];
  attrition: {
    monthly: { month: string; joins: number; leaves: number }[];
    leaves12m: number;
    rate12mPct: number;
  };
  leaveUtilization: { type: string; entitled: number; used: number; pct: number }[];
  overtime: { totalHours30d: number; top: { name: string; hours: number }[] };
  payroll: { totalGross: number; totalNet: number; byDepartment: { department: string; gross: number; net: number }[] };
  recognition: { monthly: { month: string; count: number }[]; topRecipients: { name: string; count: number }[] };
  hiring: { openings: number; funnel: { stage: string; count: number }[] };
}

const STATUS_TONES: Record<string, "brand" | "success" | "warning" | "danger" | "muted" | "neutral"> = {
  active: "success",
  on_leave: "warning",
  offboarding: "danger",
  inactive: "muted",
};

export function HrAnalyticsClient({ data }: { data: HrAnalyticsData }) {
  const csvRows: (string | number | null)[][] = [
    ["section", "key", "value"],
    ["headcount", "total_by_department", data.headcountByDepartment.map((d) => `${d.department}:${d.count}`).join(" | ")],
    ["attrition_rate_12m_pct", "", data.attrition.rate12mPct],
    ["attrition_leaves_12m", "", data.attrition.leaves12m],
    ["payroll_ytd_gross", "", data.payroll.totalGross],
    ["payroll_ytd_net", "", data.payroll.totalNet],
    ["overtime_hours_30d", "", data.overtime.totalHours30d],
    ["open_jobs", "", data.hiring.openings],
  ];

  const totalHeadcount = data.headcountByDepartment.reduce((n, d) => n + d.count, 0);
  const utilization = data.leaveUtilization.filter((l) => l.entitled > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="brand">Company scope</Badge>
        <div className="ml-auto">
          <CsvExportLink
            filename={`hr-analytics-${new Date().toISOString().slice(0, 10)}.csv`}
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
            { label: "Headcount", value: totalHeadcount, comparison: `${data.headcountByDepartment.length} departments` },
            { label: "Attrition (12m)", value: `${data.attrition.rate12mPct}%`, comparison: `${data.attrition.leaves12m} leavers` },
            { label: "Payroll YTD (net)", value: fmtMoney(data.payroll.totalNet), comparison: "approved + paid runs" },
            { label: "Overtime (30d)", value: `${fmt1(data.overtime.totalHours30d)}h`, comparison: `${data.overtime.top.length} employees` },
          ]}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Headcount" subtitle="Active employees by department" tone="brand">
          <BarChart
            title="By department"
            points={data.headcountByDepartment.map((d) => ({ label: d.department, value: d.count }))}
          />
        </Section>

        <Section title="Employment status" subtitle="Active employees by status" tone="neutral">
          <div className="flex flex-wrap gap-2">
            {data.headcountByStatus.length === 0 ? (
              <p className="py-4 text-sm text-tertiary">No data.</p>
            ) : (
              data.headcountByStatus.map((s) => (
                <span
                  key={s.status}
                  className={cx(
                    "inline-flex items-center gap-2 rounded-md border border-border-subtle bg-surface-subtle/40 px-3 py-2 text-sm",
                  )}
                >
                  <span
                    className={cx(
                      "h-2 w-2 rounded-full",
                      STATUS_TONES[s.status] === "success" && "bg-success",
                      STATUS_TONES[s.status] === "warning" && "bg-warning",
                      STATUS_TONES[s.status] === "danger" && "bg-danger",
                      STATUS_TONES[s.status] === "muted" && "bg-tertiary",
                      (!STATUS_TONES[s.status] || STATUS_TONES[s.status] === "neutral" || STATUS_TONES[s.status] === "brand") && "bg-brand",
                    )}
                  />
                  <span className="font-medium capitalize text-primary">{s.status.replace("_", " ")}</span>
                  <span className="tabular-nums text-tertiary">{s.count}</span>
                </span>
              ))
            )}
          </div>
        </Section>
      </div>

      <Section title="Attrition" subtitle="Joins vs leaves per month" tone="danger">
        <BarChart
          title="Joins (brand) — trend below"
          points={data.attrition.monthly.map((m) => ({ label: m.month, value: m.joins }))}
        />
        <div className="mt-4">
          <BarChart
            title="Leaves"
            points={data.attrition.monthly.map((m) => ({ label: m.month, value: m.leaves }))}
          />
        </div>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Leave utilization" subtitle="Current year, per type" tone="success">
          {utilization.length === 0 ? (
            <p className="py-4 text-sm text-tertiary">No leave balances recorded this year.</p>
          ) : (
            <BarChart
              title="Used days vs entitled"
              points={utilization.map((l) => ({ label: l.type, value: l.used }))}
            />
          )}
        </Section>

        <Section title="Overtime" subtitle="Beyond rostered hours, last 30 days" tone="warning">
          <BarChart
            title="Top employees"
            points={data.overtime.top.map((t) => ({ label: t.name, value: Math.round(t.hours) }))}
          />
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Payroll cost" subtitle="By department, current year" tone="brand">
          <BarChart
            title="Net pay by department"
            points={data.payroll.byDepartment.map((d) => ({ label: d.department, value: Math.round(d.net) }))}
          />
        </Section>

        <Section title="Recognition" subtitle="Kudos over the last 6 months" tone="brand">
          <BarChart
            title="Recognitions per month"
            points={data.recognition.monthly.map((m) => ({ label: m.month, value: m.count }))}
          />
          {data.recognition.topRecipients.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.recognition.topRecipients.map((r) => (
                <span key={r.name} className="inline-flex items-center gap-1 rounded-full bg-surface-subtle px-2.5 py-1 text-xs text-secondary">
                  {r.name}
                  <span className="tabular-nums text-tertiary">×{r.count}</span>
                </span>
              ))}
            </div>
          ) : null}
        </Section>
      </div>

      <Section title="Hiring funnel" subtitle="Openings and candidates by stage" tone="neutral">
        <div className="grid gap-3 sm:grid-cols-6">
          <FunnelStage label="Open jobs" value={data.hiring.openings} />
          {data.hiring.funnel.map((f) => (
            <FunnelStage key={f.stage} label={f.stage} value={f.count} />
          ))}
        </div>
      </Section>
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

function FunnelStage({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border-subtle bg-surface-subtle/40 p-3 text-center">
      <p className="text-lg font-semibold tabular-nums text-primary">{value}</p>
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-tertiary">{label.replace("_", " ")}</p>
    </div>
  );
}

function fmt1(n: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n);
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}