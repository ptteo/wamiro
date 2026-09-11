"use client";

import { useEffect } from "react";

import { btn } from "@/components/ui";

/**
 * Phase 6 §4 — error boundary INSIDE the app shell. Losing the sidebar makes
 * recovery harder, so this boundary keeps the shell chrome (sidebar/topbar are
 * above it) and only replaces the content area.
 */
export default function AppSegmentError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error("[wamiro] app segment error:", error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
      <p className="text-4xl font-semibold tracking-tight text-brand-text">Oops</p>
      <h1 className="text-lg font-medium text-primary">This page hit a snag</h1>
      <p className="max-w-sm text-sm text-tertiary">
        Your data is safe. Retry, or head back to Home if the problem persists.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={reset} className={btn.primary}>
          Try again
        </button>
        <a href="/home" className={btn.secondary}>
          Back to Home
        </a>
      </div>
    </div>
  );
}
