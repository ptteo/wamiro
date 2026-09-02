"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";

import { cx } from "@/lib/cx";

export function LogoutButton({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // even if the API call fails, fall through to full navigation —
      // a hard load re-checks the (now cleared) session cookie server-side
    }
    window.location.href = "/login";
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md border border-border-default bg-surface font-medium text-secondary transition hover:bg-surface-hover hover:text-primary disabled:opacity-50",
        compact ? "h-8 px-2.5 text-xs" : "mt-2 w-full px-3 py-1.5 text-xs",
        className,
      )}
    >
      <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
