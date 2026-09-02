"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Check,
  Eye,
  Inbox,
  Loader2,
  Pin,
  PinOff,
  Plus,
  Sparkles,
} from "lucide-react";

import { Badge } from "./ui";
import { cx } from "@/lib/cx";

// ── Types ───────────────────────────────────────────────────────
export interface DashboardMetric {
  id: string;
  label: string;
  description: string;
  sensitivity: "internal" | "confidential";
  /** Categ ory for grouping on the page. */
  group: "People" | "Approvals" | "Knowledge";
}

export interface MetricValue {
  id: string;
  value: number | string;
}

const KNOWN_METRICS: Record<string, { label: string; description: string; sensitivity: "internal" | "confidential"; group: "People" | "Approvals" | "Knowledge" }> = {
  headcount: {
    label: "Headcount",
    description: "Active employees in your scope.",
    sensitivity: "internal",
    group: "People",
  },
  on_leave_today: {
    label: "On leave today",
    description: "Approved leave spanning today.",
    sensitivity: "internal",
    group: "People",
  },
  pending_approvals: {
    label: "Pending approvals",
    description: "Unreviewed leave + generic requests.",
    sensitivity: "internal",
    group: "Approvals",
  },
  approval_latency_hours: {
    label: "Avg approval (hours)",
    description: "Mean hours to decision, last 30 days.",
    sensitivity: "internal",
    group: "Approvals",
  },
};

