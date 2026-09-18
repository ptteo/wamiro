import Link from "next/link";

import { cx } from "@/lib/cx";

/**
 * Platform console sub-navigation + page frame.
 *
 * `data-fill-workspace` makes the shell's <main> a fixed, non-scrolling flex
 * column (max-width and padding removed), so every platform page renders:
 *
 *   <PlatformShell>            ← fills main, never scrolls
 *     <PlatformSubNav/>        ← always visible above the scroller
 *     <div data-scroll>        ← the only scrolling element
 *
 * PlatformSubNav is a server component — the active tab rides the `current`
 * prop computed by each page (no usePathname client island needed).
 */
const SECTIONS = [
  { href: "/platform", label: "Overview" },
  { href: "/platform/revenue", label: "Revenue" },
  { href: "/platform/controls", label: "Controls" },
] as const;

export function PlatformSubNav({
  current,
}: {
  current: (typeof SECTIONS)[number]["href"];
}) {
  return (
    <nav
      aria-label="Platform sections"
      className="flex shrink-0 items-center gap-1 border-b border-border-subtle bg-surface px-4 pt-2 sm:px-6"
    >
      <span className="mr-2 hidden text-[11px] font-semibold uppercase tracking-wider text-tertiary sm:block">
        Platform
      </span>
      {SECTIONS.map((s) => {
        const active = s.href === current;
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-brand font-medium text-brand-text"
                : "border-transparent text-tertiary hover:text-secondary",
            )}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Common frame for platform pages: sub-nav pinned above an independent
 * scroll column, so long tables never push the tabs out of view.
 */
export function PlatformShell({
  current,
  children,
}: {
  current: (typeof SECTIONS)[number]["href"];
  children: React.ReactNode;
}) {
  return (
    <div data-fill-workspace className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PlatformSubNav current={current} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-5 sm:px-6 md:pb-8">
        {children}
      </div>
    </div>
  );
}

/** Page header block shared by every platform section (title + lede). */
export function PlatformPageHeader({ title, lede }: { title: string; lede: string }) {
  return (
    <header className="pb-1">
      <h1 className="text-2xl font-semibold tracking-tight text-primary">{title}</h1>
      <p className="mt-1 max-w-3xl text-sm text-secondary">{lede}</p>
    </header>
  );
}
