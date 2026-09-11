"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { downloadCsv } from "@/lib/csv-client";
import { Badge, Card, CardHeader, EmptyState, btn } from "./ui";

/**
 * Admin panel Phase B-fix — Billing card: the unified ledger on the platform
 * console. Invoice table (Paddle mirrors + manual invoices), payments recorded
 * against open invoices, goodwill credits, and [Manual invoice] / [Record
 * payment] / [Add credit] quick actions — all with reason prompts (§10.4 #14).
 */

export interface LedgerInvoiceView {
  id: string;
  orgId: string | null;
  orgName: string;
  orgSlug: string;
  number: string;
  providerInvoiceId: string | null;
  amountCents: number;
  currency: string;
  status: string;
  source: string;
  issuedAt: string;
  dueAt: string | null;
  paidAt: string | null;
  paidCents: number;
  reason: string;
  lines: { desc: string; qty: number; unitCents: number; totalCents: number }[];
}

export interface LedgerCreditView {
  id: string;
  orgId: string;
  orgName: string;
  amountCents: number;
  reason: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface LedgerTenantOption {
  id: string;
  name: string;
}

const STATUS_TONE: Record<string, "green" | "amber" | "red" | "neutral"> = {
  paid: "green",
  open: "amber",
  draft: "neutral",
  uncollectible: "red",
  void: "neutral",
};

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export function PlatformBillingCard({
  invoices,
  credits,
  tenants,
}: {
  invoices: LedgerInvoiceView[];
  credits: LedgerCreditView[];
  tenants: LedgerTenantOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const openInvoices = useMemo(() => invoices.filter((i) => i.status === "open" || i.status === "draft"), [invoices]);

  const filtered = useMemo(() => {
    const rows = statusFilter === "all" ? invoices : invoices.filter((i) => i.status === statusFilter);
    return rows.slice(0, 100);
  }, [invoices, statusFilter]);

  async function post(body: unknown, op: "create_invoice" | "record_payment" | "create_credit") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/platform/billing-ledger?op=${op}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        setError(data.error?.message ?? "Action failed");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  function manualInvoiceFlow() {
    if (tenants.length === 0) {
      window.alert("No tenants to invoice.");
      return;
    }
    const org = window.prompt(`Tenant name (one of: ${tenants.slice(0, 8).map((t) => t.name).join(", ")}${tenants.length > 8 ? ", …" : ""})`);
    if (!org) return;
    const match = tenants.find((t) => t.name.toLowerCase() === org.trim().toLowerCase());
    if (!match) {
      window.alert(`No tenant named "${org.trim()}".`);
      return;
    }
    const desc = window.prompt("Line item description (e.g. Platform fee — June):");
    if (!desc) return;
    const amountRaw = window.prompt("Amount in dollars (e.g. 120.00):");
    if (!amountRaw) return;
    const dollars = Number(amountRaw.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(dollars) || dollars <= 0) {
      window.alert("Enter a positive amount.");
      return;
    }
    const unitCents = Math.round(dollars * 100);
    const reason = window.prompt("Reason (stored on the ledger — why does this invoice exist?):");
    if (!reason || reason.trim().length < 5) return;
    void (async () => {
      const ok = await post(
        {
          op: "create_invoice",
          orgId: match.id,
          currency: "USD",
          lines: [{ desc: desc.trim().slice(0, 300), qty: 1, unitCents }],
          reason: reason.trim(),
        },
        "create_invoice",
      );
      if (ok) window.alert(`Invoice raised: ${match.name} — ${money(unitCents, "USD")}`);
    })();
  }

  function recordPaymentFlow() {
    if (openInvoices.length === 0) {
      window.alert("No open invoices to record a payment against.");
      return;
    }
    const list = openInvoices.map((i) => `${i.number} — ${i.orgName} — ${money(i.amountCents - i.paidCents, i.currency)} due`).join("\n");
    const raw = window.prompt(`Open invoices:\n${list}\n\nInvoice number to record payment against:`);
    if (!raw) return;
    const inv = openInvoices.find((i) => i.number.toLowerCase() === raw.trim().toLowerCase());
    if (!inv) {
      window.alert(`No open invoice "${raw.trim()}".`);
      return;
    }
    const balanceDue = inv.amountCents - inv.paidCents;
    const amountRaw = window.prompt(`Amount in dollars (balance due ${(balanceDue / 100).toFixed(2)}, blank = full balance):`);
    let amountCents = balanceDue;
    if (amountRaw && amountRaw.trim()) {
      const dollars = Number(amountRaw.replace(/[^0-9.]/g, ""));
      if (!Number.isFinite(dollars) || dollars <= 0) {
        window.alert("Enter a positive amount.");
        return;
      }
      amountCents = Math.round(dollars * 100);
    }
    void (async () => {
      const ok = await post({ op: "record_payment", invoiceId: inv.id, amountCents }, "record_payment");
      if (ok) {
        const data = (await fetch("/api/v1/platform/billing-ledger").then((r) => r.json())) as { invoices?: LedgerInvoiceView[] };
        const updated = data?.invoices?.find((i) => i.id === inv.id);
        const over = updated ? updated.paidCents - updated.amountCents : 0;
        window.alert(over > 0 ? `Payment recorded — overpayment of ${(over / 100).toFixed(2)} carries forward.` : "Payment recorded.");
      }
    })();
  }

  function addCreditFlow() {
    if (tenants.length === 0) {
      window.alert("No tenants to credit.");
      return;
    }
    const org = window.prompt(`Tenant name to credit (one of: ${tenants.slice(0, 8).map((t) => t.name).join(", ")}${tenants.length > 8 ? ", …" : ""})`);
    if (!org) return;
    const match = tenants.find((t) => t.name.toLowerCase() === org.trim().toLowerCase());
    if (!match) {
      window.alert(`No tenant named "${org.trim()}".`);
      return;
    }
    const amountRaw = window.prompt("Credit amount in dollars (e.g. 50.00):");
    if (!amountRaw) return;
    const dollars = Number(amountRaw.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(dollars) || dollars <= 0) {
      window.alert("Enter a positive amount.");
      return;
    }
    const reason = window.prompt("Reason (min 5 chars — stored on the ledger):");
    if (!reason || reason.trim().length < 5) return;
    void post(
      {
        op: "create_credit",
        orgId: match.id,
        amountCents: Math.round(dollars * 100),
        reason: reason.trim(),
      },
      "create_credit",
    );
  }

  return (
    <Card>
      <CardHeader
        title={`Billing ledger (${invoices.length})`}
        subtitle="Unified ledger — Paddle mirrors and manual invoices. Historical: revenue history survives tenant deletion."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`${btn.secondary} ${btn.small}`}
              onClick={() =>
                downloadCsv(
                  `wamiro-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
                  ["number", "tenant", "slug", "source", "amount_cents", "paid_cents", "currency", "status", "issued", "due", "paid", "reason"],
                  invoices.map((i) => [i.number, i.orgName, i.orgSlug, i.source, i.amountCents, i.paidCents, i.currency, i.status, i.issuedAt, i.dueAt, i.paidAt, i.reason]),
                )
              }
            >
              Export CSV
            </button>
            <button type="button" disabled={busy} onClick={manualInvoiceFlow} className={`${btn.secondary} ${btn.small}`}>
              Manual invoice
            </button>
            <button type="button" disabled={busy} onClick={recordPaymentFlow} className={`${btn.secondary} ${btn.small}`}>
              Record payment
            </button>
            <button type="button" disabled={busy} onClick={addCreditFlow} className={`${btn.secondary} ${btn.small}`}>
              Add credit
            </button>
          </div>
        }
      />

      {invoices.length > 0 ? (
        <div className="flex items-center gap-2 border-b border-border-subtle px-5 py-2 text-xs">
          <span className="text-tertiary">Status:</span>
          {["all", "open", "paid", "void", "uncollectible"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-2 py-0.5 ${statusFilter === s ? "bg-brand-subtle font-medium text-brand-text" : "text-tertiary hover:text-secondary"}`}
            >
              {s}
            </button>
          ))}
          {credits.length > 0 ? (
            <span className="ml-auto text-tertiary">
              credits issued: {credits.length} · total {money(credits.reduce((s, c) => s + c.amountCents, 0), "USD")}
            </span>
          ) : null}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title="No invoices in the ledger"
          hint="Paddle transactions mirror here automatically; use Manual invoice for enterprise deals and comp months."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-default">
                <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-tertiary">Invoice</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-tertiary">Tenant</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-tertiary">Source</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-tertiary">Amount</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-tertiary">Paid</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-tertiary">Status</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-tertiary">Issued</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-tertiary">Due</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                <tr key={inv.id} className="border-b border-border-subtle align-top" title={inv.reason || undefined}>
                  <td className="px-4 py-2 font-mono text-xs text-primary">
                    {inv.number}
                    {inv.lines.length > 0 ? (
                      <p className="mt-0.5 max-w-[280px] truncate font-sans text-[11px] text-tertiary">{inv.lines.map((l) => l.desc).join(", ")}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-secondary">
                    {inv.orgName || <span className="text-tertiary">(deleted tenant)</span>}
                    <p className="font-mono text-[11px] text-tertiary">/{inv.orgSlug || "—"}</p>
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={inv.source === "paddle" ? "brand" : "neutral"}>{inv.source}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-primary">{money(inv.amountCents, inv.currency)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-secondary">{inv.paidCents > 0 ? money(inv.paidCents, inv.currency) : "—"}</td>
                  <td className="px-3 py-2">
                    <Badge tone={STATUS_TONE[inv.status] ?? "neutral"}>{inv.status}</Badge>
                    {inv.status === "open" && inv.dueAt && new Date(inv.dueAt).getTime() < Date.now() ? (
                      <p className="mt-0.5 text-[11px] text-danger">overdue</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-tertiary">{fmtDate(inv.issuedAt)}</td>
                  <td className="px-3 py-2 text-xs text-tertiary">{fmtDate(inv.dueAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {credits.length > 0 ? (
        <div className="border-t border-border-subtle px-5 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-tertiary">Credits ledger</p>
          <ul className="mt-2 divide-y divide-border-subtle">
            {credits.slice(0, 20).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-primary">{c.orgName}</span>
                  <span className="ml-2 text-xs text-secondary">{c.reason}</span>
                </span>
                <span className="text-secondary tabular-nums">−{money(c.amountCents, "USD")}</span>
                {c.expiresAt ? <span className="text-xs text-tertiary">expires {fmtDate(c.expiresAt)}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="border-t border-border-subtle px-5 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
