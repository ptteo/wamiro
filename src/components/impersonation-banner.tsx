"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { btn } from "./ui";

/**
 * Fixed banner shown while a platform operator is inside a support
 * impersonation window (Phase E.2). Presence is detected server-side in the
 * app shell via the httpOnly return cookie — this island only hosts the
 * "Stop" action.
 */
export function ImpersonationBanner({ orgName, targetName }: { orgName?: string; targetName?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function stop() {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/platform/impersonate/stop", { method: "POST" });
      if (res.ok) {
        router.push("/platform");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="status"
      className="sticky top-0 z-[var(--z-sticky)] flex items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm text-primary"
    >
      <p className="min-w-0 truncate">
        <span className="font-semibold">Support impersonation active</span>
        {orgName ? <span className="text-secondary"> — acting as {targetName ?? "a tenant admin"} of {orgName}</span> : null}
        <span className="ml-2 text-xs text-tertiary">every action is audited</span>
      </p>
      <button type="button" onClick={() => stop()} disabled={busy} className={`${btn.secondary} ${btn.small}`}>
        {busy ? "Restoring…" : "Stop impersonating"}
      </button>
    </div>
  );
}
