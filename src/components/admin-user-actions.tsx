"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "./ui-overlays";
import { btn } from "./ui";

type Status = "active" | "suspended" | string;

export function UserStatusButton({
  userId,
  currentStatus,
  className,
}: {
  userId: string;
  currentStatus: Status;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // G-24 — native confirm/alert replaced with the design-system dialog.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next: Status = currentStatus === "suspended" ? "active" : "suspended";
  const classes =
    className ?? (next === "suspended" ? `${btn.danger} w-full sm:w-auto` : `${btn.primary} w-full sm:w-auto`);

  async function changeStatus() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(d?.error?.message ?? "Could not change user status");
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error ? (
        <p role="alert" className="mt-2 rounded-md bg-danger-subtle px-3 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className={classes}
        disabled={busy}
        onClick={() => {
          if (next === "suspended") {
            setConfirmOpen(true);
            return;
          }
          void changeStatus();
        }}
      >
        {next === "suspended" ? "Suspend" : "Reactivate"}
      </button>
      <ConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Suspend user"
        body="All their active sessions will be revoked. They will not be able to sign in until reactivated."
        confirmLabel="Suspend"
        onConfirm={() => void changeStatus()}
      />
    </>
  );
}

export function SessionRevokeButton({
  userId,
  sessionId,
  all,
  confirm: needsConfirm,
  className,
  children,
}: {
  userId: string;
  sessionId?: string;
  all?: boolean;
  confirm?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = children ?? (all ? "Revoke all sessions" : "Revoke");

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      const body = all ? { all: true } : { sessionId };
      const res = await fetch(`/api/v1/admin/users/${userId}/sessions/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(d?.error?.message ?? "Could not revoke session(s)");
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error ? (
        <p role="alert" className="mt-2 rounded-md bg-danger-subtle px-3 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={() => {
          if (needsConfirm) {
            setConfirmOpen(true);
            return;
          }
          void revoke();
        }}
      >
        {label}
      </button>
      <ConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Revoke all sessions"
        body="The user will need to sign in again everywhere."
        confirmLabel="Revoke all"
        onConfirm={() => void revoke()}
      />
    </>
  );
}
