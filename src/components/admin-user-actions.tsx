"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiError } from "@/lib/errors";

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
  const next: Status = currentStatus === "suspended" ? "active" : "suspended";
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={async () => {
        if (next === "suspended") {
          const ok = window.confirm(
            "Suspend this user? All their active sessions will be revoked. They will not be able to sign in until reactivated.",
          );
          if (!ok) return;
        }
        setBusy(true);
        try {
          const res = await fetch(`/api/v1/admin/users/${userId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: next }),
          });
          if (!res.ok) {
            const d = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
            window.alert(d?.error?.message ?? "Could not change user status");
            return;
          }
          router.refresh();
        } catch (e) {
          window.alert(e instanceof Error ? e.message : "Network error");
        } finally {
          setBusy(false);
        }
      }}
    >
      {next === "suspended" ? "Suspend" : "Reactivate"}
    </button>
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
  const label = children ?? (all ? "Revoke all sessions" : "Revoke");
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={async () => {
        if (needsConfirm) {
          const ok = window.confirm(
            "Revoke every active session for this user? They will need to sign in again everywhere.",
          );
          if (!ok) return;
        }
        setBusy(true);
        try {
          const body = all ? { all: true } : { sessionId };
          const res = await fetch(`/api/v1/admin/users/${userId}/sessions/revoke`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const d = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
            window.alert(d?.error?.message ?? "Could not revoke session(s)");
            return;
          }
          router.refresh();
        } catch (e) {
          window.alert(e instanceof Error ? e.message : "Network error");
        } finally {
          setBusy(false);
        }
      }}
    >
      {label}
    </button>
  );
}
