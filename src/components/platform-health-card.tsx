"use client";

import { useState } from "react";

import { downloadCsv } from "@/lib/csv-client";
import { Badge, Card, CardHeader, EmptyState, btn } from "./ui";

/**
 * Admin panel Phase D — Health & Alerts tab (§4.3): red/yellow/green list
 * sorted by score with factor breakdowns on hover ("billing 0/15 —
 * cancelled"), trend vs 7d, alert inbox with acknowledge/resolve, and the
 * playbook rule editor.
 */

export interface HealthRowView {
  orgId: string;
  orgName: string;
  orgSlug: string;
  plan: string;
  score: number;
  grade: string;
  factors: Record<string, number>;
  trend: "up" | "down" | "flat";
  daysSinceActive: number | null;
}

export interface AlertRowView {
  id: string;
  ruleName: string;
  kind: string;
  orgId: string;
  orgName: string;
  state: string;
  payload: Record<string, unknown>;
  firedAt: string;
}

export interface AlertRuleRowView {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  threshold: Record<string, unknown>;
  action: string;
}

const GRADE_TONE: Record<string, "green" | "amber" | "red"> = { green: "green", yellow: "amber", red: "red" };
const WEIGHTS: Record<string, number> = { recency: 20, adoption: 25, breadth: 20, support: 20, billing: 15 };

function factorHint(factors: Record<string, number>): string {
  const worst = Object.entries(WEIGHTS)
    .map(([k, max]) => ({ k, got: Number(factors[k] ?? 0), max }))
    .sort((a, b) => a.got / a.max - b.got / b.max)[0];
  if (!worst) return "";
  const reasons: Record<string, string> = {
    recency: "no recent activity",
    adoption: "low weekly adoption",
    breadth: "few modules used",
    support: "support friction",
    billing: "billing state",
  };
  return `${worst.k} ${worst.got}/${worst.max} — ${reasons[worst.k]}`;
}

