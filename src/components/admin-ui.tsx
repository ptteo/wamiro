"use client";

import { cx } from "@/lib/cx";

export function AdminSection({
  title,
  subtitle,
  tone = "brand",
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  tone?: "brand" | "success" | "warning" | "danger";
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-border-subtle bg-surface p-3 sm:p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cx(
              "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
              tone === "brand" && "bg-brand",
              tone === "success" && "bg-success",
              tone === "warning" && "bg-warning",
              tone === "danger" && "bg-danger",
            )}
            aria-hidden
          />
          <h2 className="truncate text-sm font-semibold text-primary">{title}</h2>
          {subtitle ? (
            <span className="hidden truncate text-xs text-tertiary sm:inline">· {subtitle}</span>
          ) : null}
        </div>
        {action ? <div className="w-full shrink-0 sm:ml-auto sm:w-auto">{action}</div> : null}
      </div>
      {subtitle ? <p className="mb-3 text-xs text-tertiary sm:hidden">{subtitle}</p> : null}
      <div className="min-w-0">{children}</div>
    </section>
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

export function AdminKpi({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "warning" | "danger" | "success";
}) {
  return (
    <div className="px-4 py-3 sm:px-5 sm:py-4">
      <p className="text-xs text-tertiary">{label}</p>
      <p
        className={cx(
          "mt-1 text-lg font-semibold tabular-nums sm:text-xl",
          tone === "danger" && "text-danger",
          tone === "warning" && "text-warning",
          tone === "success" && "text-success",
          tone === "neutral" && "text-primary",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-tertiary">{hint}</p> : null}
    </div>
  );
}
