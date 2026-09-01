"use client";

import { useState } from "react";

import { btn } from "./ui";

export function HrSyncButton({ configured }: { configured: boolean }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!configured) {
    return (
      <span className="text-xs text-[var(--color-muted)]">
        Connect Frappe (FRAPPE_BASE_URL / FRAPPE_TOKEN) to enable employee sync.
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={busy}
        className={`${btn.secondary} ${btn.small}`}
        onClick={async () => {
          setBusy(true);
          setResult(null);
          setError(null);
          try {
            const res = await fetch("/api/v1/admin/integrations/frappe/sync", { method: "POST" });
            const d = (await res.json()) as {
              imported?: number;
              updated?: number;
              skipped?: number;
              error?: { message?: string };
            };
            if (!res.ok) {
              setError(d.error?.message ?? "Sync failed");
            } else {
              setResult(`Imported ${d.imported ?? 0} · updated ${d.updated ?? 0} · skipped ${d.skipped ?? 0}`);
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Syncing…" : "Sync from Frappe"}
      </button>
      {result && <span className="text-xs text-success">{result}</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
