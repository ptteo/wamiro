"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CheckBurst, shouldCelebrate } from "@/components/delight";
import { toast } from "@/components/toaster";
import { btn } from "./ui";

interface OpenShift {
  clockIn: string | Date;
}

export function ClockInButton({ openShift, tour }: { openShift: OpenShift | null; tour?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/attendance/clock", { method: "POST" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: { message?: string } };
        const message = data.error?.message ?? "Could not record attendance";
        setError(message);
        toast.error(message);
        return;
      }
      // Phase 6 §8 — first clock-in ever: a one-second check animation,
      // once per user (per browser), never on clock-out.
      if (!openShift && shouldCelebrate("first-clock-in")) {
        setCelebrate(true);
        window.setTimeout(() => setCelebrate(false), 1600);
      } else if (!openShift) {
        toast.success("Clocked in");
      } else {
        toast.success("Clocked out");
      }
      router.refresh();
    } catch {
      const message = "Network error — try again.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3" data-tour={tour}>
      <button type="button" onClick={toggle} disabled={busy} className={`${btn.primary} press`}>
        {busy
          ? "Saving…"
          : openShift
            ? `Clock out (since ${new Date(openShift.clockIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`
            : "Clock in"}
      </button>
      {celebrate ? <CheckBurst className="h-6 w-6 text-success" /> : null}
      {error && !celebrate && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
