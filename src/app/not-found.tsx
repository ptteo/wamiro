import Link from "next/link";

import { btn } from "@/components/ui";

/**
 * Phase 6 §4 — branded 404 with recovery actions. Offers the two routes that
 * solve most "wrong URL" moments: Home and the command palette hint.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-5xl font-semibold tracking-tight text-brand-text">404</p>
      <h1 className="text-lg font-medium text-primary">Page not found</h1>
      <p className="max-w-sm text-sm text-tertiary">
        This page doesn&apos;t exist, was moved, or you don&apos;t have access to it.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Link href="/home" className={btn.primary}>
          Back to Home
        </Link>
        <Link href="/help" className={btn.secondary}>
          Visit Help
        </Link>
      </div>
      <p className="mt-3 text-xs text-tertiary">
        Tip: press <kbd className="rounded border border-border-subtle bg-surface px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>{" "}
        anywhere to search people, pages and articles.
      </p>
    </main>
  );
}
