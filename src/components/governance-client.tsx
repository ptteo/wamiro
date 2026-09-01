"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge, Card, CardHeader, EmptyState, Stat, btn, input } from "./ui";

interface Policy {
  id: string;
  title: string;
  status: string;
  version: number;
  effectiveAt: string | null;
  reviewAt: string | null;
  updatedAt: string;
}
interface Risk {
  id: string;
  title: string;
  category: string | null;
  impact: string;
  likelihood: string;
  status: string;
  mitigation: string | null;
  createdAt: string;
}
interface Control {
  id: string;
  name: string;
  description: string | null;
  status: string;
  result: string;
  lastTestedAt: string | null;
}
interface Obligation {
  id: string;
  title: string;
  dueAt: string | null;
  status: string;
  notes: string | null;
  escalatedAt: string | null;
}

const IMPACT_ORDER = ["low", "medium", "high", "critical"] as const;
const LIKELIHOOD_ORDER = ["low", "medium", "high"] as const;

const POLICY_TONES: Record<string, "neutral" | "amber" | "green" | "red" | "brand"> = {
  draft: "neutral", active: "green", retired: "red",
};
const RISK_TONES: Record<string, "neutral" | "amber" | "green" | "red" | "brand"> = {
  open: "red", mitigated: "amber", accepted: "neutral", closed: "green",
};
const CONTROL_STATUS_TONES: Record<string, "neutral" | "amber" | "green" | "red" | "brand"> = {
  planned: "neutral", partial: "amber", implemented: "green",
};
const CONTROL_RESULT_TONES: Record<string, "neutral" | "amber" | "green" | "red" | "brand"> = {
  not_tested: "neutral", pass: "green", fail: "red",
};

function dueTone(dueAt: string | null): { tone: "neutral" | "amber" | "red" | "green"; label: string } {
  if (!dueAt) return { tone: "neutral", label: "no due date" };
  const today = new Date().toISOString().slice(0, 10);
  if (dueAt < today) return { tone: "red", label: `overdue · ${dueAt}` };
  const soon = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  if (dueAt <= soon) return { tone: "amber", label: `due ${dueAt}` };
  return { tone: "green", label: `due ${dueAt}` };
}

function impactScore(impact: string, likelihood: string): number {
  const i = IMPACT_ORDER.indexOf(impact as typeof IMPACT_ORDER[number]);
  const l = LIKELIHOOD_ORDER.indexOf(likelihood as typeof LIKELIHOOD_ORDER[number]);
  if (i < 0 || l < 0) return 0;
  return (i + 1) * (l + 1);
}

