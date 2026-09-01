"use client";

import { useState } from "react";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // even if the API call fails, fall through to full navigation —
      // a hard load re-checks the (now cleared) session cookie server-side
    }
    // full page navigation instead of router.push: drops the client-side
    // RSC cache, fixing "sign out appears to do nothing"
    window.location.href = "/login";
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      className={`rounded-lg border border-[var(--color-line)] bg-surface font-medium text-secondary transition hover:bg-surface-hover disabled:opacity-50 ${
        compact ? "px-3 py-1.5 text-xs" : "mt-2 w-full px-3 py-1.5 text-xs"
      }`}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
