"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Badge, Card, CardHeader, EmptyState, btn, input } from "./ui";

/**
 * Admin panel Phase C — Tenant 360 (§4.1 centerpiece) + global tenant search
 * (fold-in #8). Tabs: Overview · Usage · Billing · Support · Notes & Timeline ·
 * Access. Quick actions reuse the B-fix ledger endpoints; notes/touchpoints
 * write through the CRM-lite API.
 */

type Iso = string;

export interface Overview360 {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  planName: string;
  billingStatus: string;
  trialEndsAt: Iso | null;
  onboardingState: string;
  region: string;
  currency: string;
  customDomain: string | null;
  createdAt: Iso;
  seatsActive: number;
  seatLimit: number | null;
  userCount: number;
  owner: { name: string; email: string } | null;
  openTickets: number;
  liveGrant: { id: string; reason: string; operatorLabel: string | null; expiresAt: Iso | null } | null;
  creditsTotalCents: number;
  usage30d: { day: string; activeUsers: number }[];
  /** Phase D — latest score + 90-day history (fold-in #6). */
  health: { score: number | null; grade: string | null; history: { day: string; score: number; grade: string }[] };
}

export interface Usage360 {
  modules: Record<string, number>;
  totals: {
    actions30d: number;
    logins30d: number;
    mutations30d: number;
    seatsActive: number;
    storageBytes: number;
    documentsStored: number;
  };
  /** Rolling distinct-actor windows + seat-utilization trend (§4.1). */
  dau: number;
  wau: number;
  mau: number;
  seatUtilization: { week: string; seats: number; pct: number | null }[];
  recentLogins: { id: string; name: string; email: string; lastLoginAt: Iso | null }[];
}

export interface Billing360 {
  invoices: {
    id: string;
    number: string;
    amountCents: number;
    currency: string;
    status: string;
    source: string;
    issuedAt: Iso;
    paidAt: Iso | null;
    dueAt: Iso | null;
  }[];
  credits: { id: string; amountCents: number; reason: string; expiresAt: Iso | null; createdAt: Iso }[];
  /** Dunning emails the sweep sent this tenant (§4.1 Billing tab). */
  dunningHistory: { at: Iso; stage: number; summary: string }[];
  /** Earliest open invoice due in the future (§4.1 "next invoice"). */
  nextInvoice: { number: string; amountCents: number; currency: string; dueAt: Iso } | null;
}

export interface Support360 {
  openCount: number;
  escalatedOpen: number;
  frtMetPct: number | null;
  csatAvg: number | null;
  csatCount: number;
  tickets: { id: string; title: string; status: string; priority: string; slaState: string; createdAt: Iso }[];
}

export interface TimelineEntryView {
  id: string;
  kind: "note" | "touchpoint" | "audit";
  label: string;
  summary: string;
  actor: string | null;
  at: Iso;
}

export interface Access360 {
  admins: { id: string; name: string; email: string; mfaEnabled: boolean; lastLoginAt: Iso | null; roleName: string }[];
  sso: { id: string; provider: string; enabled: boolean }[];
  grants: { id: string; reason: string; operatorLabel: string | null; expiresAt: Iso | null; revokedAt: Iso | null; createdAt: Iso }[];
  impersonationWindows: { id: string; operatorName: string; reason: string; startedAt: Iso; endedAt: Iso | null }[];
}

const BILLING_TONE: Record<string, "green" | "brand" | "amber" | "red"> = {
  active: "green",
  trial: "brand",
  past_due: "amber",
  cancelled: "red",
};

const INV_TONE: Record<string, "green" | "amber" | "red" | "neutral"> = {
  paid: "green",
  open: "amber",
  uncollectible: "red",
  void: "neutral",
  draft: "neutral",
};

