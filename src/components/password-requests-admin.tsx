"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { btn } from "./ui";

export function PasswordRequestsAdmin({
  requests,
}: {
  requests: { id: string; name: string; email: string; createdAt: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, approve: boolean) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/v1/admin/password-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, approve }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not update request");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (requests.length === 0) {
    return <p className="py-3 text-sm text-tertiary">No pending requests.</p>;
  }
  return (
    <div>
      {error ? <p className="mb-2 text-sm text-danger">{error}</p> : null}
      <ul className="divide-y divide-border-subtle text-sm">
        {requests.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {r.name} · {r.email}
              <span className="block text-xs text-tertiary">{new Date(r.createdAt).toLocaleString()}</span>
            </span>
            <span className="flex gap-2">
              <button type="button" className={`${btn.primary} ${btn.small}`} disabled={busy === r.id} onClick={() => decide(r.id, true)}>
                Approve
              </button>
              <button type="button" className={`${btn.secondary} ${btn.small}`} disabled={busy === r.id} onClick={() => decide(r.id, false)}>
                Reject
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
