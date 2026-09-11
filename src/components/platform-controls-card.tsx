"use client";

import { useEffect, useState } from "react";

import { Badge, Card, CardHeader, EmptyState, btn, input } from "./ui";

/**
 * Admin panel Phase F — Controls tab: per-tenant entitlements (§3.4), the
 * platform-team operator roles (§3.7), saved views (fold-in #9) and the
 * panel density toggle (fold-in #11). Entitlement edits are admin-level and
 * audited; the 60 s cache contract means a kill-switch lands fleet-wide
 * within a minute.
 */

interface TenantOption {
  id: string;
  name: string;
}

interface OperatorRow {
  userId: string;
  role: "viewer" | "operator" | "admin";
  name: string;
  email: string;
  createdAt: string;
}

interface EntitlementRow {
  key: string;
  value: string;
  updatedAt: string;
}

const LEVELS = ["viewer", "operator", "admin"] as const;

const DENSITY_KEY = "wamiro-panel-density";

function useDensity() {
  const [dense, setDense] = useState(false);
  useEffect(() => {
    setDense(localStorage.getItem(DENSITY_KEY) === "dense");
  }, []);
  function toggle() {
    const next = !dense;
    setDense(next);
    localStorage.setItem(DENSITY_KEY, next ? "dense" : "cozy");
    document.documentElement.dataset.panelDensity = next ? "dense" : "cozy";
  }
  return { dense, toggle };
}

/**
 * Fold-in #9 — saved filter combos per operator, persisted SERVER-SIDE
 * (platform.panel_saved_views) so views survive devices and are per-operator
 * by construction.
 */
