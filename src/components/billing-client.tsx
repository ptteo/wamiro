"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, btn } from "./ui";

export interface BillingPlanCard {
  id: string;
  name: string;
  tagline: string;
  monthlyPerSeat: number | null;
  seatLimit: number | null;
  highlights: string[];
}

export interface BillingInvoiceRow {
  id: string;
  providerInvoiceId: string | null; // null for manual invoices
  amountCents: number;
  currency: string;
  status: string;
  hostedUrl: string | null;
  billedAt: string | null;
}

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function BillingActions({
  canManage,
  paddleConfigured,
  hasCustomer,
  hasSubscription,
  currentPlan,
  billingStatus,
  plans,
  invoices,
}: {
  canManage: boolean;
  paddleConfigured: boolean;
  hasCustomer: boolean;
  hasSubscription: boolean;
  currentPlan: string;
  billingStatus: string;
  plans: BillingPlanCard[];
  invoices: BillingInvoiceRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function readError(res: Response): Promise<string> {
    const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return d.error?.message ?? "Something went wrong";
  }

  async function checkout(plan: string) {
    setBusy(`checkout:${plan}`);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as { url?: string | null; changed?: boolean };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setNotice(data.changed ? "Plan updated. Quantity will prorate on the next Paddle invoice." : "Done.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start checkout");
    } finally {
      setBusy(null);
    }
  }

  async function portal() {
    setBusy("portal");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/billing/portal", { method: "POST" });
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as { url?: string };
      if (data.url) window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the billing portal");
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    const ok = window.confirm(
      "Cancel this subscription? New charges stop at the end of the current billing period. Your workspace stays available until then, then access is blocked. Company data is kept until an admin deletes the company.",
    );
    if (!ok) return;
    setBusy("cancel");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setNotice("Cancellation scheduled. Access continues until the period ends.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {error ? (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-lg border border-border-subtle bg-surface-subtle px-4 py-3 text-sm text-secondary">
          {notice}
        </p>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        {plans.map((p) => {
          const current = p.id === currentPlan;
          const paid = p.id === "growth" || p.id === "scale";
          return (
            <div
              key={p.id}
              className={`flex flex-col rounded-lg border p-4 ${current ? "border-brand bg-brand-subtle/40" : "border-border-subtle bg-surface"}`}
            >
              <p className="flex items-center justify-between gap-2 text-sm font-semibold text-primary">
                {p.name}
                {current ? <Badge tone="brand">Current</Badge> : null}
              </p>
              <p className="mt-0.5 text-xs text-tertiary">{p.tagline}</p>
              <p className="mt-3 text-lg font-semibold text-primary">
                {p.monthlyPerSeat === null || p.monthlyPerSeat === 0 ? (
                  "Free"
                ) : (
                  <>
                    ${p.monthlyPerSeat}
                    <span className="text-sm font-normal text-tertiary">/person/month</span>
                  </>
                )}
              </p>
              <ul className="mt-3 flex-1 space-y-1">
                {p.highlights.slice(0, 4).map((h) => (
                  <li key={h} className="text-xs text-secondary">
                    {h}
                  </li>
                ))}
              </ul>
              {canManage && paddleConfigured && paid && !current && billingStatus !== "cancelled" ? (
                <button
                  type="button"
                  className={`${btn.primary} ${btn.small} mt-4`}
                  disabled={busy !== null}
                  onClick={() => checkout(p.id)}
                >
                  {busy === `checkout:${p.id}` ? "Starting…" : hasSubscription ? "Switch plan" : "Upgrade"}
                </button>
              ) : null}
            </div>
          );
        })}
      </section>

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          {paddleConfigured && hasCustomer ? (
            <button type="button" className={`${btn.secondary} ${btn.small}`} disabled={busy !== null} onClick={portal}>
              {busy === "portal" ? "Opening…" : "Manage billing"}
            </button>
          ) : null}
          {paddleConfigured && hasSubscription && billingStatus !== "cancelled" ? (
            <button type="button" className={`${btn.danger} ${btn.small}`} disabled={busy !== null} onClick={cancel}>
              {busy === "cancel" ? "Canceling…" : "Cancel subscription"}
            </button>
          ) : null}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
        <div className="border-b border-border-subtle px-5 py-3">
          <h2 className="text-sm font-semibold text-primary">Invoices</h2>
          <p className="text-xs text-tertiary">Issued by Paddle. Tax and receipts live on their hosted invoice.</p>
        </div>
        {invoices.length === 0 ? (
          <p className="px-5 py-6 text-sm text-tertiary">No invoices yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] font-medium uppercase tracking-wide text-tertiary">
              <tr>
                <th className="px-5 py-2">Date</th>
                <th className="px-5 py-2">Amount</th>
                <th className="px-5 py-2">Status</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-border-subtle">
                  <td className="px-5 py-2 text-secondary">
                    {inv.billedAt ? new Date(inv.billedAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-5 py-2 text-primary">{money(inv.amountCents, inv.currency)}</td>
                  <td className="px-5 py-2">
                    <Badge tone={inv.status === "completed" || inv.status === "paid" ? "green" : "neutral"}>
                      {inv.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-2 text-right">
                    {inv.hostedUrl ? (
                      <a href={inv.hostedUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand">
                        View
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
