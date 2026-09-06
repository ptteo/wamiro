"use client";

import { useState } from "react";

import { btn } from "@/components/ui";

interface Props {
  orgName: string;
  canManage: boolean;
  initial: {
    requested: boolean;
    requestedAt: string | null;
    undoBy: string | null;
    requestedByName: string | null;
  };
}

/**
 * Phase 4 GDPR — delete-my-company with a 7-day undo window. Requesting
 * deletion only queues it; the jobs sweep purges after the window unless an
 * admin cancels. Nothing is deleted from this screen.
 */
export function OrgDeletionClient({ orgName, canManage, initial }: Props) {
  const [state, setState] = useState(initial);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canManage) return null;

  async function requestDeletion() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/org/deletion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error?.message ?? "Could not request deletion.");
        return;
      }
      setState({
        requested: true,
        requestedAt: new Date().toISOString(),
        undoBy: json.undoBy ?? null,
        requestedByName: null,
      });
      setConfirm("");
    } finally {
      setBusy(false);
    }
  }

  async function cancelDeletion() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/org/deletion", { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error?.message ?? "Could not cancel deletion.");
        return;
      }
      setState({ requested: false, requestedAt: null, undoBy: null, requestedByName: null });
    } finally {
      setBusy(false);
    }
  }

  if (state.requested) {
    return (
      <div className="rounded-lg border border-danger/40 bg-danger-subtle p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-primary">Deletion scheduled</h3>
        <p className="mt-1 text-xs text-secondary">
          {orgName} is queued for permanent deletion. You can undo this at any time until{" "}
          <span className="font-medium text-primary">
            {state.undoBy ? new Date(state.undoBy).toLocaleString() : "the undo window closes"}
          </span>
          . After that, all data and stored files are erased — this cannot be reversed.
        </p>
        <button
          type="button"
          className={`${btn.secondary} ${btn.small} mt-3`}
          disabled={busy}
          onClick={cancelDeletion}
        >
          {busy ? "Cancelling…" : "Undo — keep this company"}
        </button>
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-surface">
      <div className="border-b border-border-subtle px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold text-primary">Delete this company</h2>
        <p className="mt-0.5 text-xs text-tertiary">
          Permanently delete {orgName} and everything in it. You get a 7-day window to undo.
        </p>
      </div>
      <div className="space-y-3 p-4 sm:p-5">
        <label className="block text-sm">
          <span className="text-xs font-medium text-secondary">
            Type <span className="font-semibold text-primary">{orgName}</span> exactly to confirm
          </span>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={orgName}
            className="mt-1.5 w-full rounded-lg border border-border-subtle bg-field px-3 py-2 text-sm text-primary outline-none focus:border-brand"
          />
        </label>
        <button
          type="button"
          className={`${btn.danger} ${btn.small}`}
          disabled={busy || confirm.trim() !== orgName}
          onClick={requestDeletion}
        >
          {busy ? "Requesting…" : "Request deletion"}
        </button>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    </div>
  );
}