// ── Component ───────────────────────────────────────────────────
export function DashboardsListClient({
  available,
  pinned,
  scopeLabel,
  scope,
}: {
  available: Record<string, number | string>;
  pinned: { metricId: string; value: number | string }[];
  scopeLabel: string;
  scope: "team" | "company";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const pinnedIds = new Set(pinned.map((p) => p.metricId));
  const allMetrics: DashboardMetric[] = Object.entries(KNOWN_METRICS).map(([id, m]) => ({
    id,
    label: m.label,
    description: m.description,
    sensitivity: m.sensitivity,
    group: m.group,
  }));
  const pinnedMetrics: DashboardMetric[] = pinned
    .map((p) => allMetrics.find((m) => m.id === p.metricId))
    .filter((m): m is DashboardMetric => !!m);
  const availableMetrics: DashboardMetric[] = allMetrics.filter((m) => !pinnedIds.has(m.id));

  // Group by category
  const groupedAvailable = groupBy(availableMetrics, (m) => m.group);

  async function toggle(metricId: string) {
    if (busy) return;
    setBusy(metricId);
    setError(null);
    setInfo(null);
    const willPin = !pinnedIds.has(metricId);
    try {
      const res = await fetch("/api/v1/dashboards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ metricId }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not update dashboard");
        return;
      }
      setInfo(willPin ? "Metric pinned" : "Metric unpinned");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={scope === "company" ? "brand" : "neutral"}>
          {scope === "company" ? "Company scope" : "Team scope"}
        </Badge>
        <span className="text-xs text-tertiary">{scopeLabel}</span>
        <div className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-tertiary">
          <Eye className="h-3.5 w-3.5" />
          {pinned.length} pinned
        </div>
      </div>

      <p className="text-[11px] text-tertiary">
        Pin the metrics you check every day. Values respect your access scope, and the dashboard
        updates when you re-visit.
      </p>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      {info ? (
        <p role="status" className="inline-flex items-center gap-1 text-xs text-success">
          <Check className="h-3 w-3" />
          {info}
        </p>
      ) : null}

      {/* Pinned */}
      <DashGroup title="Pinned" tone="brand" count={pinnedMetrics.length}>
        {pinnedMetrics.length === 0 ? (
          <EmptyPinned />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {pinnedMetrics.map((m) => (
              <DashboardCard
                key={m.id}
                metric={m}
                value={available[m.id]}
                pinned
                busy={busy === m.id}
                onToggle={() => toggle(m.id)}
              />
            ))}
          </div>
        )}
      </DashGroup>

      {/* Available */}
      {availableMetrics.length > 0 ? (
        <DashGroup
          title="Available to pin"
          tone="success"
          count={availableMetrics.length}
        >
          <div className="space-y-4">
            {Object.entries(groupedAvailable).map(([group, metrics]) => (
              <div key={group}>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
                  {group}
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {metrics.map((m) => (
                    <AvailablePill
                      key={m.id}
                      metric={m}
                      value={available[m.id]}
                      busy={busy === m.id}
                      onToggle={() => toggle(m.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DashGroup>
      ) : (
        <div className="rounded-md border border-dashed border-border-subtle bg-surface-subtle/40 px-5 py-6 text-center text-sm text-tertiary">
          <Sparkles className="mx-auto mb-1 h-5 w-5" />
          You&apos;ve pinned every available metric.
        </div>
      )}
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────
function DashGroup({
  title,
  tone,
  count,
  children,
}: {
  title: string;
  tone: "brand" | "success";
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border-subtle bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cx(
            "inline-block h-1.5 w-1.5 rounded-full",
            tone === "brand" ? "bg-brand" : "bg-success",
          )}
          aria-hidden
        />
        <h2 className="text-sm font-semibold text-primary">{title}</h2>
        <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-tertiary">
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

function EmptyPinned() {
  return (
    <div className="rounded-md border border-dashed border-border-subtle bg-surface-subtle/40 px-6 py-8 text-center">
      <Inbox className="mx-auto h-6 w-6 text-tertiary" />
      <p className="mt-2 text-sm font-medium text-primary">No metrics pinned yet</p>
      <p className="mt-1 text-xs text-tertiary">
        Pick a metric below to keep it on your dashboard.
      </p>
    </div>
  );
}

function DashboardCard({
  metric,
  value,
  pinned,
  busy,
  onToggle,
}: {
  metric: DashboardMetric;
  value: number | string | undefined;
  pinned: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cx(
        "group relative rounded-lg border bg-surface p-3 transition",
        pinned ? "border-brand/40 hover:border-brand/60" : "border-border-subtle",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
          {metric.group}
        </p>
        {metric.sensitivity === "confidential" ? (
          <Badge tone="amber">Confidential</Badge>
        ) : null}
      </div>
      <p className="mt-1 text-xs font-medium text-primary">{metric.label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-primary">
        {value === undefined ? (
          <span className="text-base text-tertiary">—</span>
        ) : (
          value
        )}
      </p>
      <p className="mt-1 line-clamp-2 text-[10px] text-tertiary">{metric.description}</p>
      <div className="mt-3 flex items-center justify-end border-t border-border-subtle pt-2">
        <button
          type="button"
          onClick={onToggle}
          disabled={busy}
          aria-label={pinned ? `Unpin ${metric.label}` : `Pin ${metric.label}`}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-tertiary transition hover:bg-surface-hover hover:text-primary disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : pinned ? (
            <>
              <PinOff className="h-3 w-3" />
              Unpin
            </>
          ) : (
            <>
              <Pin className="h-3 w-3" />
              Pin
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function AvailablePill({
  metric,
  value,
  busy,
  onToggle,
}: {
  metric: DashboardMetric;
  value: number | string | undefined;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      className={cx(
        "group flex items-center justify-between gap-3 rounded-md border border-border-subtle bg-surface px-3 py-2 text-left transition hover:border-brand hover:bg-brand-subtle/30 disabled:opacity-50",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-primary">{metric.label}</p>
        <p className="truncate text-[10px] text-tertiary">{metric.description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-sm font-semibold tabular-nums text-primary">
          {value === undefined ? "—" : value}
        </span>
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-tertiary" />
        ) : (
          <Plus className="h-3.5 w-3.5 text-tertiary transition group-hover:text-brand-text" />
        )}
      </div>
    </button>
  );
}

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item);
    (acc[k] ||= []).push(item);
    return acc;
  }, {});
}
