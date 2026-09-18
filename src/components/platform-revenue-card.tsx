"use client";

import { Badge, Card, CardHeader, EmptyState } from "./ui";

/**
 * Admin panel Phase E — Revenue (§4.2): KPI cards, MRR movement waterfall,
 * invoice aging, renewal forecast. CSV export on every table via the audited
 * platform export endpoint (fold-in #5).
 */

export interface KpisView {
  collectedCents: number;
  collected30dCents: number;
  mrrCents: number;
  arpaCents: number | null;
  activeTrials: number;
  trialConversionPct: number | null;
  churnedMrrCents: number;
  churnedLogos: number;
  atRiskMrrCents: number;
  atRiskOrgs: number;
  nrrProxyPct: number | null;
}

export interface WaterfallView {
  month: string;
  newCents: number;
  expansionCents: number;
  contractionCents: number;
  churnCents: number;
  netCents: number;
}

export interface AgingView {
  invoiceId: string;
  number: string;
  orgId: string | null;
  orgName: string;
  amountCents: number;
  currency: string;
  ageDays: number;
  overdue: boolean;
}

export interface RenewalView {
  orgId: string;
  orgName: string;
  kind: "trial" | "manual_invoice" | "contract";
  dueAt: string;
  amountCents: number;
  autoRenew?: boolean;
}

