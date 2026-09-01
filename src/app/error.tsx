"use client";

/** Route-level error boundary: explains, offers recovery (blueprint §71). */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-lg font-medium">Something went wrong</h1>
      <p className="max-w-sm text-sm text-[var(--color-muted)]">
        An unexpected error occurred. Your data is safe — try again, and if the problem
        persists contact your administrator.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-brand-700)]"
      >
        Try again
      </button>
    </main>
  );
}
