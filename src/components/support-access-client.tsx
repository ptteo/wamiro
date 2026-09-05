"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Card, CardHeader, btn, input } from "./ui";

/**
 * Phase E.2 (tenant side) — the CONSENT switch for platform support
 * impersonation. Only a tenant admin can create or revoke the time-boxed
 * grant; platform operators see it read-only in their console.
 */
export function SupportAccessClient({
  grant,
  canManage,
}: {
  grant: { id: string; reason: string; operatorLabel: string | null; expiresAt: string; createdAt: string } | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [operatorLabel, setOperatorLabel] = useState("");
  const [days, setDays] = useState(3);

  async function call(fn: () => Promise<Response>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Action failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Platform support access"
        subtitle="Grant the Wamiro platform team a time-boxed window to sign in as one of your admins while resolving an issue. Revoke any time — access ends instantly."
      />

      {grant ? (
        <div className="space-y-3 px-5 pb-4">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="green">consent active</Badge>
            <span className="text-secondary">
              expires {new Date(grant.expiresAt).toLocaleString()}
              {grant.operatorLabel ? ` · for ${grant.operatorLabel}` : ""}
            </span>
          </p>
          <p className="text-xs text-tertiary">Reason on file: “{grant.reason}”</p>
          {canManage ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => call(() => fetch(`/api/v1/settings/support-access?id=${grant.id}`, { method: "DELETE" }))}
              className="text-sm text-danger hover:underline disabled:opacity-50"
            >
              {busy ? "Revoking…" : "Revoke access now"}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3 px-5 pb-4">
          {canManage ? (
            <>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder={`Why are you granting access? e.g. "Ticket #42 — payroll run stuck, Wamiro team investigating"`}
                className={`${input} w-full`}
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={operatorLabel}
                  onChange={(e) => setOperatorLabel(e.target.value)}
                  maxLength={120}
                  placeholder="Operator name (optional)"
                  className={`${input} w-56`}
                />
                <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${input} w-28`}>
                  {[1, 2, 3, 5, 7].map((d) => (
                    <option key={d} value={d}>
                      {d} day{d > 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy || reason.trim().length < 5}
                  onClick={() =>
                    call(() =>
                      fetch("/api/v1/settings/support-access", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ reason, operatorLabel: operatorLabel || undefined, days }),
                      }),
                    )
                  }
                  className={`${btn.primary} ${btn.small}`}
                >
                  {busy ? "Granting…" : "Grant support access"}
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-tertiary">Only tenant admins can manage support access.</p>
          )}
        </div>
      )}

      {error ? (
        <p role="alert" className="px-5 pb-4 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