export interface ChurnReasonView {
  reason: string;
  logos: number;
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function exportUrl(dataset: string): string {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  // fold-in #5 — the operator supplies the reason; it is audited server-side.
  return `/api/v1/platform/export/${dataset}?from=${from}&to=${to}`;
}

function Waterfall({ data }: { data: WaterfallView[] }) {
  if (data.length === 0) return <EmptyState title="Not enough snapshot history yet" hint="The waterfall appears after the usage rollup has run across a month boundary." />;
  const max = Math.max(1, ...data.map((m) => Math.max(m.newCents + m.expansionCents, m.contractionCents + m.churnCents)));
  return (
    <div className="space-y-3 px-5 py-4">
      {data.map((m) => (
        <div key={m.month}>
          <div className="flex items-center justify-between text-xs text-tertiary">
            <span className="font-medium text-secondary">{m.month}</span>
            <span>
              net{" "}
              <span className={m.netCents >= 0 ? "text-success" : "text-danger"}>
                {m.netCents >= 0 ? "+" : "−"}
                {money(Math.abs(m.netCents))}
              </span>
            </span>
          </div>
          <div className="mt-1 flex h-3 overflow-hidden rounded-full bg-surface-subtle" aria-hidden>
            <div className="h-3 bg-success" style={{ width: `${(m.newCents / max) * 100}%` }} title={`new ${money(m.newCents)}`} />
            <div className="h-3 bg-brand" style={{ width: `${(m.expansionCents / max) * 100}%` }} title={`expansion ${money(m.expansionCents)}`} />
            <div className="h-3 bg-warning/60" style={{ width: `${(m.contractionCents / max) * 100}%` }} title={`contraction ${money(m.contractionCents)}`} />
            <div className="h-3 bg-danger" style={{ width: `${(m.churnCents / max) * 100}%` }} title={`churn ${money(m.churnCents)}`} />
          </div>
          <div className="mt-0.5 flex gap-3 text-[11px] text-tertiary">
            <span>new {money(m.newCents)}</span>
            <span>exp {money(m.expansionCents)}</span>
            <span>con {money(m.contractionCents)}</span>
            <span>churn {money(m.churnCents)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PlatformRevenueCard({
  kpis,
  waterfall,
  aging,
  renewals,
  churnReasons,
}: {
  kpis: KpisView;
  waterfall: WaterfallView[];
  aging: AgingView[];
  renewals: RenewalView[];
  churnReasons: ChurnReasonView[];
}) {
  const kpiCards: { label: string; value: string; hint?: string; tone?: "red" | "amber" | "green" }[] = [
    { label: "Collected (all time)", value: money(kpis.collectedCents), hint: `last 30d ${money(kpis.collected30dCents)}`, tone: "green" },
    { label: "MRR (forward-looking)", value: money(kpis.mrrCents), hint: "seats × price snapshots — ledger wins on conflict" },
    { label: "ARPA", value: kpis.arpaCents === null ? "—" : money(kpis.arpaCents), hint: "MRR ÷ paid orgs" },
    { label: "Active trials", value: String(kpis.activeTrials) },
    {
      label: "Trial → paid (30d)",
      value: kpis.trialConversionPct === null ? "—" : `${kpis.trialConversionPct}%`,
      hint: "converted ÷ ended",
    },
    { label: "Churned MRR (30d)", value: money(kpis.churnedMrrCents), hint: `cancellations only · ${kpis.churnedLogos} logo${kpis.churnedLogos === 1 ? "" : "s"}`, tone: kpis.churnedMrrCents > 0 ? "red" : undefined },
    {
      label: "At-risk MRR",
      value: money(kpis.atRiskMrrCents),
      hint: `${kpis.atRiskOrgs} yellow/red tenant${kpis.atRiskOrgs === 1 ? "" : "s"}`,
      tone: kpis.atRiskMrrCents > 0 ? "amber" : undefined,
    },
    { label: "NRR proxy", value: kpis.nrrProxyPct === null ? "—" : `${kpis.nrrProxyPct}%`, hint: "cohort MRR today ÷ 90d ago" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpiCards.map((k) => (
          <Card key={k.label} className="px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-tertiary">{k.label}</p>
            <p
              className={`mt-1 text-xl font-semibold tabular-nums ${k.tone === "red" ? "text-danger" : k.tone === "amber" ? "text-warning" : k.tone === "green" ? "text-success" : "text-primary"}`}
            >
              {k.value}
            </p>
            {k.hint ? <p className="mt-0.5 text-xs text-tertiary">{k.hint}</p> : null}
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader
          title="MRR movement waterfall"
          subtitle="New · expansion · contraction · churn — month-over-month from daily plan+price snapshots (amendment #7)"
          action={
            <a href={exportUrl("usage")} className="text-xs text-brand-text hover:underline">
              Export CSV
            </a>
          }
        />
        <Waterfall data={waterfall} />
      </Card>

      <Card>
        <CardHeader
          title={`Invoice aging (${aging.length} open)`}
          subtitle="Open invoices with days outstanding — overdue highlighted"
          action={
            <a href={exportUrl("invoices")} className="text-xs text-brand-text hover:underline">
              Export CSV
            </a>
          }
        />
        {aging.length === 0 ? (
          <EmptyState title="No open invoices" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-default">
                  <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-tertiary">Invoice</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-tertiary">Tenant</th>
                  <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-tertiary">Amount</th>
                  <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-tertiary">Age</th>
                </tr>
              </thead>
              <tbody>
                {aging.map((a) => (
                  <tr key={a.invoiceId} className="border-b border-border-subtle">
                    <td className="px-4 py-2 font-mono text-xs text-primary">{a.number}</td>
                    <td className="px-3 py-2 text-secondary">
                      {a.orgId ? (
                        <a href={`/platform/tenants/${a.orgId}`} className="hover:underline">
                          {a.orgName}
                        </a>
                      ) : (
                        <span className="text-tertiary">{a.orgName} (deleted)</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-primary">{money(a.amountCents)}</td>
                    <td className="px-3 py-2 text-right">
                      {a.overdue ? <Badge tone="red">{a.ageDays}d overdue</Badge> : <span className="tabular-nums text-tertiary">{a.ageDays}d</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title={`Renewal forecast (${renewals.length})`} subtitle="Contracts · trials · open manual invoices ending within 30 days (fold-in #3)" />
        {renewals.length === 0 ? (
          <EmptyState title="Nothing up for renewal in 30 days" />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {renewals.map((r) => (
              <li key={`${r.kind}-${r.orgId}-${r.dueAt}`} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span>
                  {r.orgId ? (
                    <a href={`/platform/tenants/${r.orgId}`} className="font-medium text-primary hover:underline">
                      {r.orgName}
                    </a>
                  ) : (
                    <span className="text-secondary">{r.orgName}</span>
                  )}
                  <Badge tone={r.kind === "trial" ? "brand" : r.kind === "contract" ? "green" : "neutral"}>
                    {r.kind === "trial" ? "trial" : r.kind === "contract" ? "contract" : "invoice"}
                  </Badge>
                  {r.kind === "contract" ? (
                    <Badge tone={r.autoRenew ? "neutral" : "amber"}>{r.autoRenew ? "auto-renew" : "expires"}</Badge>
                  ) : null}
                </span>
                <span className="text-xs text-tertiary">
                  {new Date(r.dueAt).toLocaleDateString()} · {money(r.amountCents)}{r.kind === "contract" ? "/mo eq" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {churnReasons.length > 0 ? (
        <Card>
          <CardHeader title="Churn by reason · 90d" subtitle="Operator-recorded cancellation reasons (two-person rule) vs customer-initiated" />
          <ul className="divide-y divide-border-subtle">
            {churnReasons.map((c) => (
              <li key={c.reason} className="flex items-center justify-between px-5 py-2 text-sm">
                <span className="text-secondary">{c.reason}</span>
                <span className="tabular-nums text-primary">
                  {c.logos} logo{c.logos === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
