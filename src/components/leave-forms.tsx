"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { btn, input } from "./ui";
import { employeeMayRequestCancel } from "@/modules/leave/cancel";

export function ApplyLeaveForm({ types }: { types: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/v1/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveTypeId: f.get("leaveTypeId"),
          startDate: f.get("startDate"),
          endDate: f.get("endDate"),
          reason: f.get("reason") || undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok) {
        setError(data.error?.message ?? "Could not submit request");
        return;
      }
      setDone(true);
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 px-5 py-4 sm:grid-cols-2">
      <label className="text-sm font-medium">
        Leave type
        <select name="leaveTypeId" className={`${input} mt-1`} required>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        Reason (optional)
        <input name="reason" className={`${input} mt-1`} maxLength={500} placeholder="Family event…" />
      </label>
      <label className="text-sm font-medium">
        From
        <input type="date" name="startDate" className={`${input} mt-1`} required />
      </label>
      <label className="text-sm font-medium">
        To
        <input type="date" name="endDate" className={`${input} mt-1`} required />
      </label>
      <div className="sm:col-span-2">
        <button type="submit" disabled={busy} className={btn.primary}>
          {busy ? "Submitting…" : "Submit request"}
        </button>
        {done && (
          <span role="status" className="ml-3 text-sm text-success">
            Request submitted for approval.
          </span>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}

export function LeaveSelfActions({
  requestId,
  status,
  endDate,
  today,
}: {
  requestId: string;
  status: string;
  endDate: string;
  today?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withdraw = status === "pending";
  const requestCancel = employeeMayRequestCancel(status, endDate, today);
  if (!withdraw && !requestCancel) {
    if (status === "cancel_requested") {
      return <span className="text-[11px] text-tertiary">Cancel requested</span>;
    }
    return null;
  }

  async function act() {
    if (requestCancel && !window.confirm("Ask your manager to cancel this approved leave?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/leave/${requestId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: { message?: string } };
        setError(data.error?.message ?? "Could not cancel");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button type="button" className={`${btn.secondary} ${btn.small}`} disabled={busy} onClick={() => void act()}>
        {busy ? "…" : withdraw ? "Withdraw" : "Request cancel"}
      </button>
      {error ? (
        <p role="alert" className="max-w-[12rem] text-right text-[11px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ForceCancelButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act() {
    const note = window.prompt("Why are you cancelling this approved leave?");
    if (note === null) return;
    if (note.trim().length < 2) {
      setError("A short note is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/leave/${requestId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true, note: note.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: { message?: string } };
        setError(data.error?.message ?? "Could not cancel");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shrink-0">
      <button type="button" className={`${btn.danger} ${btn.small}`} disabled={busy} onClick={() => void act()}>
        {busy ? "…" : "Cancel leave"}
      </button>
      {error ? (
        <p role="alert" className="mt-1 text-[11px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ReviewButtons({ requestId, kind = "apply" }: { requestId: string; kind?: "apply" | "cancel" }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(decision: "approved" | "rejected") {
    setBusy(decision === "approved" ? "approve" : "reject");
    setError(null);
    try {
      const res = await fetch(`/api/v1/leave/${requestId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: { message?: string } };
        setError(data.error?.message ?? "Action failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={`${btn.success} ${btn.small}`}
        onClick={() => act("approved")}
        disabled={busy !== null}
      >
        {kind === "cancel" ? "Approve cancel" : "Approve"}
      </button>
      <button
        type="button"
        className={`${btn.danger} ${btn.small}`}
        onClick={() => act("rejected")}
        disabled={busy !== null}
      >
        {kind === "cancel" ? "Keep leave" : "Reject"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
