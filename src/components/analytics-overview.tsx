/**
 * Analytics overview — hero-less toolbar, KPI rail, sectioned charts.
 * Built on top of the existing low-level KpiStrip / BarChart primitives.
 */

import {
  Calendar,
  Download,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

import { Badge } from "./ui";
import { CsvExportLink } from "./csv-export";
import { KpiStrip, BarChart } from "./analytics-bars";
import { cx } from "@/lib/cx";

// ── Types ───────────────────────────────────────────────────────
export interface AnalyticsOverview {
  scope: "team" | "company";
  scopeLabel: string;
  headcount: number;
  onLeaveToday: number;
  pendingApprovals: number;
  approvalLatencyHours: number;
  attendanceLast7Days: { date: string; clockIns: number }[];
  openPositions: number;
  hires30d: number;
  expensePendingCents: number;
  expensePendingByCurrency: { currency: string; cents: number }[];
  knowledgeArticles: number;
  overdueObligations: number;
  budgetUtilizationPct: number;
  expenseByCategory30d: { category: string; cents: number }[];
  leaveByType30d: { type: string; days: number }[];
  headcountPrior30d: number;
  pendingApprovalsPrior30d: number;
  onLeaveTodayPrior30d: number;
}

type Scope = "team" | "company";

const SCOPE_DESCRIPTION: Record<Scope, string> = {
  company: "Everyone, across all teams and locations.",
  team: "Just you, your direct reports, and the people they manage.",
};

// ── Helpers ─────────────────────────────────────────────────────
function fmtMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function fmtMoneyCents(
  cents: number,
  byCurrency: { currency: string; cents: number }[],
): string {
  if (cents === 0) return "—";
  if (byCurrency.length === 0) return "—";
  if (byCurrency.length === 1 && byCurrency[0]) {
    return fmtMoney(byCurrency[0].cents, byCurrency[0].currency);
  }
  return byCurrency.map((c) => fmtMoney(c.cents, c.currency)).join(" + ");
}

function delta(
  curr: number,
  prev: number,
): { sign: "up" | "down" | "flat"; pct: number | null; label: string } {
  if (prev === 0) {
    if (curr === 0) return { sign: "flat", pct: null, label: "—" };
    return { sign: "up", pct: null, label: `+${curr}` };
  }
  const diff = curr - prev;
  const pct = Math.round((diff / prev) * 100);
  if (Math.abs(pct) < 1) return { sign: "flat", pct: 0, label: "no change" };
  return {
    sign: pct > 0 ? "up" : "down",
    pct,
    label: `${pct > 0 ? "+" : ""}${pct}% vs 30d ago`,
  };
}

function DeltaMark({ sign, label }: { sign: "up" | "down" | "flat"; label: string }) {
  const Icon = sign === "up" ? TrendingUp : sign === "down" ? TrendingDown : Minus;
  const tone =
    sign === "up"
      ? "text-success"
      : sign === "down"
        ? "text-danger"
        : "text-tertiary";
  return (
    <span className={cx("inline-flex items-center gap-1 text-[10px] tabular-nums", tone)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

// ── Component ───────────────────────────────────────────────────
export function AnalyticsOverviewClient({
  data,
}: {
  data: AnalyticsOverview;
}) {
  const dHead = delta(data.headcount, data.headcountPrior30d);
  const dLeave = delta(data.onLeaveToday, data.onLeaveTodayPrior30d);
  const dPend = delta(data.pendingApprovals, data.pendingApprovalsPrior30d);
  const dHires = delta(data.hires30d, 0);
  const dBudget = delta(data.budgetUtilizationPct, 0);

  const csvRows: (string | number | null)[][] = [
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
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={data.scope === "company" ? "brand" : "neutral"}>
          {data.scope === "company" ? "Company scope" : "Team scope"}
        </Badge>
        <div className="flex items-center gap-1.5 text-xs text-tertiary">
          <Calendar className="h-3.5 w-3.5" />
          Last 30 days
        </div>
        <div className="ml-auto inline-flex items-center gap-2">
          <CsvExportLink
            filename={`analytics-${new Date().toISOString().slice(0, 10)}.csv`}
            rows={csvRows}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-default bg-surface px-3 py-1.5 text-xs font-medium text-secondary transition hover:bg-surface-hover"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </CsvExportLink>
        </div>
      </div>

      {/* Scope explanation */}
      <p className="text-[11px] text-tertiary">{SCOPE_DESCRIPTION[data.scope]}</p>

      {/* Headline KPI rail */}
      <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
        <KpiStrip
          metrics={[
            {
              label: "Headcount",
              value: data.headcount,
              comparison: dHead.label,
              comparisonTone:
                dHead.sign === "up" ? "positive" : dHead.sign === "down" ? "negative" : "neutral",
            },
            {
              label: "On leave today",
              value: data.onLeaveToday,
              comparison: data.onLeaveToday === 0 ? "all in" : dLeave.label,
            },
            {
              label: "Pending approvals",
              value: data.pendingApprovals,
              comparison: dPend.label,
              comparisonTone:
                dPend.sign === "up" ? "negative" : dPend.sign === "down" ? "positive" : "neutral",
            },
            {
              label: "Avg approval (h)",
              value: data.approvalLatencyHours,
              comparison: "last 30 days",
            },
          ]}
        />
      </div>

      {/* Workforce section */}
      <Section
        title="Workforce"
        subtitle="People, movement, time off"
        tone="brand"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <MiniKpi
            label="Hires (30d)"
            value={data.hires30d}
            delta={dHires.label}
            tone="success"
          />
          <MiniKpi
            label="Open positions"
            value={data.openPositions}
            delta={data.openPositions === 0 ? "fully hired" : "hiring in progress"}
          />
          <MiniKpi
            label="Knowledge articles"
            value={data.knowledgeArticles}
            delta={data.knowledgeArticles === 0 ? "nothing published" : "published"}
            tone={data.knowledgeArticles === 0 ? "muted" : "brand"}
          />
        </div>
      </Section>

      {/* Operations + Compliance */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title="Activity"
          subtitle="Clock-ins over the last 7 days"
          tone="success"
        >
          <BarChart
            title="Clock-ins by day"
            points={data.attendanceLast7Days.map((d) => ({ label: d.date, value: d.clockIns }))}
          />
        </Section>

        <Section
          title="Compliance"
          subtitle="Governance & policy"
          tone={data.overdueObligations > 0 ? "danger" : "success"}
        >
          <div className="space-y-3">
            <MiniKpi
              label="Overdue obligations"
              value={data.overdueObligations}
              delta={data.overdueObligations > 0 ? "see Governance" : "all on track"}
              tone={data.overdueObligations > 0 ? "danger" : "success"}
            />
            <MiniKpi
              label="Approval latency"
              value={`${data.approvalLatencyHours}h`}
              delta="last 30 days"
            />
          </div>
        </Section>
      </div>

      {/* Finance & risk */}
      <Section
        title="Finance & risk"
        subtitle="Expenses, budgets"
        tone={data.budgetUtilizationPct >= 90 ? "warning" : "brand"}
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniKpi
              label="Expenses awaiting approval"
              value={fmtMoneyCents(data.expensePendingCents, data.expensePendingByCurrency)}
              delta={
                data.expensePendingByCurrency.length > 1
                  ? data.expensePendingByCurrency
                      .map((c) => fmtMoney(c.cents, c.currency))
                      .join(" + ")
                  : "all submitted"
              }
              tone={data.expensePendingCents > 0 ? "warning" : "muted"}
            />
            <MiniKpi
              label="Budget utilization"
              value={`${data.budgetUtilizationPct}%`}
              delta={
                data.budgetUtilizationPct >= 90
                  ? "near cap"
                  : data.budgetUtilizationPct >= 70
                    ? "healthy"
                    : "under-utilized"
              }
              tone={
                data.budgetUtilizationPct >= 90
                  ? "warning"
                  : data.budgetUtilizationPct >= 70
                    ? "success"
                    : "muted"
              }
            />
          </div>
          <BarChart
            title="Expenses by category (30d)"
            points={data.expenseByCategory30d.map((c) => ({
              label: c.category,
              value: Math.round(c.cents / 100),
            }))}
          />
        </div>
      </Section>

      {/* Leave by type */}
      <Section
        title="Time off"
        subtitle="Approved leave days (30d) by type"
        tone="success"
      >
        <BarChart
          title="Leave by type"
          points={data.leaveByType30d.map((l) => ({ label: l.type, value: l.days }))}
        />
      </Section>
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────
function Section({
  title,
  subtitle,
  tone,
  children,
}: {
  title: string;
  subtitle: string;
  tone: "brand" | "success" | "warning" | "danger";
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

function MiniKpi({
  label,
  value,
  delta,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  delta?: string;
  tone?: "brand" | "success" | "warning" | "danger" | "muted" | "neutral";
}) {
  const valueColor =
    tone === "danger"
      ? "text-danger"
      : tone === "warning"
        ? "text-warning"
        : tone === "success"
          ? "text-success"
          : tone === "brand"
            ? "text-brand-text"
            : "text-primary";
  return (
    <div
      className={cx(
        "rounded-md border bg-surface-subtle/40 p-3",
        tone === "danger" ? "border-danger/30" : "border-border-subtle",
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">{label}</p>
      <p className={cx("mt-1 text-base font-semibold tabular-nums", valueColor)}>
        {value}
      </p>
      {delta ? <p className="mt-0.5 text-[10px] text-tertiary">{delta}</p> : null}
    </div>
  );
}