const SLA_TONE: Record<string, "green" | "amber" | "red"> = {
  ok: "green",
  at_risk: "amber",
  due_soon: "amber",
  breached: "red",
};

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function fmtDate(iso: Iso | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function fmtBytes(n: number): string {
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

/** 30-column sparkline of daily active users (fold-in #6 lands here in Phase D). */
function Sparkline({ points }: { points: { day: string; activeUsers: number }[] }) {
  const max = Math.max(1, ...points.map((p) => p.activeUsers));
  if (points.length === 0) return <p className="text-xs text-tertiary">No usage data yet — the rollup job fills this within the hour.</p>;
  return (
    <div className="flex h-10 items-end gap-[2px]" aria-hidden>
      {points.map((p) => (
        <div
          key={p.day}
          className="w-full min-w-[3px] rounded-sm bg-brand-subtle"
          style={{ height: `${Math.max(6, (p.activeUsers / max) * 100)}%` }}
          title={`${p.day}: ${p.activeUsers} active`}
        />
      ))}
    </div>
  );
}

const GRADE_TONE: Record<string, "green" | "amber" | "red"> = { green: "green", yellow: "amber", red: "red" };

/** Phase D fold-in #6 — 90-day health score story next to the grade badge. */
function HealthSparkline({ history }: { history: { day: string; score: number; grade: string }[] }) {
  if (history.length === 0) return <p className="text-xs text-tertiary">No health history yet — the health_rollup job fills this daily.</p>;
  const color = (grade: string) => (grade === "green" ? "#16a34a" : grade === "yellow" ? "#d97706" : "#dc2626");
  return (
    <div className="flex h-10 items-end gap-[2px]" aria-hidden>
      {history.map((h) => (
        <div
          key={h.day}
          className="w-full min-w-[3px] rounded-sm"
          style={{ height: `${Math.max(6, h.score)}%`, background: color(h.grade) }}
          title={`${h.day}: ${h.score} (${h.grade})`}
        />
      ))}
    </div>
  );
}

const TABS = ["Overview", "Usage", "Billing", "Support", "Notes & Timeline", "Access"] as const;
type Tab = (typeof TABS)[number];

export function PlatformTenant360({
  overview,
  usage,
  billing,
  support,
  access,
  timeline,
}: {
  overview: Overview360;
  usage: Usage360 | null;
  billing: Billing360 | null;
  support: Support360 | null;
  access: Access360 | null;
  timeline: TimelineEntryView[];
}) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, init: RequestInit): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(d.error?.message ?? "Action failed");
        return false;
      }
      return true;
    } finally {
      setBusy(false);
    }
  }

  const notes = useMemo(() => timeline.filter((t) => t.kind === "note"), [timeline]);

  function addNote() {
    const body = window.prompt("Note (stored on the tenant's CRM record):");
    if (!body || body.trim().length < 2) return;
    void call(`/api/v1/platform/tenants/${overview.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: body.trim() }),
    }).then(() => window.location.reload());
  }

  function addTouchpoint() {
    const kind = window.prompt("Kind: call, email, meeting or demo", "call");
    if (!kind) return;
    const summary = window.prompt("Summary:");
    if (!summary || summary.trim().length < 2) return;
    void call(`/api/v1/platform/tenants/${overview.id}/touchpoints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: kind.trim().toLowerCase(), summary: summary.trim() }),
    }).then(() => window.location.reload());
  }

  function manualInvoice() {
    const desc = window.prompt("Line item description (e.g. Platform fee — June):");
    if (!desc) return;
    const amountRaw = window.prompt("Amount in dollars (e.g. 120.00):");
    if (!amountRaw) return;
    const dollars = Number(amountRaw.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(dollars) || dollars <= 0) return window.alert("Enter a positive amount.");
    const reason = window.prompt("Reason (stored on the ledger — min 5 chars):");
    if (!reason || reason.trim().length < 5) return;
    void call("/api/v1/platform/billing-ledger?op=create_invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "create_invoice",
        orgId: overview.id,
        currency: overview.currency.slice(0, 3).toUpperCase(),
        lines: [{ desc: desc.trim().slice(0, 300), qty: 1, unitCents: Math.round(dollars * 100) }],
        reason: reason.trim(),
      }),
    }).then(() => window.location.reload());
  }

  function recordPayment() {
    const open = (billing?.invoices ?? []).filter((i) => i.status === "open");
    if (open.length === 0) return window.alert("No open invoices for this tenant.");
    const number = window.prompt(`Open invoices:\n${open.map((i) => `${i.number} — ${money(i.amountCents, i.currency)}`).join("\n")}\n\nInvoice number:`);
    if (!number) return;
    const inv = open.find((i) => i.number.toLowerCase() === number.trim().toLowerCase());
    if (!inv) return window.alert(`No open invoice "${number.trim()}".`);
    void call("/api/v1/platform/billing-ledger?op=record_payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "record_payment", invoiceId: inv.id }),
    }).then(() => window.location.reload());
  }

  function addCredit() {
    const amountRaw = window.prompt("Credit amount in dollars:");
    if (!amountRaw) return;
    const dollars = Number(amountRaw.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(dollars) || dollars <= 0) return window.alert("Enter a positive amount.");
    const reason = window.prompt("Reason (min 5 chars):");
    if (!reason || reason.trim().length < 5) return;
    void call("/api/v1/platform/billing-ledger?op=create_credit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "create_credit", orgId: overview.id, amountCents: Math.round(dollars * 100), reason: reason.trim() }),
    }).then(() => window.location.reload());
  }

  /** §4.1 quick action [Adjust plan] — reason required (fold-in #14). */
  function adjustPlan() {
    const plan = window.prompt("Plan: starter, growth or scale", overview.plan);
    if (!plan) return;
    const p = plan.trim().toLowerCase();
    if (!("starter" === p || "growth" === p || "scale" === p)) return window.alert("Plan must be starter, growth or scale.");
    const status = window.prompt("Billing status: trial, active, past_due or cancelled", overview.billingStatus);
    if (!status) return;
    const s = status.trim().toLowerCase();
    if (!("trial" === s || "active" === s || "past_due" === s || "cancelled" === s)) return window.alert("Invalid billing status.");
    const reason = window.prompt("Reason (min 5 chars — stored on the audit trail):");
    if (!reason || reason.trim().length < 5) return;
    void call(`/api/v1/platform/orgs/${overview.id}/billing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: p, billingStatus: s, reason: reason.trim() }),
    }).then((ok) => {
      if (ok) window.location.reload();
    });
  }

  /** §4.1 quick action [Email tenant] — audited + timeline touchpoint. */
  function emailTenant() {
    const subject = window.prompt("Subject:");
    if (!subject || subject.trim().length < 3) return;
    const body = window.prompt("Message:");
    if (!body || body.trim().length < 3) return;
    void call(`/api/v1/platform/orgs/${overview.id}/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: subject.trim(), body: body.trim() }),
    }).then((ok) => {
      if (ok) window.alert("Email sent — logged on the tenant timeline.");
    });
  }

  /** §4.1 quick action [Suspend] / [Reactivate] — two-person rule for paying tenants. */
  function toggleSuspend() {
    if (overview.status === "suspended") {
      void call(`/api/v1/platform/orgs/${overview.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      }).then((ok) => {
        if (ok) window.location.reload();
      });
      return;
    }
    const reason = window.prompt("Reason for suspension (min 5 chars):");
    if (!reason || reason.trim().length < 5) return;
    void call(`/api/v1/platform/orgs/${overview.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "suspended" }),
    }).then((ok) => {
      if (ok) window.location.reload();
    });
  }

  /** §4.1 quick action [Open window (impersonate)] — deep-links to the ops console flow. */
  function openImpersonation() {
    window.location.href = "/platform#impersonation";
  }



  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-primary">{overview.name}</h1>
              <Badge tone={overview.plan === "scale" ? "brand" : overview.plan === "growth" ? "green" : "neutral"}>{overview.planName}</Badge>
              <Badge tone={BILLING_TONE[overview.billingStatus] ?? "neutral"}>{overview.billingStatus}</Badge>
              <Badge tone={overview.status === "active" ? "green" : "red"}>{overview.status}</Badge>
              {overview.health.grade ? (
                <Badge tone={GRADE_TONE[overview.health.grade] ?? "neutral"}>
                  health {overview.health.score} ({overview.health.grade})
                </Badge>
              ) : null}
              {overview.liveGrant ? <Badge tone="brand">impersonation grant live</Badge> : null}
            </div>
            <p className="mt-1 text-xs text-tertiary">
              /{overview.slug} · {overview.seatsActive}
              {overview.seatLimit !== null ? `/${overview.seatLimit}` : ""} seats · {overview.userCount} users ·{" "}
              {overview.openTickets} open tickets · created {fmtDate(overview.createdAt)}
              {overview.customDomain ? ` · ${overview.customDomain}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy} onClick={openImpersonation} className={`${btn.secondary} ${btn.small}`}>Open window</button>
            <button type="button" disabled={busy} onClick={adjustPlan} className={`${btn.secondary} ${btn.small}`}>Adjust plan</button>
            <button type="button" disabled={busy} onClick={emailTenant} className={`${btn.secondary} ${btn.small}`}>Email tenant</button>
            <button type="button" disabled={busy} onClick={toggleSuspend} className={overview.status === "suspended" ? `${btn.primary} ${btn.small}` : `${btn.secondary} ${btn.small}`}>
              {overview.status === "suspended" ? "Reactivate" : "Suspend"}
            </button>
            <details className="relative">
              <summary className={`${btn.secondary} ${btn.small} inline-block cursor-pointer list-none`}>More ▾</summary>
              <div className="absolute right-0 z-10 mt-1 w-44 rounded-md border border-border-default bg-surface py-1 shadow-lg">
                <button type="button" disabled={busy} onClick={addNote} className="block w-full px-3 py-1.5 text-left text-sm text-secondary hover:bg-surface-hover">Add note</button>
                <button type="button" disabled={busy} onClick={addTouchpoint} className="block w-full px-3 py-1.5 text-left text-sm text-secondary hover:bg-surface-hover">Log touchpoint</button>
                <button type="button" disabled={busy} onClick={manualInvoice} className="block w-full px-3 py-1.5 text-left text-sm text-secondary hover:bg-surface-hover">Manual invoice</button>
                <button type="button" disabled={busy} onClick={recordPayment} className="block w-full px-3 py-1.5 text-left text-sm text-secondary hover:bg-surface-hover">Record payment</button>
                <button type="button" disabled={busy} onClick={addCredit} className="block w-full px-3 py-1.5 text-left text-sm text-secondary hover:bg-surface-hover">Add credit</button>
              </div>
            </details>
          </div>
        </div>
        {error ? <p role="alert" className="border-t border-border-subtle px-5 py-2 text-sm text-danger">{error}</p> : null}
      </Card>

      <div className="flex flex-wrap gap-1 border-b border-border-subtle" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-t-md px-3 py-2 text-sm ${tab === t ? "border-b-2 border-brand font-medium text-brand-text" : "text-tertiary hover:text-secondary"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader title="Profile" subtitle="Identity + lifecycle" />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-5 py-4 text-sm">
              <dt className="text-tertiary">Onboarding</dt>
              <dd className="text-primary">{overview.onboardingState}</dd>
              <dt className="text-tertiary">Owner (admin)</dt>
              <dd className="text-primary">{overview.owner ? `${overview.owner.name} · ${overview.owner.email}` : "—"}</dd>
              <dt className="text-tertiary">Region (tz)</dt>
              <dd className="text-primary">{overview.region}</dd>
              <dt className="text-tertiary">Credits balance</dt>
              <dd className="text-primary">{money(overview.creditsTotalCents, overview.currency)}</dd>
              {overview.trialEndsAt ? (
                <>
                  <dt className="text-tertiary">Trial ends</dt>
                  <dd className="text-primary">{fmtDate(overview.trialEndsAt)}</dd>
                </>
              ) : null}
            </dl>
          </Card>
          <Card>
            <CardHeader title="Active users · 30d" subtitle="Distinct people with an audited action per day" />
            <div className="px-5 py-4">
              <Sparkline points={overview.usage30d} />
            </div>
          </Card>
          <Card className="md:col-span-2">
            <CardHeader
              title={overview.health.score !== null ? `Health score · 90d — ${overview.health.score} (${overview.health.grade})` : "Health score · 90d"}
              subtitle="Recency · adoption · breadth · support · billing — turns the score into a story"
            />
            <div className="px-5 py-4">
              <HealthSparkline history={overview.health.history} />
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "Usage" ? (
        usage ? (
          <div className="space-y-4">
            <Card>
              <CardHeader title="Per-module actions · 30d" subtitle="From audit activity bucketed by feature area" />
              {Object.keys(usage.modules).length === 0 ? (
                <EmptyState title="No module activity in range" />
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {Object.entries(usage.modules)
                    .sort((a, b) => b[1] - a[1])
                    .map(([m, n]) => {
                      const max = Math.max(...Object.values(usage.modules));
                      return (
                        <li key={m} className="flex items-center gap-3 px-5 py-2 text-sm">
                          <span className="w-32 shrink-0 capitalize text-secondary">{m}</span>
                          <div className="h-2 flex-1 rounded-full bg-surface-subtle">
                            <div className="h-2 rounded-full bg-brand" style={{ width: `${Math.max(2, (n / max) * 100)}%` }} />
                          </div>
                          <span className="w-12 text-right tabular-nums text-primary">{n}</span>
                        </li>
                      );
                    })}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Counters · 30d" subtitle="DAU/WAU/MAU, actions, logins, API mutations, storage, seat utilization" />
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-5 py-4 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-tertiary">DAU / WAU / MAU</dt><dd className="text-lg font-semibold tabular-nums text-primary">{usage.dau} / {usage.wau} / {usage.mau}</dd></div>
                <div><dt className="text-xs text-tertiary">Actions</dt><dd className="text-lg font-semibold tabular-nums text-primary">{usage.totals.actions30d}</dd></div>
                <div><dt className="text-xs text-tertiary">Logins</dt><dd className="text-lg font-semibold tabular-nums text-primary">{usage.totals.logins30d}</dd></div>
                <div><dt className="text-xs text-tertiary">API mutations</dt><dd className="text-lg font-semibold tabular-nums text-primary">{usage.totals.mutations30d}</dd></div>
                <div><dt className="text-xs text-tertiary">Storage</dt><dd className="text-lg font-semibold tabular-nums text-primary">{fmtBytes(usage.totals.storageBytes)} <span className="text-xs font-normal text-tertiary">({usage.totals.documentsStored} docs)</span></dd></div>
                <div><dt className="text-xs text-tertiary">Seats</dt><dd className="text-lg font-semibold tabular-nums text-primary">{usage.totals.seatsActive}</dd></div>
              </dl>
              {usage.seatUtilization.length > 0 ? (
                <div className="border-t border-border-subtle px-5 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-tertiary">Seat utilization · 8w{overview.seatLimit !== null ? ` (cap ${overview.seatLimit})` : ""}</p>
                  <div className="mt-2 flex items-end gap-1" aria-hidden>
                    {usage.seatUtilization.map((s) => (
                      <div key={s.week} className="w-full min-w-[16px] rounded-sm bg-brand" style={{ height: `${s.pct === null ? 20 : Math.max(4, s.pct)}%` }} title={`${s.week}: ${s.seats} seats${s.pct !== null ? ` (${s.pct}%)` : ""}`} />
                    ))}
                  </div>
                </div>
              ) : null}
            </Card>
            <Card>
              <CardHeader title="Last 10 logins" subtitle="Most recent per user" />
              <ul className="divide-y divide-border-subtle">
                {usage.recentLogins.map((u) => (
                  <li key={u.id} className="flex items-center justify-between px-5 py-2 text-sm">
                    <span className="text-primary">{u.name} <span className="text-tertiary">· {u.email}</span></span>
                    <span className="text-xs text-tertiary">{u.lastLoginAt ? fmtDate(u.lastLoginAt) : "never"}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        ) : (
          <Card><EmptyState title="Usage unavailable" hint="The usage_rollup job has not produced data for this tenant yet." /></Card>
        )
      ) : null}

      {tab === "Billing" ? (
        billing ? (
          <div className="space-y-4">
            {billing.nextInvoice ? (
              <Card>
                <CardHeader title="Next invoice" subtitle="Earliest open invoice due in the future" />
                <p className="px-5 py-3 text-sm text-primary">
                  <span className="font-mono text-xs">{billing.nextInvoice.number}</span> — {money(billing.nextInvoice.amountCents, billing.nextInvoice.currency)} due {fmtDate(billing.nextInvoice.dueAt)}
                </p>
              </Card>
            ) : null}
            <Card>
            <CardHeader title="Invoices" subtitle="Unified ledger — Paddle mirrors + manual invoices · open a row to print/archive a PDF" />
            {billing.invoices.length === 0 ? (
              <EmptyState title="No invoices" hint="Use Manual invoice for enterprise deals and comp months." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border-default">
                      <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-tertiary">Number</th>
                      <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-tertiary">Amount</th>
                      <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-tertiary">Source</th>
                      <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-tertiary">Status</th>
                      <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-tertiary">Issued</th>
                      <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-tertiary">Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billing.invoices.map((i) => (
                      <tr key={i.id} className="border-b border-border-subtle">
                        <td className="px-4 py-2 font-mono text-xs text-primary">
                          <a href={`/api/v1/platform/invoices/${i.id}/pdf?render=1`} target="_blank" rel="noopener noreferrer" className="hover:underline" title="Open print view (archive via ⌘P → Save as PDF)">
                            {i.number}
                          </a>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-primary">{money(i.amountCents, i.currency)}</td>
                        <td className="px-3 py-2"><Badge tone={i.source === "paddle" ? "brand" : "neutral"}>{i.source}</Badge></td>
                        <td className="px-3 py-2"><Badge tone={INV_TONE[i.status] ?? "neutral"}>{i.status}</Badge></td>
                        <td className="px-3 py-2 text-xs text-tertiary">{fmtDate(i.issuedAt)}</td>
                        <td className="px-3 py-2 text-xs text-tertiary">{fmtDate(i.paidAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {billing.credits.length > 0 ? (
              <div className="border-t border-border-subtle px-5 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-tertiary">Credits</p>
                <ul className="mt-2 divide-y divide-border-subtle">
                  {billing.credits.map((c) => (
                    <li key={c.id} className="flex items-center justify-between py-1.5 text-sm">
                      <span className="text-secondary">{c.reason}</span>
                      <span className="tabular-nums text-primary">−{money(c.amountCents, "USD")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            </Card>
            {billing.dunningHistory.length > 0 ? (
              <Card>
                <CardHeader title="Dunning history" subtitle="Payment-reminder emails sent by the sweep (system touchpoints)" />
                <ul className="divide-y divide-border-subtle">
                  {billing.dunningHistory.map((d, idx) => (
                    <li key={`${d.at}-${idx}`} className="flex items-center justify-between px-5 py-2 text-sm">
                      <span className="text-secondary">{d.summary}</span>
                      <span className="text-xs text-tertiary">stage {d.stage} · {fmtDate(d.at)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>
        ) : (
          <Card><EmptyState title="Billing unavailable" /></Card>
        )
      ) : null}

      {tab === "Support" ? (
        support ? (
          <Card>
            <CardHeader title="Support health · 90d" subtitle="Open tickets, first-response compliance, CSAT" />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-5 py-4 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-tertiary">Open tickets</dt><dd className="text-lg font-semibold text-primary">{support.openCount}</dd></div>
              <div><dt className="text-xs text-tertiary">Escalated to platform</dt><dd className="text-lg font-semibold text-primary">{support.escalatedOpen}</dd></div>
              <div><dt className="text-xs text-tertiary">FRT met</dt><dd className="text-lg font-semibold text-primary">{support.frtMetPct === null ? "—" : `${support.frtMetPct}%`}</dd></div>
              <div><dt className="text-xs text-tertiary">CSAT avg</dt><dd className="text-lg font-semibold text-primary">{support.csatAvg === null ? "—" : `${support.csatAvg} (${support.csatCount})`}</dd></div>
            </dl>
            {support.tickets.length > 0 ? (
              <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                {support.tickets.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 px-5 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-primary">{t.title}</span>
                    <Badge tone={t.priority === "urgent" ? "red" : t.priority === "high" ? "amber" : "neutral"}>{t.priority}</Badge>
                    <Badge tone={SLA_TONE[t.slaState] ?? "neutral"}>{t.slaState}</Badge>
                    <span className="text-xs text-tertiary">{fmtDate(t.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="border-t border-border-subtle"><EmptyState title="No open tickets" /></div>
            )}
          </Card>
        ) : (
          <Card><EmptyState title="Support data unavailable" /></Card>
        )
      ) : null}

      {tab === "Notes & Timeline" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Merged timeline"
              subtitle="Notes · touchpoints · plan changes · impersonation · broadcasts · status changes"
            />
            {timeline.length === 0 ? (
              <EmptyState title="Timeline is empty" hint="Add a note or log a touchpoint to start the record." />
            ) : (
              <ol className="divide-y divide-border-subtle">
                {timeline.map((e) => (
                  <li key={`${e.kind}-${e.id}`} className="flex gap-3 px-5 py-2.5 text-sm">
                    <span className="mt-0.5 shrink-0">
                      {e.kind === "note" ? "📝" : e.kind === "touchpoint" ? "📞" : "⚙️"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-primary">{e.summary}</span>
                      <span className="ml-2 text-xs text-tertiary">
                        {e.label} · {e.actor ?? "—"} · {new Date(e.at).toLocaleString()}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          {notes.length > 0 ? (
            <Card>
              <CardHeader title={`Operator notes (${notes.length})`} subtitle="Panel-only — tenants never see these" />
              <ul className="divide-y divide-border-subtle">
                {notes.map((n) => (
                  <li key={n.id} className="px-5 py-2 text-sm text-secondary">
                    {n.summary}
                    <span className="ml-2 text-xs text-tertiary">{n.actor} · {fmtDate(n.at)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "Access" ? (
        access ? (
          <div className="space-y-4">
            <Card>
              <CardHeader title="Admins" subtitle="Tenant admin role holders + MFA status" />
              <ul className="divide-y divide-border-subtle">
                {access.admins.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2 text-sm">
                    <span className="text-primary">{a.name} <span className="text-tertiary">· {a.email}</span></span>
                    <span className="flex items-center gap-2">
                      <Badge tone={a.mfaEnabled ? "green" : "amber"}>{a.mfaEnabled ? "MFA on" : "MFA off"}</Badge>
                      <span className="text-xs text-tertiary">{a.lastLoginAt ? `last login ${fmtDate(a.lastLoginAt)}` : "never logged in"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title="SSO & grants" subtitle="Configured SSO + impersonation consent grants" />
              <div className="px-5 py-3 text-sm">
                {access.sso.length === 0 ? (
                  <p className="text-tertiary">No SSO configured.</p>
                ) : (
                  access.sso.map((s) => (
                    <p key={s.id} className="flex items-center gap-2">
                      <span className="text-primary">{s.provider}</span>
                      <Badge tone={s.enabled ? "green" : "neutral"}>{s.enabled ? "enabled" : "disabled"}</Badge>
                    </p>
                  ))
                )}
              </div>
              {access.grants.length > 0 ? (
                <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                  {access.grants.map((g) => (
                    <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate text-secondary">{g.reason}</span>
                      <Badge tone={g.revokedAt ? "neutral" : g.expiresAt && new Date(g.expiresAt).getTime() > Date.now() ? "brand" : "neutral"}>
                        {g.revokedAt ? "revoked" : g.expiresAt && new Date(g.expiresAt).getTime() > Date.now() ? "live" : "expired"}
                      </Badge>
                      <span className="text-xs text-tertiary">until {fmtDate(g.expiresAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
            {access.impersonationWindows.length > 0 ? (
              <Card>
                <CardHeader title="Impersonation windows" subtitle="Audited support sessions" />
                <ul className="divide-y divide-border-subtle">
                  {access.impersonationWindows.map((w) => (
                    <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate text-secondary">{w.reason}</span>
                      <span className="text-xs text-tertiary">{w.operatorName} · {fmtDate(w.startedAt)}{w.endedAt ? ` → ${fmtDate(w.endedAt)}` : " · live"}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>
        ) : (
          <Card><EmptyState title="Access data unavailable" /></Card>
        )
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Global tenant search (fold-in #8) — ⌘K dialog, mount once on the console.
// ---------------------------------------------------------------------------

interface SearchHit {
  type: "tenant" | "admin" | "invoice";
  id: string;
  title: string;
  subtitle: string;
}

export function PlatformTenantSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      void fetch(`/api/v1/platform/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((d: { results?: SearchHit[] }) => setHits(d.results ?? []))
        .catch(() => setHits([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-modal,50)] flex items-start justify-center bg-black/30 pt-24" onClick={() => setOpen(false)}>
      <div ref={dialogRef} className="w-full max-w-lg rounded-lg border border-border-default bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tenants, admin emails, invoice numbers…"
          className={input}
          aria-label="Global tenant search"
        />
        <ul className="max-h-80 divide-y divide-border-subtle overflow-y-auto">
          {hits.map((h) => (
            <li key={`${h.type}-${h.id}`}>
              <a
                href={h.type === "tenant" ? `/platform/tenants/${h.id}` : h.type === "invoice" && h.id ? `/platform/tenants/${h.id}` : "#"}
                className="block px-4 py-2 text-sm hover:bg-surface-hover"
                onClick={() => setOpen(false)}
              >
                <span className="font-medium text-primary">{h.title}</span>
                <span className="ml-2 text-xs text-tertiary">{h.subtitle}</span>
                <span className="ml-2 rounded bg-surface-subtle px-1.5 text-[10px] uppercase text-tertiary">{h.type}</span>
              </a>
            </li>
          ))}
          {q.trim().length >= 2 && hits.length === 0 ? <li className="px-4 py-3 text-sm text-tertiary">No matches.</li> : null}
        </ul>
      </div>
    </div>
  );
}
