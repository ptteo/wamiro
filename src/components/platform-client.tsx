"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Card, CardHeader, EmptyState, btn } from "./ui";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  plan: string;
  billingStatus: string;
  trialEndsAt: string | null;
  seatLimit: number | null;
  seatCount: number;
  userCount: number;
  lastActiveAt: string | null;
  createdAt: string;
}

interface Stats {
  totalTenants: number;
  activeSeats: number;
  byPlan: { plan: string; count: number }[];
  trialsEndingSoon: number;
  usersActive7d: number;
  companiesActive7d: number;
}

const BILLING_TONE: Record<string, "green" | "brand" | "amber" | "red"> = {
  active: "green",
  trial: "brand",
  past_due: "amber",
  cancelled: "red",
};

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const m = Math.floor((Date.now() - t) / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  return `${d}d ago`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-tertiary">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-primary">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-tertiary">{hint}</p> : null}
    </div>
  );
}

export function PlatformClient({
  tenants,
  stats,
  selfOrgId,
}: {
  tenants: Tenant[];
  stats: Stats;
  selfOrgId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, fn: () => Promise<Response>) {
    setBusy(id);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Action failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  function setStatus(t: Tenant, status: "active" | "suspended") {
    void act(t.id, () =>
      fetch(`/api/v1/platform/orgs/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    );
  }

  function setPlan(t: Tenant, plan: string) {
    void act(t.id, () =>
      fetch(`/api/v1/platform/orgs/${t.id}/billing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      }),
    );
  }

  function grantTrial(t: Tenant) {
    void act(t.id, () =>
      fetch(`/api/v1/platform/orgs/${t.id}/billing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "growth" }),
      }),
    );
  }

  function cancelSubscription(t: Tenant) {
    if (!confirm(`Cancel ${t.name}'s subscription? All users will lose access until reactivated.`)) return;
    void act(t.id, () => fetch(`/api/v1/platform/orgs/${t.id}/billing`, { method: "DELETE" }));
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Active tenants" value={String(stats.totalTenants)} />
        <Stat label="Active seats" value={String(stats.activeSeats)} hint="Across all tenants" />
        <Stat
          label="Companies active · 7d"
          value={`${stats.companiesActive7d} / ${stats.totalTenants}`}
          hint="Activation north-star"
        />
        <Stat
          label="Users active · 7d"
          value={String(stats.usersActive7d)}
          hint="Distinct signed-in users"
        />
        <Stat
          label="By plan"
          value={stats.byPlan.map((p) => `${p.plan} ${p.count}`).join(" · ") || "—"}
        />
        <Stat
          label="Trials ending ≤7d"
          value={String(stats.trialsEndingSoon)}
          hint="Chase these before they lapse"
        />
      </div>

      <Card>
        <CardHeader title={`Tenants (${tenants.length})`} subtitle="Subscription lifecycle + access controls per tenant." />
        {tenants.length === 0 ? (
          <EmptyState title="No tenants registered" />
        ) : (
          <ul className="divide-y divide-border-default">
            {tenants.map((t) => {
              const effectiveSeats = t.seatLimit ?? { starter: 10, growth: 50, scale: null }[t.plan] ?? null;
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-primary">
                      {t.name}
                      {t.id === selfOrgId && <span className="ml-2 text-xs font-normal text-tertiary">(you)</span>}
                    </p>
                    <p className="text-xs text-tertiary">
                      /{t.slug} · {t.userCount} users · {t.seatCount} seats
                      {effectiveSeats !== null ? ` / ${effectiveSeats} limit` : ""} · joined{" "}
                      {new Date(t.createdAt).toLocaleDateString()}
                      {t.billingStatus === "trial" && t.trialEndsAt
                        ? ` · trial ends ${new Date(t.trialEndsAt).toLocaleDateString()}`
                        : ""}
                      {t.lastActiveAt
                        ? ` · last active ${timeAgo(t.lastActiveAt)}`
                        : " · never active"}
                    </p>
                  </div>

                  <Badge tone={t.status === "active" ? "green" : "red"}>{t.status}</Badge>
                  <select
                    value={t.plan}
                    disabled={busy === t.id || t.id === selfOrgId}
                    onChange={(e) => setPlan(t, e.target.value)}
                    className="h-8 rounded-md border border-border-default bg-surface px-2 text-xs text-primary"
                    aria-label={`Plan for ${t.name}`}
                  >
                    <option value="starter">starter</option>
                    <option value="growth">growth</option>
                    <option value="scale">scale</option>
                  </select>
                  <Badge tone={BILLING_TONE[t.billingStatus] ?? "neutral"}>{t.billingStatus}</Badge>

                  {t.id !== selfOrgId && (
                    <span className="flex items-center gap-1.5">
                      {t.billingStatus === "trial" || t.plan === "growth" ? null : (
                        <button
                          type="button"
                          disabled={busy === t.id}
                          onClick={() => grantTrial(t)}
                          className={`${btn.secondary} ${btn.small}`}
                        >
                          Grant trial
                        </button>
                      )}
                      {t.billingStatus !== "cancelled" && (
                        <button
                          type="button"
                          disabled={busy === t.id}
                          onClick={() => cancelSubscription(t)}
                          className="text-xs text-danger hover:underline disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy === t.id}
                        onClick={() =>
                          void act(t.id, () =>
                            fetch("/api/v1/platform/onboarding", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ organizationId: t.id }),
                            }),
                          )
                        }
                        className="text-xs text-secondary hover:underline disabled:opacity-50"
                      >
                        Force-complete setup
                      </button>
                      <button
                        type="button"
                        disabled={busy === t.id}
                        onClick={() => setStatus(t, t.status === "active" ? "suspended" : "active")}
                        className="rounded-md border border-border-default bg-surface px-2 py-1 text-xs font-medium text-secondary transition hover:bg-surface-hover disabled:opacity-50"
                      >
                        {t.status === "active" ? "Suspend" : "Reactivate"}
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {error ? (
          <p role="alert" className="px-5 pb-4 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </Card>
    </div>
  );
}