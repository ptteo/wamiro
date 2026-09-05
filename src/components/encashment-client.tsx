"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Coins, Inbox, XCircle } from "lucide-react";

import { Button } from "./ui";
import { cx } from "@/lib/cx";

export interface EncashmentRow {
  id: string;
  userName: string;
  leaveTypeName: string;
  days: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  rate: number | null;
  amount: number | null;
  decidedNote: string | null;
  createdAt: string;
}

export interface EncashmentData {
  canApply: boolean;
  canApprove: boolean;
  mine: EncashmentRow[];
  pending: EncashmentRow[];
  types: { id: string; name: string }[];
  balances: { leaveTypeId: string; name: string; remaining: number }[];
}

function statusBadge(status: EncashmentRow["status"]) {
  const tone =
    status === "approved"
      ? "bg-success-subtle text-success"
      : status === "rejected"
        ? "bg-danger-subtle text-danger"
        : status === "cancelled"
          ? "bg-surface-subtle text-tertiary"
          : "bg-warning-subtle text-warning";
  return (
    <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", tone)}>{status}</span>
  );
}

function fmtMoney(n: number | null): string {
  if (n === null) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

export function EncashmentClient({ data }: { data: EncashmentData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // apply form
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [days, setDays] = useState("1");
  const [reason, setReason] = useState("");
  // review
  const [note, setNote] = useState("");

  const remainingFor = (id: string) => data.balances.find((b) => b.leaveTypeId === id)?.remaining ?? null;

  async function call(url: string, method: string, body: unknown, successMsg: string) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok) {
        setError(d.error?.message ?? `Request failed (${res.status})`);
        return false;
      }
      setInfo(successMsg);
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveTypeId) return setError("Choose a leave type");
    const n = Number(days);
    if (!Number.isFinite(n) || n <= 0) return setError("Enter a positive number of days");
    const remaining = remainingFor(leaveTypeId);
    if (remaining !== null && n > remaining) {
      return setError(`Only ${remaining} day(s) available on this leave type`);
    }
    const ok = await call(
      "/api/v1/leave/encashments",
      "POST",
      { leaveTypeId, days: n, reason: reason.trim() || undefined },
      "Encashment requested — your manager will review it",
    );
    if (ok) {
      setReason("");
      setDays("1");
    }
  };

  const decide = async (id: string, decision: "approved" | "rejected") => {
    let rate: number | undefined;
    if (decision === "approved") {
      rate = Number(prompt("Per-day payout rate for this encashment?")) || undefined;
      if (rate === undefined || !Number.isFinite(rate) || rate < 0) {
        return setError("A valid per-day rate is required to approve");
      }
    }
    const ok = await call(
      `/api/v1/leave/encashments/${id}/review`,
      "POST",
      { decision, rate, note: note.trim() || undefined },
      decision === "approved" ? "Encashment approved — days deducted from balance" : "Encashment rejected",
    );
    if (ok) setNote("");
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        {data.canApprove && (
          <section className="rounded-lg border border-border-subtle bg-surface p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
              <Inbox className="h-4 w-4 text-tertiary" /> Waiting on you
            </h2>
            {data.pending.length === 0 ? (
              <p className="py-4 text-center text-sm text-tertiary">No pending encashments.</p>
            ) : (
              <ul className="space-y-3">
                {data.pending.map((p) => (
                  <li key={p.id} className="rounded-lg border border-border-subtle bg-surface-subtle p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-primary">{p.userName}</span>
                      <span className="rounded bg-brand-subtle px-1.5 py-0.5 text-[11px] font-medium text-brand">
                        {p.leaveTypeName}
                      </span>
                      <span className="text-xs text-tertiary">{p.days} day(s)</span>
                    </div>
                    {p.reason && <p className="mt-1.5 text-sm text-secondary">“{p.reason}”</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Optional note…"
                        className="min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-primary placeholder:text-tertiary"
                      />
                      <Button size="sm" variant="primary" loading={busy} onClick={() => decide(p.id, "approved")}>
                        <CheckCircle2 className="h-4 w-4" /> Approve
                      </Button>
                      <Button size="sm" variant="secondary" loading={busy} onClick={() => decide(p.id, "rejected")}>
                        <XCircle className="h-4 w-4" /> Reject
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="rounded-lg border border-border-subtle bg-surface p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
            <Coins className="h-4 w-4 text-tertiary" /> My encashments
          </h2>
          {data.mine.length === 0 ? (
            <p className="py-4 text-center text-sm text-tertiary">
              Nothing yet — request an encashment from the form.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {data.mine.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                  <span className="font-medium text-primary">{r.leaveTypeName}</span>
                  <span className="text-secondary">{r.days} day(s)</span>
                  {r.amount !== null && <span className="text-xs text-tertiary">→ {fmtMoney(r.amount)}</span>}
                  <span className="flex-1" />
                  {statusBadge(r.status)}
                  {r.decidedNote && <span className="text-xs text-tertiary">— {r.decidedNote}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="space-y-4">
        {error && (
          <p className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger">{error}</p>
        )}
        {info && (
          <p className="rounded-md border border-success/30 bg-success-subtle px-3 py-2 text-sm text-success">{info}</p>
        )}

        <section className="rounded-lg border border-border-subtle bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold text-primary">Available balances</h2>
          {data.balances.length === 0 ? (
            <p className="text-sm text-tertiary">No leave balances on record.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.balances.map((b) => (
                <li key={b.leaveTypeId} className="flex justify-between">
                  <span className="text-secondary">{b.name}</span>
                  <span className="font-medium tabular-nums text-primary">{b.remaining} day(s)</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {data.canApply && (
          <form onSubmit={submit} className="grid gap-3 rounded-lg border border-border-subtle bg-surface p-4">
            <h2 className="text-sm font-semibold text-primary">Request encashment</h2>
            <label className="flex flex-col text-[11px] font-medium text-secondary">
              Leave type
              <select
                value={leaveTypeId}
                onChange={(e) => setLeaveTypeId(e.target.value)}
                className="mt-1 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-primary"
              >
                <option value="">Choose a type…</option>
                {data.types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {remainingFor(t.id) !== null ? ` (${remainingFor(t.id)} available)` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-[11px] font-medium text-secondary">
              Days
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="mt-1 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-primary"
              />
            </label>
            <label className="flex flex-col text-[11px] font-medium text-secondary">
              Reason (optional)
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Anything your manager should know"
                className="mt-1 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-primary placeholder:text-tertiary"
              />
            </label>
            <Button variant="primary" loading={busy} className="justify-center">
              Request encashment
            </Button>
          </form>
        )}
      </aside>
    </div>
  );
}
