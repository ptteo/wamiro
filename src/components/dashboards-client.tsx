"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card, CardHeader, btn } from "./ui";

const LABELS: Record<string, string> = {
  headcount: "Headcount",
  on_leave_today: "On leave today",
  pending_approvals: "Pending approvals",
  approval_latency_hours: "Avg approval (h)",
};

export function DashboardsClient({
  available,
  pinned,
}: {
  available: Record<string, number>;
  pinned: { metricId: string; label: string; value: number }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pinnedIds = new Set(pinned.map((p) => p.metricId));
  const unpinned = Object.keys(available).filter((id) => !pinnedIds.has(id));

  async function toggle(metricId: string) {
    setBusy(metricId);
    setError(null);
    try {
      const res = await fetch("/api/v1/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metricId }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Toggle failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {pinned.map((p) => (
          <Card key={p.metricId} className="px-5 py-4">
            <p className="text-xs font-medium text-tertiary">
              {p.label}
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{p.value}</p>
            <button
              type="button"
              onClick={() => toggle(p.metricId)}
              disabled={busy !== null}
              className="mt-2 text-[10px] text-[var(--color-muted)] hover:text-danger hover:underline"
            >
              unpin
            </button>
          </Card>
        ))}
      </div>

      {unpinned.length > 0 && (
        <Card>
          <CardHeader title="Available metrics" />
          <div className="flex flex-wrap gap-2 px-5 py-4">
            {unpinned.map((id) => (
              <button
                key={id}
                type="button"
                disabled={busy !== null}
                onClick={() => toggle(id)}
                className={`${btn.secondary} ${btn.small}`}
              >
                + {LABELS[id] ?? id}
              </button>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
