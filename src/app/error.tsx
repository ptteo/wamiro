"use client";

import { useEffect } from "react";

import { btn } from "@/components/ui";

/**
 * Phase 6 §4 — branded route-level error boundary (blueprint §71): explains
 * what happened, offers real recovery actions, and logs the error object so
 * server/journald/GlitchTip pipelines capture the stack.
 */
export default function ErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // Client-side errors are otherwise invisible to the ops pipeline.
    console.error("[wamiro] route error:", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-5xl font-semibold tracking-tight text-brand-text">Oops</p>
      <h1 className="text-lg font-medium text-primary">Something went wrong</h1>
      <p className="max-w-sm text-sm text-tertiary">
        An unexpected error occurred. Your data is safe — try again, and if the problem persists
        contact your administrator.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={reset} className={btn.primary}>
          Try again
        </button>
        <a href="/home" className={btn.secondary}>
          Back to Home
        </a>
      </div>
      <p className="mt-3 text-xs text-tertiary">
        If this keeps happening, include the time it occurred when you contact support.
      </p>
    </main>
  );
}
