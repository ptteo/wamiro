import Link from "next/link";

import { cx } from "@/lib/cx";

/**
 * Workspace grammar (Phase D1 §21–23): every page opens with the same
 * header contract and sits in a declared content width, so users learn
 * one geometry and apply it everywhere.
 */

const WIDTHS = {
  full: "max-w-none",
  wide: "max-w-7xl",
  standard: "max-w-5xl",
  reading: "max-w-2xl",
} as const;

export function Content({
  width = "standard",
  children,
  className,
}: {
  width?: keyof typeof WIDTHS;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("mx-auto w-full px-4 py-8 sm:px-6", WIDTHS[width], className)}>
      {children}
    </div>
  );
}

export interface PageAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

/** Canonical page header: title + subtitle left, primary action right. */
export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  primaryAction,
  children,
}: {
  title: string;
  subtitle?: string;
  breadcrumb?: { label: string; href: string }[];
  primaryAction?: PageAction;
  /** Extra controls (tabs, filters, secondary buttons) */
  children?: React.ReactNode;
}) {
  const cls =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50";
  return (
    <header className="mb-6 space-y-3">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-tertiary">
          {breadcrumb.map((c, i) => (
            <span key={`${c.href}-${i}`} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden>/</span>}
              <Link href={c.href} className="hover:text-primary hover:underline">
                {c.label}
              </Link>
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-primary">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-secondary">{subtitle}</p>}
        </div>
        {primaryAction &&
          (primaryAction.href ? (
            <Link href={primaryAction.href} className={`bg-brand ${cls} text-white hover:bg-brand-hover`}>
              {primaryAction.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={primaryAction.onClick}
              className={`bg-brand ${cls} text-white hover:bg-brand-hover`}
            >
              {primaryAction.label}
            </button>
          ))}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