function SavedViews() {
  const [views, setViews] = useState<{ id: string; name: string; query: string }[]>([]);
  const [label, setLabel] = useState("");

  useEffect(() => {
    void fetch("/api/v1/platform/saved-views")
      .then((r) => (r.ok ? r.json() : { views: [] }))
      .then((d: { views?: { id: string; name: string; query: string }[] }) => setViews(d.views ?? []))
      .catch(() => setViews([]));
  }, []);

  function save() {
    const q = window.prompt("Filter expression (e.g. plan=growth status=trial):");
    if (!q || !q.trim()) return;
    void fetch("/api/v1/platform/saved-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: label.trim() || q.trim().slice(0, 24), query: q.trim() }),
    }).then((r) => {
      if (r.ok) window.location.reload();
    });
  }

  function remove(id: string) {
    void fetch(`/api/v1/platform/saved-views?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => {
      if (r.ok) setViews(views.filter((v) => v.id !== id));
    });
  }

  return (
    <Card>
      <CardHeader title="Saved views" subtitle="Persisted per operator, server-side — one click back to a weekly ritual filter (fold-in #9)" />
      <div className="flex flex-wrap items-center gap-2 px-5 py-3">
        {views.length === 0 ? <span className="text-xs text-tertiary">No saved views yet — save a filter expression like plan=growth status=trial.</span> : null}
        {views.map((v) => (
          <span key={v.id} className="inline-flex items-center gap-1 rounded-full bg-surface-subtle px-2 py-0.5 text-xs" title={v.query}>
            <button
              type="button"
              className="text-secondary hover:text-primary"
              onClick={() => {
                void navigator.clipboard?.writeText(v.query);
                window.alert(`View "${v.name}"\n\nFilter: ${v.query}\n\nCopied to clipboard — apply it on the tenant list.`);
              }}
            >
              {v.name}
            </button>
            <button type="button" aria-label={`Delete ${v.name}`} className="text-tertiary hover:text-danger" onClick={() => remove(v.id)}>
              ×
            </button>
          </span>
        ))}
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Save current filter as…"
          className={`${input} ml-auto h-8 w-48 py-1 text-xs`}
        />
        <button type="button" className={`${btn.secondary} ${btn.small}`} onClick={save}>
          Save
        </button>
      </div>
    </Card>
  );
}

/**
 * Fold-in #3 — contract registry management: enterprise deals bought outside
 * Paddle (annual value, PO number, auto-renew, card/bank) become first-class
 * revenue and feed the §4.2 renewal forecast.
 */
function ContractsCard({ tenants, canEdit }: { tenants: TenantOption[]; canEdit: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      return true;
    } finally {
      setBusy(false);
    }
  }

  function addContract() {
    if (tenants.length === 0) return window.alert("No tenants.");
    const org = window.prompt(`Tenant name (one of: ${tenants.slice(0, 8).map((t) => t.name).join(", ")}${tenants.length > 8 ? ", …" : ""})`);
    if (!org) return;
    const match = tenants.find((t) => t.name.toLowerCase() === org.trim().toLowerCase());
    if (!match) return window.alert(`No tenant named "${org.trim()}".`);
    const start = window.prompt("Start date (YYYY-MM-DD):", new Date().toISOString().slice(0, 10));
    if (!start) return;
    const end = window.prompt("End date (YYYY-MM-DD, blank = evergreen):");
    const valueRaw = window.prompt("Annual value in dollars (e.g. 12000.00):");
    if (!valueRaw) return;
    const dollars = Number(valueRaw.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(dollars) || dollars < 0) return window.alert("Enter a valid amount.");
    const po = window.prompt("PO number (optional):") ?? "";
    const method = (window.prompt("Payment method: card or bank", "bank") ?? "bank").trim().toLowerCase();
    const autoRenew = window.confirm("Auto-renew at term end?");
    void call("/api/v1/platform/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgId: match.id,
        startDate: start.trim(),
        endDate: end && end.trim() ? end.trim() : null,
        annualValueCents: Math.round(dollars * 100),
        poNumber: po.trim() || null,
        autoRenew,
        paymentMethod: method === "card" ? "card" : "bank",
      }),
    }).then((ok) => {
      if (ok) window.location.reload();
    });
  }

  function toggleAutoRenew(id: string, current: boolean) {
    void call("/api/v1/platform/contracts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, autoRenew: !current }),
    }).then((ok) => {
      if (ok) window.location.reload();
    });
  }

  return (
    <Card>
      <CardHeader
        title="Contract registry"
        subtitle="Enterprise deals outside Paddle — annual value, PO, auto-renew, card/bank (fold-in #3). Feeds the renewal forecast."
        action={
          <button type="button" disabled={busy || !canEdit} onClick={addContract} className={`${btn.primary} ${btn.small}`}>
            Add contract
          </button>
        }
      />
      <ContractRows onToggle={toggleAutoRenew} busy={busy} />
      {error ? <p role="alert" className="border-t border-border-subtle px-5 py-2 text-sm text-danger">{error}</p> : null}
    </Card>
  );
}

function ContractRows({ onToggle, busy }: { onToggle: (id: string, current: boolean) => void; busy: boolean }) {
  const [rows, setRows] = useState<{
    id: string; orgId: string | null; orgName: string; startDate: string; endDate: string | null;
    annualValueCents: number; currency: string; poNumber: string | null; autoRenew: boolean; paymentMethod: string;
  }[]>([]);

  useEffect(() => {
    void fetch("/api/v1/platform/contracts")
      .then((r) => (r.ok ? r.json() : { contracts: [] }))
      .then((d) => setRows(d.contracts ?? []))
      .catch(() => setRows([]));
  }, []);

  function money(cents: number, currency: string): string {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
    } catch {
      return `${(cents / 100).toFixed(0)} ${currency}`;
    }
  }

  if (rows.length === 0) {
    return <EmptyState title="No contracts registered" hint="Register annual/bank-transfer deals so the renewal forecast sees them." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border-default">
            <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-tertiary">Tenant</th>
            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-tertiary">Term</th>
            <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-tertiary">Annual</th>
            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-tertiary">PO</th>
            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-tertiary">Method</th>
            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-tertiary">Renewal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-b border-border-subtle">
              <td className="px-4 py-2">
                {c.orgId ? (
                  <a href={`/platform/tenants/${c.orgId}`} className="font-medium text-primary hover:underline">{c.orgName}</a>
                ) : (
                  <span className="text-tertiary">{c.orgName} (deleted)</span>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-secondary">
                {c.startDate} → {c.endDate ?? "evergreen"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-primary">{money(c.annualValueCents, c.currency)}</td>
              <td className="px-3 py-2 text-xs text-tertiary">{c.poNumber ?? "—"}</td>
              <td className="px-3 py-2"><Badge tone="neutral">{c.paymentMethod}</Badge></td>
              <td className="px-3 py-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onToggle(c.id, c.autoRenew)}
                  className={`rounded-full px-2 py-0.5 text-xs ${c.autoRenew ? "bg-brand-subtle font-medium text-brand-text" : "text-tertiary hover:text-secondary"}`}
                >
                  {c.autoRenew ? "auto-renew" : "manual"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PlatformControlsCard({
  tenants,
  operators,
  myLevel,
}: {
  tenants: TenantOption[];
  operators: OperatorRow[];
  myLevel: "viewer" | "operator" | "admin";
  myUserId?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<string>(tenants[0]?.id ?? "");
  const [entitlements, setEntitlements] = useState<EntitlementRow[]>([]);
  const { dense, toggle } = useDensity();
  const isAdmin = myLevel === "admin";

  useEffect(() => {
    if (!selectedOrg) return;
    setEntitlements([]);
    void fetch(`/api/v1/platform/entitlements?orgId=${selectedOrg}`)
      .then((r) => (r.ok ? r.json() : { entitlements: [] }))
      .then((d: { entitlements?: EntitlementRow[] }) => setEntitlements(d.entitlements ?? []))
      .catch(() => setEntitlements([]));
  }, [selectedOrg]);

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
      return true;
    } finally {
      setBusy(false);
    }
  }

  function setKey() {
    const key = window.prompt("Entitlement key (module.<name>, flag.<name>, cap.seats, limit.api_per_min):");
    if (!key) return;
    const value = window.prompt("Value ('on'/'off' for module/flag keys, a number for cap/limit keys):");
    if (!value) return;
    void call("/api/v1/platform/entitlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: selectedOrg, key: key.trim(), value: value.trim() }),
    }).then((ok) => {
      if (ok) window.location.reload();
    });
  }

  function clearKey(key: string) {
    if (!window.confirm(`Clear ${key}? The tenant default applies again within 60s.`)) return;
    void call("/api/v1/platform/entitlements", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: selectedOrg, key }),
    }).then((ok) => {
      if (ok) window.location.reload();
    });
  }

  function setRole(userId: string, role: string) {
    void call("/api/v1/platform/operators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    }).then((ok) => {
      if (ok) window.location.reload();
    });
  }

  const selectedName = tenants.find((t) => t.id === selectedOrg)?.name ?? "";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Your panel preferences"
          subtitle={`Your platform role: ${myLevel} — operators live in this console for hours (fold-in #11)`}
          action={
            <button type="button" onClick={toggle} className={`${btn.secondary} ${btn.small}`}>
              Density: {dense ? "dense" : "cozy"}
            </button>
          }
        />
      </Card>

      <SavedViews />

      <ContractsCard tenants={tenants} canEdit={myLevel !== "viewer"} />

      <Card>
        <CardHeader
          title="Tenant entitlements"
          subtitle="module.* kill-switches · cap.seats · limit.api_per_min · flag.* — takes effect ≤60s (cache contract)"
          action={
            <div className="flex items-center gap-2">
              <select
                value={selectedOrg}
                onChange={(e) => setSelectedOrg(e.target.value)}
                className="h-8 rounded-md border border-border-default bg-surface px-2 text-xs text-primary"
                aria-label="Tenant"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button type="button" disabled={busy || !isAdmin || !selectedOrg} onClick={setKey} className={`${btn.primary} ${btn.small}`}>
                Add / set
              </button>
            </div>
          }
        />
        {!isAdmin ? (
          <p className="px-5 py-3 text-sm text-tertiary">Only platform admins can edit entitlements (your role: {myLevel}).</p>
        ) : entitlements.length === 0 ? (
          <EmptyState title={selectedName ? `No overrides for ${selectedName}` : "Select a tenant"} hint="Tenants run on their own plan + module settings until an entitlement is set." />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {entitlements.map((e) => (
              <li key={e.key} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <span className="font-mono text-xs text-primary">{e.key}</span>
                <span className="flex items-center gap-3">
                  <Badge tone={e.value === "off" ? "red" : "neutral"}>{e.value}</Badge>
                  <span className="text-xs text-tertiary">{new Date(e.updatedAt).toLocaleString()}</span>
                  <button type="button" disabled={busy} onClick={() => clearKey(e.key)} className="text-xs text-danger hover:underline">
                    Clear
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title={`Platform team (${operators.length})`} subtitle="viewer = read-only · operator = can act · admin = manage operators + entitlements" />
        {operators.length === 0 ? (
          <EmptyState title="No operator rows" hint="Existing platform.admin holders are bootstrapped to 'admin' by migration 0065." />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {operators.map((o) => (
              <li key={o.userId} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                <span>
                  <span className="font-medium text-primary">{o.name}</span>
                  <span className="ml-2 text-xs text-tertiary">{o.email}</span>
                </span>
                <span className="flex items-center gap-2">
                  {LEVELS.map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      disabled={busy || !isAdmin || o.role === lvl}
                      onClick={() => setRole(o.userId, lvl)}
                      className={o.role === lvl ? "rounded-full bg-brand-subtle px-2 py-0.5 text-xs font-medium text-brand-text" : "rounded-full px-2 py-0.5 text-xs text-tertiary hover:text-secondary"}
                    >
                      {lvl}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
        {error ? <p role="alert" className="border-t border-border-subtle px-5 py-2 text-sm text-danger">{error}</p> : null}
      </Card>
    </div>
  );
}
