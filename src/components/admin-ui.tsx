"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, type LucideIcon } from "lucide-react";

import { cx } from "@/lib/cx";

/*
 * Admin console primitives.
 * One visual grammar for every admin page: tab strip for wayfinding,
 * KPI strip for numbers, section card for lists, tile grid for the console
 * home. Colors come from semantic tokens only.
 */

export type AdminTone = "brand" | "success" | "warning" | "danger" | "neutral";

const toneDot: Record<AdminTone, string> = {
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-tertiary",
};

const toneText: Record<AdminTone, string> = {
  brand: "text-brand-text",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  neutral: "text-primary",
};

/** Section header row: dot + title + subtitle + trailing action. */
export function AdminSectionHeader({
  title,
  subtitle,
  tone = "brand",
  action,
}: {
  title: string;
  subtitle?: string;
  tone?: AdminTone;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cx("inline-block h-1.5 w-1.5 shrink-0 rounded-full", toneDot[tone])}
          aria-hidden
        />
        <h2 className="truncate text-sm font-semibold text-primary">{title}</h2>
        {subtitle ? (
          <span className="hidden truncate text-xs text-tertiary sm:inline">
            <span aria-hidden className="mr-1.5">·</span>
            {subtitle}
          </span>
        ) : null}
      </div>
      {action ? <div className="w-full shrink-0 sm:ml-auto sm:w-auto">{action}</div> : null}
    </div>
  );
}

/** Content card with the admin section grammar (header + body). */
export function AdminSection({
  title,
  subtitle,
  tone = "brand",
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  tone?: AdminTone;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-border-subtle bg-surface p-3 sm:p-4">
      <AdminSectionHeader title={title} subtitle={subtitle} tone={tone} action={action} />
      {subtitle ? <p className="mb-3 text-xs text-tertiary sm:hidden">{subtitle}</p> : null}
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** Sticky, permission-filtered sub-navigation shown on every admin page. */
export function AdminNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname() ?? "/admin";
  return (
    <nav
      aria-label="Admin sections"
      className="-mx-4 mb-1 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    >
      <ul className="flex items-center gap-1 border-b border-border-subtle pb-px">
        {items.map((item) => {
          const current =
            item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cx(
                  "inline-flex h-8 items-center rounded-t-md border-b-2 px-3 text-[13px] font-medium transition",
                  current
                    ? "border-brand text-primary"
                    : "border-transparent text-tertiary hover:border-border-strong hover:text-secondary",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AdminKpiStrip({
  children,
  columns = 4,
}: {
  children: React.ReactNode;
  columns?: 3 | 4;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
      <div
        className={cx(
          "grid divide-border-subtle",
          columns === 4
            ? "grid-cols-2 divide-x divide-y lg:grid-cols-4 lg:divide-y-0"
            : "grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** One number on the KPI strip. Pass href to make the whole tile clickable. */
export function AdminKpi({
  label,
  value,
  hint,
  tone = "neutral",
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: AdminTone;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-xs text-tertiary">{label}</p>
      <p
        className={cx(
          "mt-1 text-lg font-semibold tabular-nums sm:text-xl",
          toneText[tone],
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-tertiary">{hint}</p> : null}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="group block px-4 py-3 transition hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] sm:px-5 sm:py-4"
      >
        {body}
        <span className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium text-tertiary opacity-0 transition group-hover:opacity-100">
          Open <ChevronRight className="h-3 w-3" aria-hidden />
        </span>
      </Link>
    );
  }
  return <div className="px-4 py-3 sm:px-5 sm:py-4">{body}</div>;
}

/** Console-home navigation tile: icon + label + one-line hint + count chip. */
export function AdminTile({
  href,
  icon: Icon,
  label,
  hint,
  count,
  countLabel,
  tone = "neutral",
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  hint: string;
  count?: number | string;
  countLabel?: string;
  tone?: AdminTone;
}) {
  return (
    <Link
      href={href}
      className="group flex min-w-0 flex-col gap-1 rounded-lg border border-border-subtle bg-surface p-4 transition hover:border-border-strong hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-tertiary group-hover:text-brand-text" strokeWidth={1.75} aria-hidden />
          <span className="truncate text-sm font-semibold text-primary">{label}</span>
        </span>
        {count !== undefined ? (
          <span
            className={cx(
              "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
              tone === "warning" && "bg-warning-subtle text-warning",
              tone === "danger" && "bg-danger-subtle text-danger",
              tone === "brand" && "bg-brand-subtle text-brand-text",
              tone === "neutral" && "bg-surface-subtle text-secondary",
              tone === "success" && "bg-success-subtle text-success",
            )}
          >
            {count}
            {countLabel ? <span className="ml-1 font-normal text-tertiary">{countLabel}</span> : null}
          </span>
        ) : null}
      </span>
      <span className="text-xs leading-relaxed text-tertiary">{hint}</span>
      <span className="mt-auto inline-flex items-center gap-0.5 pt-1 text-xs font-medium text-brand-text opacity-0 transition group-hover:opacity-100">
        Open <ChevronRight className="h-3 w-3" aria-hidden />
      </span>
    </Link>
  );
}

/** Shared row for compact "attention" lists. */
export function AdminAttentionRow({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium text-primary">{title}</p>
        <p className="text-xs text-tertiary">{detail}</p>
      </div>
      <div className="w-full shrink-0 sm:w-auto">{action}</div>
    </li>
  );
}
