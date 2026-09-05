"use client";

import { useState } from "react";

import { Badge, Card, CardHeader, EmptyState, btn, input } from "./ui";

interface Advance {
  id: string;
  employeeUserId: string;
  employeeName: string;
  amount: number;
  reason: string | null;
  status: string;
  decidedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

const STATUS_TONE: Record<string, "neutral" | "amber" | "green" | "red"> = {
  pending: "amber",
  approved: "green",
  rejected: "red",
  recovered: "neutral",
};

function fmtMoney(n: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);
}

export function AdvancesClient({
  data,
}: {
  data: {
    canManage: boolean;
    viewerId: string;
    advances: Advance[];
  };
}) {
  const { canManage, viewerId, advances } = data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Advance[]>(advances);
  const [reviewBusy, setReviewBusy] = useState<string | null>(null);

  async function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/v1/payroll/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(f.get("amount")),
          reason: f.get("reason") || null,
        }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not submit advance");
        return;
      }
      (e.target as HTMLFormElement).reset();
      const list = await fetch("/api/v1/payroll/advances").then((r) => r.json());
      setRows(list.advances);
    } finally {
      setBusy(false);
    }
  }

  async function review(a: Advance, approve: boolean) {
    setReviewBusy(a.id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/payroll/advances/${a.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not review advance");
        return;
      }
      const list = await fetch("/api/v1/payroll/advances").then((r) => r.json());
      setRows(list.advances);
    } finally {
      setReviewBusy(null);
    }
  }

  const mine = canManage ? rows : rows.filter((a) => a.employeeUserId === viewerId);
  const queue = canManage ? rows.filter((a) => a.status === "pending") : [];

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader title="Request an advance" subtitle="Approved advances are deducted from your next payroll run." />
        <form onSubmit={apply} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Amount
            <input
              name="amount"
              type="number"
              min="1"
              step="0.01"
              required
              placeholder="500.00"
              className={`${input} mt-1`}
            />
          </label>
          <label className="text-sm font-medium">
            Reason <span className="font-normal text-tertiary">(optional)</span>
            <input
              name="reason"
              maxLength={500}
              placeholder="e.g. travel advance for client visit"
              className={`${input} mt-1`}
            />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy} className={`${btn.primary} ${btn.small}`}>
              {busy ? "Submitting…" : "Submit advance request"}
            </button>
          </div>
        </form>
      </Card>

      {canManage && queue.length > 0 && (
        <Card>
          <CardHeader title="Awaiting decision" subtitle="Approve or reject pending advance requests." />
          <ul className="mt-2 divide-y divide-border-subtle">
            {queue.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-primary">
                    {a.employeeName} · {fmtMoney(a.amount)}
                  </p>
                  {a.reason ? <p className="truncate text-xs text-tertiary">{a.reason}</p> : null}
                  <p className="text-xs text-tertiary">Requested {new Date(a.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={reviewBusy === a.id}
                    onClick={() => void review(a, true)}
                    className={`${btn.primary} ${btn.small}`}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={reviewBusy === a.id}
                    onClick={() => void review(a, false)}
                    className={`${btn.secondary} ${btn.small}`}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title={canManage ? "All advance requests" : "My advance requests"} />
        {rows.length === 0 ? (
          <EmptyState title="No advances yet" hint="Requests you submit will appear here." />
        ) : (
          <ul className="mt-2 divide-y divide-border-subtle">
            {[...mine]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-primary">
                      {canManage ? a.employeeName : "You"} · {fmtMoney(a.amount)}
                      <Badge tone={STATUS_TONE[a.status] ?? "neutral"}>{a.status}</Badge>
                    </p>
                    {a.reason ? <p className="truncate text-xs text-tertiary">{a.reason}</p> : null}
                    {a.reviewNote ? <p className="truncate text-xs text-tertiary">Note: {a.reviewNote}</p> : null}
                    <p className="text-xs text-tertiary">
                      {new Date(a.createdAt).toLocaleString()}
                      {a.decidedAt ? ` · decided ${new Date(a.decidedAt).toLocaleString()}` : ""}
                    </p>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </Card>
    </div>
  );
}