export function GovernanceClient({
  policies,
  risks,
  controls,
  obligations,
  canManage,
}: {
  policies: Policy[];
  risks: Risk[];
  controls: Control[];
  obligations: Obligation[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [tab, setTab] = useState<"policies" | "risks" | "controls" | "obligations">("obligations");

  const stats = useMemo(() => {
    const openRisks = risks.filter((r) => r.status === "open");
    const critical = openRisks.filter((r) => r.impact === "critical" || impactScore(r.impact, r.likelihood) >= 9).length;
    const controlsPass = controls.filter((c) => c.result === "pass").length;
    const controlsFail = controls.filter((c) => c.result === "fail").length;
    const today = new Date().toISOString().slice(0, 10);
    const overdue = obligations.filter((o) => o.status === "open" && o.dueAt && o.dueAt < today).length;
    const openObligations = obligations.filter((o) => o.status === "open").length;
    const activePolicies = policies.filter((p) => p.status === "active").length;
    const draftPolicies = policies.filter((p) => p.status === "draft").length;
    return { openRisks: openRisks.length, critical, controlsPass, controlsFail, overdue, openObligations, activePolicies, draftPolicies };
  }, [policies, risks, controls, obligations]);

  // Risk heat map: rows = likelihood (high→low), cols = impact (low→critical)
  const heat = useMemo(() => {
    const open = risks.filter((r) => r.status === "open");
    return LIKELIHOOD_ORDER.slice().reverse().map((likelihood) => ({
      likelihood,
      cells: IMPACT_ORDER.map((impact) => ({
        impact,
        items: open.filter((r) => r.likelihood === likelihood && r.impact === impact),
      })),
    }));
  }, [risks]);

  async function call(url: string, method: string, body: unknown, successMsg?: string) {
    setBusy(true); setError(null); setInfo(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok) {
        setError(data.error?.message ?? `Request failed (${res.status})`);
        return null;
      }
      if (successMsg) setInfo(successMsg);
      router.refresh();
      return data;
    } finally {
      setBusy(false);
    }
  }

  function CreateForm({ kind }: { kind: "policy" | "risk" | "control" | "obligation" }) {
    const [open, setOpen] = useState(false);
    if (!canManage) return null;
    if (!open) {
      return (
        <button type="button" className={`${btn.secondary} ${btn.small}`} onClick={() => setOpen(true)}>
          + New {kind}
        </button>
      );
    }
    return (
      <form
        className="mt-3 grid gap-3 rounded-lg border border-border-default bg-surface-subtle p-4 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const payload: Record<string, unknown> = { type: kind };
          if (kind === "policy") {
            payload.title = f.get("title");
            payload.effectiveAt = f.get("effectiveAt") || undefined;
            payload.reviewAt = f.get("reviewAt") || undefined;
          } else if (kind === "risk") {
            payload.title = f.get("title");
            payload.category = f.get("category") || undefined;
            payload.impact = f.get("impact");
            payload.likelihood = f.get("likelihood");
            payload.mitigation = f.get("mitigation") || undefined;
          } else if (kind === "control") {
            payload.name = f.get("name");
            payload.description = f.get("description") || undefined;
          } else {
            payload.title = f.get("title");
            payload.dueAt = f.get("dueAt") || undefined;
            payload.notes = f.get("notes") || undefined;
          }
          const ok = await call("/api/v1/governance", "POST", payload, `${kind} created`);
          if (ok) { setOpen(false); (e.target as HTMLFormElement).reset(); }
        }}
      >
        {kind === "policy" ? (
          <>
            <label className="text-sm font-medium">Title<input name="title" required minLength={2} maxLength={200} className={`${input} mt-1`} /></label>
            <label className="text-sm font-medium">Effective date<input type="date" name="effectiveAt" className={`${input} mt-1`} /></label>
            <label className="text-sm font-medium">Review date<input type="date" name="reviewAt" className={`${input} mt-1`} /></label>
          </>
        ) : null}
        {kind === "risk" ? (
          <>
            <label className="text-sm font-medium">Title<input name="title" required minLength={2} maxLength={200} className={`${input} mt-1`} /></label>
            <label className="text-sm font-medium">Category<input name="category" maxLength={60} className={`${input} mt-1`} placeholder="security, financial…" /></label>
            <label className="text-sm font-medium">Impact
              <select name="impact" defaultValue="medium" className={`${input} mt-1`}>{IMPACT_ORDER.map((v) => <option key={v} value={v}>{v}</option>)}</select>
            </label>
            <label className="text-sm font-medium">Likelihood
              <select name="likelihood" defaultValue="medium" className={`${input} mt-1`}>{LIKELIHOOD_ORDER.map((v) => <option key={v} value={v}>{v}</option>)}</select>
            </label>
            <label className="text-sm font-medium sm:col-span-2">Mitigation plan<textarea name="mitigation" className={`${input} mt-1 min-h-16`} /></label>
          </>
        ) : null}
        {kind === "control" ? (
          <>
            <label className="text-sm font-medium">Name<input name="name" required minLength={2} maxLength={200} className={`${input} mt-1`} /></label>
            <label className="text-sm font-medium sm:col-span-2">Description<textarea name="description" className={`${input} mt-1 min-h-16`} /></label>
          </>
        ) : null}
        {kind === "obligation" ? (
          <>
            <label className="text-sm font-medium">Title<input name="title" required minLength={2} maxLength={200} className={`${input} mt-1`} /></label>
            <label className="text-sm font-medium">Due date<input type="date" name="dueAt" className={`${input} mt-1`} /></label>
            <label className="text-sm font-medium sm:col-span-2">Notes<textarea name="notes" className={`${input} mt-1 min-h-16`} /></label>
          </>
        ) : null}
        <div className="sm:col-span-2 flex gap-2">
          <button type="submit" disabled={busy} className={btn.primary}>{busy ? "Saving…" : `Create ${kind}`}</button>
          <button type="button" className={btn.secondary} onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-primary">Governance</h1>
          <p className="mt-1 text-sm text-secondary">Policies, risks, controls and compliance obligations for the organization.</p>
        </div>
        {canManage ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => call("/api/v1/governance/sweep", "POST", {}, "Sweep complete")}
            className={`${btn.secondary} ${btn.small}`}
            title="Escalate open obligations past their due date (idempotent)"
          >
            Run obligation sweep
          </button>
        ) : null}
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Open risks" value={stats.openRisks} hint={`${stats.critical} high-severity`} tone={stats.critical > 0 ? "red" : stats.openRisks > 0 ? "amber" : "neutral"} />
        <Stat label="Controls" value={controls.length} hint={`${stats.controlsPass} pass · ${stats.controlsFail} fail`} tone={stats.controlsFail > 0 ? "red" : "neutral"} />
        <Stat label="Obligations" value={stats.openObligations} hint={stats.overdue > 0 ? `${stats.overdue} overdue` : "all on track"} tone={stats.overdue > 0 ? "red" : "neutral"} />
        <Stat label="Policies" value={policies.length} hint={`${stats.activePolicies} active · ${stats.draftPolicies} draft`} />
      </div>

      {error && <p role="alert" className="rounded-lg bg-danger-subtle px-4 py-3 text-sm text-danger">{error}</p>}
      {info && !error && <p role="status" className="rounded-lg bg-success-subtle px-4 py-3 text-sm text-success">{info}</p>}

      {/* Risk heat map */}
      {stats.openRisks > 0 && (
        <Card>
          <CardHeader title="Risk heat map" subtitle="Open risks by impact × likelihood. High-severity corner demands attention first." />
          <div className="overflow-x-auto px-5 py-4">
            <table className="min-w-[420px] border-collapse text-xs">
              <thead>
                <tr>
                  <th className="p-1 text-left font-medium text-tertiary">likelihood ↓ / impact →</th>
                  {IMPACT_ORDER.map((i) => (
                    <th key={i} className="p-1 text-center font-medium capitalize text-tertiary">{i}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heat.map((row) => (
                  <tr key={row.likelihood}>
                    <td className="p-1 font-medium capitalize text-secondary">{row.likelihood}</td>
                    {row.cells.map((cell) => {
                      const score = impactScore(cell.impact, row.likelihood);
                      const n = cell.items.length;
                      const cls = n === 0
                        ? "bg-surface-subtle text-tertiary"
                        : score >= 9 ? "bg-danger-subtle text-danger"
                        : score >= 6 ? "bg-warning-subtle text-warning"
                        : "bg-success-subtle text-success";
                      return (
                        <td key={cell.impact} className="p-1">
                          <div className={`flex h-12 items-center justify-center rounded-md font-semibold tabular-nums ${cls}`} title={cell.items.map((r) => r.title).join(", ") || "none"}>
                            {n || "·"}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-border-default bg-surface p-1 text-sm">
        {([
          ["obligations", `Obligations (${obligations.length})`],
          ["risks", `Risks (${risks.length})`],
          ["controls", `Controls (${controls.length})`],
          ["policies", `Policies (${policies.length})`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={[
              "rounded px-3 py-1.5",
              tab === key ? "bg-brand text-on-brand" : "text-secondary hover:bg-surface-hover",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Obligations */}
      {tab === "obligations" && (
        <Card>
          <CardHeader title={`Obligations (${obligations.length})`} subtitle="Compliance duties with due dates. Overdue items escalate via the sweep." action={<CreateForm kind="obligation" />} />
          {obligations.length === 0 ? (
            <EmptyState title="No obligations" hint={canManage ? "Add your first compliance obligation." : undefined} />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {obligations.map((o) => {
                const d = dueTone(o.dueAt);
                return (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-primary">{o.title}</p>
                      {o.notes ? <p className="truncate text-xs text-tertiary">{o.notes}</p> : null}
                      {o.escalatedAt ? <p className="text-xs text-danger">escalated {new Date(o.escalatedAt).toLocaleDateString()}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={d.tone}>{d.label}</Badge>
                      <Badge tone={o.status === "met" ? "green" : "neutral"}>{o.status}</Badge>
                      {canManage && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => call("/api/v1/governance", "PATCH", { kind: "obligation", id: o.id, status: o.status === "met" ? "open" : "met" })}
                          className={`${btn.secondary} ${btn.small}`}
                        >
                          {o.status === "met" ? "Reopen" : "Mark met"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {/* Risks */}
      {tab === "risks" && (
        <Card>
          <CardHeader title={`Risks (${risks.length})`} subtitle="Open risks appear on the heat map above." action={<CreateForm kind="risk" />} />
          {risks.length === 0 ? (
            <EmptyState title="No risks" hint={canManage ? "Register your first risk." : undefined} />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {risks.map((r) => {
                const score = impactScore(r.impact, r.likelihood);
                return (
                  <li key={r.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-primary">{r.title}</p>
                        <p className="text-xs text-tertiary">
                          {r.category ? `${r.category} · ` : ""}impact {r.impact} · likelihood {r.likelihood} · score {score}
                          {r.mitigation ? ` · mitigation on file` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={score >= 9 ? "red" : score >= 6 ? "amber" : "green"}>score {score}</Badge>
                        <Badge tone={RISK_TONES[r.status] ?? "neutral"}>{r.status}</Badge>
                        {canManage && r.status === "open" && (
                          <>
                            <button type="button" disabled={busy} onClick={() => call("/api/v1/governance", "PATCH", { kind: "risk", id: r.id, status: "mitigated" })} className={`${btn.secondary} ${btn.small}`}>Mitigate</button>
                            <button type="button" disabled={busy} onClick={() => call("/api/v1/governance", "PATCH", { kind: "risk", id: r.id, status: "accepted" })} className={`${btn.secondary} ${btn.small}`}>Accept</button>
                          </>
                        )}
                        {canManage && r.status !== "open" && (
                          <button type="button" disabled={busy} onClick={() => call("/api/v1/governance", "PATCH", { kind: "risk", id: r.id, status: "open" })} className={`${btn.secondary} ${btn.small}`}>Reopen</button>
                        )}
                      </div>
                    </div>
                    {r.mitigation && (
                      <p className="mt-2 rounded-md bg-surface-subtle px-3 py-2 text-xs text-secondary">{r.mitigation}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {/* Controls */}
      {tab === "controls" && (
        <Card>
          <CardHeader title={`Controls (${controls.length})`} subtitle="Test controls and record pass/fail with a last-tested date." action={<CreateForm kind="control" />} />
          {controls.length === 0 ? (
            <EmptyState title="No controls" hint={canManage ? "Define your first control." : undefined} />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {controls.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-primary">{c.name}</p>
                    {c.description ? <p className="truncate text-xs text-tertiary">{c.description}</p> : null}
                    <p className="text-xs text-tertiary">
                      {c.lastTestedAt ? `last tested ${new Date(c.lastTestedAt).toLocaleDateString()}` : "never tested"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={CONTROL_STATUS_TONES[c.status] ?? "neutral"}>{c.status}</Badge>
                    <Badge tone={CONTROL_RESULT_TONES[c.result] ?? "neutral"}>{c.result.replace("_", " ")}</Badge>
                    {canManage && (
                      <>
                        <button type="button" disabled={busy} onClick={() => call("/api/v1/governance", "PATCH", { kind: "control", id: c.id, status: c.status, result: "pass" })} className={`${btn.success} ${btn.small}`}>Pass</button>
                        <button type="button" disabled={busy} onClick={() => call("/api/v1/governance", "PATCH", { kind: "control", id: c.id, status: c.status, result: "fail" })} className={`${btn.danger} ${btn.small}`}>Fail</button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* Policies */}
      {tab === "policies" && (
        <Card>
          <CardHeader title={`Policies (${policies.length})`} subtitle="Metadata wrappers — the actual content lives in Knowledge." action={<CreateForm kind="policy" />} />
          {policies.length === 0 ? (
            <EmptyState title="No policies" hint={canManage ? "Register your first policy." : undefined} />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {policies.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-primary">{p.title}</p>
                    <p className="text-xs text-tertiary">
                      v{p.version}
                      {p.effectiveAt ? ` · effective ${p.effectiveAt}` : ""}
                      {p.reviewAt ? ` · review ${p.reviewAt}` : ""}
                      {` · updated ${new Date(p.updatedAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={POLICY_TONES[p.status] ?? "neutral"}>{p.status}</Badge>
                    {canManage && p.status === "draft" && (
                      <button type="button" disabled={busy} onClick={() => call("/api/v1/governance", "PATCH", { kind: "policy", id: p.id, status: "active" })} className={`${btn.secondary} ${btn.small}`}>Activate</button>
                    )}
                    {canManage && p.status === "active" && (
                      <button type="button" disabled={busy} onClick={() => call("/api/v1/governance", "PATCH", { kind: "policy", id: p.id, status: "retired" })} className={`${btn.secondary} ${btn.small}`}>Retire</button>
                    )}
                    {canManage && p.status === "retired" && (
                      <button type="button" disabled={busy} onClick={() => call("/api/v1/governance", "PATCH", { kind: "policy", id: p.id, status: "draft" })} className={`${btn.secondary} ${btn.small}`}>Revive</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
