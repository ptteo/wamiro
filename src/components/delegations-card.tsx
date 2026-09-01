"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card, CardHeader, EmptyState, btn, input } from "./ui";

interface Delegation {
  id: string;
  delegateName: string;
  reason: string;
  expiresAt: string | null;
  active: boolean;
}

export function DelegationsCard({ initial }: { initial: Delegation[] }) {
  const router = useRouter();
  const [items, setItems] = useState<Delegation[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/v1/delegations");
    if (res.ok) {
      const d = (await res.json()) as { delegations?: Delegation[] };
      setItems(d.delegations ?? []);
    }
    router.refresh();
  }

  return (
    <Card>
      <CardHeader title="Approval delegations" subtitle="Temporarily hand your approval authority to a teammate (7 days)." />
      <div className="space-y-4 px-5 py-4">
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const f = new FormData(e.currentTarget);
            try {
              const res = await fetch("/api/v1/delegations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  delegateEmail: f.get("email"),
                  reason: f.get("reason"),
                }),
              });
              if (!res.ok) {
                const d = (await res.json()) as { error?: { message?: string } };
                setError(d.error?.message ?? "Could not create delegation");
                return;
              }
              (e.target as HTMLFormElement).reset();
              await refresh();
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block grow text-sm font-medium sm:max-w-64">
            Delegate to (email)
            <input name="email" type="email" required className={`${input} mt-1`} />
          </label>
          <label className="block grow text-sm font-medium">
            Reason
            <input name="reason" required minLength={3} maxLength={300} placeholder="e.g. On leave next week" className={`${input} mt-1`} />
          </label>
          <button type="submit" disabled={busy} className={btn.primary}>
            Delegate
          </button>
        </form>

        {items.length === 0 ? (
          <EmptyState title="No active delegations" hint="Anything you can approve stays with you until you delegate it." />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {items.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-0 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.delegateName}</p>
                  <p className="truncate text-xs text-tertiary">
                    {d.reason || "No reason given"}
                    {d.expiresAt ? ` · until ${new Date(d.expiresAt).toLocaleDateString()}` : ""}
                    {!d.active ? " · revoked" : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className={`${btn.secondary} ${btn.small}`}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await fetch("/api/v1/delegations", {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: d.id }),
                      });
                      await refresh();
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
