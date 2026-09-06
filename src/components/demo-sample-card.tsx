"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { btn } from "./ui";

export function DemoSampleCard({ loaded }: { loaded: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "seed" | "purge") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/setup/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not update sample data");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border-default bg-surface p-5">
      <h2 className="text-sm font-semibold text-primary">Sample work (optional)</h2>
      <p className="mt-1 text-sm text-secondary">
        Load a sample project and a few tickets so Support and Work are not empty. They are marked as demo and stay
        inside this company. Attendance and leave are never seeded.
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {loaded ? (
          <button type="button" disabled={busy} className={`${btn.secondary} ${btn.small}`} onClick={() => void run("purge")}>
            {busy ? "Working…" : "Purge sample data"}
          </button>
        ) : (
          <button type="button" disabled={busy} className={`${btn.primary} ${btn.small}`} onClick={() => void run("seed")}>
            {busy ? "Loading…" : "Load sample work"}
          </button>
        )}
      </div>
    </section>
  );
}
