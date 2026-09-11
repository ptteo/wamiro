"use client";

import { useMemo, useState } from "react";

import { Badge, Card, CardHeader, EmptyState } from "./ui";

/**
 * Admin panel Phase A — Usage tab: fleet usage table + module-adoption heatmap.
 * Data comes from platform.tenant_usage_daily (rolled up by the jobs worker).
 */
export interface UsageRowView {
  organizationId: string;
  name: string;
  slug: string;
  plan: string;
  seatsActive: number;
  activeActors7d: number;
  actions30d: number;
  logins30d: number;
  mutations30d: number;
  storageBytes: number;
  documentsStored: number;
  lastActiveDay: string | null;
}

export interface HeatmapOrg {
  orgId: string;
  orgName: string;
  areas: Record<string, number>;
}

export const FEATURE_AREAS: { key: string; label: string }[] = [
  { key: "tickets", label: "Support" },
  { key: "leave", label: "Leave" },
  { key: "attendance", label: "Attendance" },
  { key: "shifts", label: "Shifts" },
  { key: "payroll", label: "Payroll" },
  { key: "people", label: "People" },
  { key: "people_ops", label: "People Ops" },
  { key: "requests", label: "Requests" },
  { key: "work", label: "Work" },
  { key: "finance", label: "Finance" },
  { key: "documents", label: "Documents" },
  { key: "knowledge", label: "Knowledge" },
  { key: "company", label: "Company" },
  { key: "assets", label: "Assets" },
  { key: "workplace", label: "Workplace" },
  { key: "governance", label: "Governance" },
  { key: "admin", label: "Admin" },
];

function fmtBytes(n: number): string {
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

type SortKey = "actions30d" | "activeActors7d" | "logins30d" | "mutations30d" | "storageBytes" | "seatsActive" | "name";

export function PlatformUsageCard({ rows, heatmap }: { rows: UsageRowView[]; heatmap: HeatmapOrg[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("actions30d");
  const [desc, setDesc] = useState(true);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sortKey === "name") return desc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
      return desc ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey];
    });
    return copy.slice(0, 100);
  }, [rows, sortKey, desc]);

  const heatmapTop = useMemo(() => {
    return [...heatmap]
      .sort((a, b) => {
        const sum = (h: HeatmapOrg) => Object.values(h.areas).reduce((s, v) => s + v, 0);
        return sum(b) - sum(a);
      })
      .slice(0, 20);
  }, [heatmap]);

  const maxCell = useMemo(() => {
    let max = 1;
    for (const h of heatmapTop) for (const v of Object.values(h.areas)) max = Math.max(max, v);
    return max;
  }, [heatmapTop]);

  function sortBtn(key: SortKey, label: string) {
    const active = sortKey === key;
    return (
      <button
        type="button"
        onClick={() => {
          if (active) setDesc(!desc);
          else {
            setSortKey(key);
            setDesc(true);
          }
        }}
        className={`text-left text-[11px] font-medium uppercase tracking-wide ${active ? "text-brand-text" : "text-tertiary hover:text-secondary"}`}
      >
        {label}{active ? (desc ? " ↓" : " ↑") : ""}
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={`Usage — last 30 days (${rows.length} tenants)`}
          subtitle="Rolled up daily by the jobs worker from audit activity, rate-limit counters and file tables. Click a column to sort."
        />
        {rows.length === 0 ? (
          <EmptyState
            title="No usage data yet"
            hint="The usage_rollup job populates this within the hour of deployment."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-default">
                  <th className="px-4 py-2 text-left">{sortBtn("name", "Tenant")}</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-tertiary">Plan</th>
                  <th className="px-3 py-2 text-right">{sortBtn("seatsActive", "Seats")}</th>
                  <th className="px-3 py-2 text-right">{sortBtn("activeActors7d", "Active 7d")}</th>
                  <th className="px-3 py-2 text-right">{sortBtn("actions30d", "Actions 30d")}</th>
                  <th className="px-3 py-2 text-right">{sortBtn("logins30d", "Logins 30d")}</th>
                  <th className="px-3 py-2 text-right">{sortBtn("mutations30d", "API 30d")}</th>
                  <th className="px-3 py-2 text-right">{sortBtn("storageBytes", "Storage")}</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-tertiary">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.organizationId} className="border-b border-border-subtle">
                    <td className="px-4 py-2">
                      <p className="font-medium text-primary">{r.name}</p>
                      <p className="font-mono text-[11px] text-tertiary">/{r.slug}</p>
                    </td>
                    <td className="px-3 py-2"><Badge tone={r.plan === "scale" ? "brand" : r.plan === "growth" ? "green" : "neutral"}>{r.plan}</Badge></td>
                    <td className="px-3 py-2 text-right tabular-nums text-secondary">{r.seatsActive}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-secondary">{r.activeActors7d}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-primary">{r.actions30d}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-secondary">{r.logins30d}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-secondary">{r.mutations30d}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-secondary">{fmtBytes(r.storageBytes)}<span className="ml-1 text-[11px] text-tertiary">({r.documentsStored})</span></td>
                    <td className="px-3 py-2 text-xs text-tertiary">{r.lastActiveDay ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Module adoption heatmap"
          subtitle="Distinct people who performed an action in each area over the last 30 days. Darker = more people engaged."
        />
        {heatmapTop.length === 0 ? (
          <EmptyState title="No audited activity in range" />
        ) : (
          <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left text-[11px] font-medium uppercase tracking-wide text-tertiary">Tenant</th>
                  {FEATURE_AREAS.map((f) => (
                    <th key={f.key} className="px-1 py-1 text-[10px] font-medium uppercase tracking-wide text-tertiary">{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmapTop.map((h) => (
                  <tr key={h.orgId}>
                    <td className="max-w-[180px] truncate px-2 py-1 text-secondary">{h.orgName}</td>
                    {FEATURE_AREAS.map((f) => {
                      const v = h.areas[f.key] ?? 0;
                      const alpha = v === 0 ? 0 : 0.15 + 0.85 * Math.min(1, v / maxCell);
                      return (
                        <td key={f.key} className="px-1 py-1 text-center tabular-nums text-secondary"
                          style={{ background: v === 0 ? undefined : `rgba(79,70,229,${alpha.toFixed(2)})`, color: alpha > 0.55 ? "#fff" : undefined }}
                          title={`${v} people active in ${f.label}`}>
                          {v || "·"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
