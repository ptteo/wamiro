"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, History, Inbox, XCircle } from "lucide-react";

import { Button } from "./ui";
import { cx } from "@/lib/cx";

export interface CorrectionRow {
  id: string;
  userName: string;
  recordDate: string;
  type: "clock_in" | "clock_out" | "missing";
  requestedInAt: string | null;
  requestedOutAt: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  decidedNote: string | null;
  createdAt: string;
}

export interface CorrectionsData {
  canApprove: boolean;
  corrections: CorrectionRow[];
  pending: CorrectionRow[];
}

const TYPE_LABEL: Record<CorrectionRow["type"], string> = {
  clock_in: "Clock-in",
  clock_out: "Clock-out",
  missing: "Missed day",
};

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadge(status: CorrectionRow["status"]) {
  const tone =
    status === "approved"
      ? "bg-success-subtle text-success"
      : status === "rejected"
        ? "bg-danger-subtle text-danger"
        : "bg-warning-subtle text-warning";
  return (
    <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold", tone)}>{status}</span>
  );
}

export function CorrectionsClient({ data }: { data: CorrectionsData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // request form
  const todayIso = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayIso);
  const [type, setType] = useState<CorrectionRow["type"]>("clock_in");
  const [inTime, setInTime] = useState("09:00");
  const [outTime, setOutTime] = useState("17:00");
  const [reason, setReason] = useState("");
  // review note
  const [note, setNote] = useState("");

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
    if (!reason.trim()) return setError("Please explain what needs correcting");
    const localIso = (dateT: string, timeT: string) => {
      const d = new Date(`${dateT}T${timeT}:00`);
      if (Number.isNaN(+d)) return null;
      return d.toISOString();
    };
    const payload: {
      recordDate: string;
      type: CorrectionRow["type"];
      reason: string;
      requestedInAt?: string;
      requestedOutAt?: string;
    } = { recordDate: date, type, reason: reason.trim() };
    if (type !== "clock_out") {
      const inIso = localIso(date, inTime);
      if (!inIso) return setError("Invalid clock-in time");
      payload.requestedInAt = inIso;
    }
    if (type !== "clock_in") {
      const outIso = localIso(date, outTime);
      if (!outIso) return setError("Invalid clock-out time");
      payload.requestedOutAt = outIso;
    }
    const ok = await call("/api/v1/attendance/corrections", "POST", payload, "Correction submitted");
    if (ok) {
      setReason("");
      setType("clock_in");
    }
  };

  const decide = async (id: string, decision: "approved" | "rejected") => {
    const ok = await call(
      `/api/v1/attendance/corrections/${id}/review`,
      "POST",
      { decision, note: note.trim() || undefined },
      decision === "approved" ? "Correction approved & applied" : "Correction rejected",
    );
    if (ok) setNote("");
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        {/* Approvals queue */}
        {data.canApprove && (
          <section className="rounded-lg border border-border-subtle bg-surface p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
              <Inbox className="h-4 w-4 text-tertiary" /> Waiting on you
            </h2>
            {data.pending.length === 0 ? (
              <p className="py-4 text-center text-sm text-tertiary">No pending corrections.</p>
            ) : (
              <ul className="space-y-3">
                {data.pending.map((c) => (
                  <li key={c.id} className="rounded-lg border border-border-subtle bg-surface-subtle p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-primary">{c.userName}</span>
                      <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
                        {TYPE_LABEL[c.type]}
                      </span>
                      <span className="text-xs text-tertiary">{c.recordDate}</span>
                    </div>
                    <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                      <div className="flex gap-1">
                        <dt className="text-tertiary">In:</dt>
                        <dd className="font-medium tabular-nums text-primary">{fmtTime(c.requestedInAt)}</dd>
                      </div>
                      <div className="flex gap-1">
                        <dt className="text-tertiary">Out:</dt>
                        <dd className="font-medium tabular-nums text-primary">{fmtTime(c.requestedOutAt)}</dd>
                      </div>
                    </dl>
                    <p className="mt-1.5 text-sm text-secondary">“{c.reason}”</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Optional note…"
                        className="min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-primary placeholder:text-tertiary"
                      />
                      <Button size="sm" variant="primary" loading={busy} onClick={() => decide(c.id, "approved")}>
                        <CheckCircle2 className="h-4 w-4" /> Approve
                      </Button>
                      <Button size="sm" variant="secondary" loading={busy} onClick={() => decide(c.id, "rejected")}>
                        <XCircle className="h-4 w-4" /> Reject
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* My corrections */}
        <section className="rounded-lg border border-border-subtle bg-surface p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
            <History className="h-4 w-4 text-tertiary" /> Corrections
          </h2>
          {data.corrections.length === 0 ? (
            <p className="py-4 text-center text-sm text-tertiary">
              No corrections yet — use the form to request one.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {data.corrections.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                  <span className="w-28 shrink-0 text-xs text-tertiary">{c.recordDate}</span>
                  <span className="w-20 shrink-0 font-medium text-primary">{TYPE_LABEL[c.type]}</span>
                  <span className="min-w-0 flex-1 truncate text-secondary">“{c.reason}”</span>
                  {statusBadge(c.status)}
                  {c.decidedNote && <span className="text-xs text-tertiary">— {c.decidedNote}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Request form */}
      <aside className="space-y-4">
        {error && (
          <p className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger">{error}</p>
        )}
        {info && (
          <p className="rounded-md border border-success/30 bg-success-subtle px-3 py-2 text-sm text-success">{info}</p>
        )}
        <form onSubmit={submit} className="grid gap-3 rounded-lg border border-border-subtle bg-surface p-4">
          <h2 className="text-sm font-semibold text-primary">Request a correction</h2>
          <label className="flex flex-col text-[11px] font-medium text-secondary">
            Date
            <input
              type="date"
              value={date}
              max={todayIso}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-primary"
            />
          </label>
          <div>
            <p className="mb-1 text-[11px] font-medium text-secondary">What went wrong?</p>
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  ["clock_in", "Wrong clock-in"],
                  ["clock_out", "Wrong clock-out"],
                  ["missing", "Missed the day"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setType(value)}
                  className={cx(
                    "rounded-md border px-2 py-1.5 text-[11px] font-medium transition",
                    type === value
                      ? "border-brand bg-brand-subtle text-brand"
                      : "border-border-strong bg-surface text-secondary hover:bg-surface-hover",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col text-[11px] font-medium text-secondary">
              Actual clock-in
              <input
                type="time"
                value={inTime}
                disabled={type === "clock_out"}
                onChange={(e) => setInTime(e.target.value)}
                className="mt-1 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-primary disabled:opacity-50"
              />
            </label>
            <label className="flex flex-col text-[11px] font-medium text-secondary">
              Actual clock-out
              <input
                type="time"
                value={outTime}
                disabled={type === "clock_in"}
                onChange={(e) => setOutTime(e.target.value)}
                className="mt-1 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-primary disabled:opacity-50"
              />
            </label>
          </div>
          <label className="flex flex-col text-[11px] font-medium text-secondary">
            Reason
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="What happened and what should the record show?"
              className="mt-1 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-primary placeholder:text-tertiary"
            />
          </label>
          <Button variant="primary" loading={busy} className="justify-center">
            Submit correction
          </Button>
        </form>
      </aside>
    </div>
  );
}