function AlertCard({
  alerts,
  rules,
  busy,
  onAct,
  onToggleRule,
}: {
  alerts: AlertRowView[];
  rules: AlertRuleRowView[];
  busy: boolean;
  onAct: (id: string, action: "acknowledge" | "resolve") => void;
  onToggleRule: (ruleId: string, enabled: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={`Alert inbox (${alerts.length} open)`} subtitle="Fired by the hourly evaluator — deduped per rule, tenant, week." />
        {alerts.length === 0 ? (
          <EmptyState title="No open alerts" hint="Playbooks fire when a tenant goes dormant, a trial ends, a payment fails, an SLA breaches, or health turns red." />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {alerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <a href={`/platform/tenants/${a.orgId}`} className="font-medium text-primary hover:underline">
                    {a.orgName}
                  </a>
                  <span className="ml-2 text-secondary">{a.ruleName}</span>
                  {typeof a.payload.daysDormant === "number" ? (
                    <span className="ml-1 text-xs text-tertiary">· {a.payload.daysDormant}d inactive</span>
                  ) : null}
                  {typeof a.payload.daysLeft === "number" ? (
                    <span className="ml-1 text-xs text-tertiary">· {a.payload.daysLeft}d left</span>
                  ) : null}
                  {typeof a.payload.score === "number" ? (
                    <span className="ml-1 text-xs text-tertiary">· score {a.payload.score}</span>
                  ) : null}
                  {typeof a.payload.breached === "number" ? (
                    <span className="ml-1 text-xs text-tertiary">· {a.payload.breached} breached</span>
                  ) : null}
                </span>
                <span className="text-xs text-tertiary">{new Date(a.firedAt).toLocaleDateString()}</span>
                <button type="button" disabled={busy} onClick={() => onAct(a.id, "acknowledge")} className={`${btn.secondary} ${btn.small}`}>
                  Acknowledge
                </button>
                <button type="button" disabled={busy} onClick={() => onAct(a.id, "resolve")} className={`${btn.secondary} ${btn.small}`}>
                  Resolve
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Playbook rules" subtitle="Enable/disable, tune thresholds — evaluated hourly." />
        <ul className="divide-y divide-border-subtle">
          {rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-medium text-primary">{r.name}</span>
                <span className="ml-2 text-xs text-tertiary">
                  {r.kind}
                  {Object.keys(r.threshold).length > 0 ? ` · ${JSON.stringify(r.threshold)}` : ""} · {r.action}
                </span>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onToggleRule(r.id, !r.enabled)}
                className={r.enabled ? `${btn.secondary} ${btn.small}` : `${btn.primary} ${btn.small}`}
              >
                {r.enabled ? "Disable" : "Enable"}
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function PlatformHealthCard({
  board,
  alerts,
  rules,
}: {
  board: HealthRowView[];
  alerts: AlertRowView[];
  rules: AlertRuleRowView[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState("all");
  const [showRules, setShowRules] = useState(false);

  const filtered = gradeFilter === "all" ? board : board.filter((r) => r.grade === gradeFilter);

  async function call(url: string, init: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(d.error?.message ?? "Action failed");
        return false;
      }
      window.location.reload();
      return true;
    } finally {
      setBusy(false);
    }
  }

  function act(id: string, action: "acknowledge" | "resolve") {
    void call("/api/v1/platform/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertId: id, action }),
    });
  }

  function toggleRule(ruleId: string, enabled: boolean) {
    void call("/api/v1/platform/alert-rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ruleId, enabled }),
    });
  }

  const reds = board.filter((r) => r.grade === "red").length;
  const yellows = board.filter((r) => r.grade === "yellow").length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={`Tenant health (${board.length})`}
          subtitle={`${reds} red · ${yellows} yellow · factor breakdown on hover · trend vs 7d ago`}
          action={
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`${btn.secondary} ${btn.small}`}
                onClick={() =>
                  downloadCsv(
                    `wamiro-health-${new Date().toISOString().slice(0, 10)}.csv`,
                    ["tenant", "slug", "plan", "score", "grade", "trend_7d", "inactive_days", "factors"],
                    board.map((r) => [r.orgName, r.orgSlug, r.plan, r.score, r.grade, r.trend, r.daysSinceActive, JSON.stringify(r.factors)]),
                  )
                }
              >
                Export CSV
              </button>
              {["all", "red", "yellow", "green"].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGradeFilter(g)}
                  className={`rounded-full px-2 py-0.5 text-xs ${gradeFilter === g ? "bg-brand-subtle font-medium text-brand-text" : "text-tertiary hover:text-secondary"}`}
                >
                  {g}
                </button>
              ))}
              <button type="button" onClick={() => setShowRules((v) => !v)} className={`${btn.secondary} ${btn.small}`}>
                {showRules ? "Hide alerts" : "Alerts & rules"}
              </button>
            </div>
          }
        />
        {filtered.length === 0 ? (
          <EmptyState
            title="No health data yet"
            hint="The health_rollup job computes scores within the hour of deployment, from usage rollups + support + billing state."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-default">
                  <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-tertiary">Tenant</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-tertiary">Grade</th>
                  <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-tertiary">Score</th>
                  <th className="px-3 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-tertiary">7d</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-tertiary">Weakest factor</th>
                  <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-tertiary">Inactive</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.orgId} className="border-b border-border-subtle">
                    <td className="px-4 py-2">
                      <a href={`/platform/tenants/${r.orgId}`} className="font-medium text-primary hover:underline">
                        {r.orgName}
                      </a>
                      <p className="font-mono text-[11px] text-tertiary">/{r.orgSlug}</p>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={GRADE_TONE[r.grade] ?? "neutral"}>{r.grade}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-primary">{r.score}</td>
                    <td className="px-3 py-2 text-center">{r.trend === "up" ? "↑" : r.trend === "down" ? "↓" : "·"}</td>
                    <td className="px-3 py-2 text-xs text-secondary" title={JSON.stringify(r.factors)}>
                      {factorHint(r.factors)}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-tertiary">
                      {r.daysSinceActive === null ? "—" : `${r.daysSinceActive}d`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error ? <p role="alert" className="border-t border-border-subtle px-5 py-2 text-sm text-danger">{error}</p> : null}
      </Card>

      {showRules ? <AlertCard alerts={alerts} rules={rules} busy={busy} onAct={act} onToggleRule={toggleRule} /> : null}
    </div>
  );
}
