import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-4xl font-semibold text-[var(--color-brand-600)]">404</p>
      <h1 className="text-lg font-medium">Page not found</h1>
      <p className="max-w-sm text-sm text-[var(--color-muted)]">
        This page doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <Link
        href="/home"
        className="rounded-lg bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-brand-700)]"
      >
        Back to Home
      </Link>
    </main>
  );
}
