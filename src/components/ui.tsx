import { cx } from "@/lib/cx";

/*
 * Wamiro design-system primitives.
 * All colors come from the semantic tokens in globals.css — components adapt
 * to light/dark automatically. Never hard-code palette values here.
 */

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-lg border border-border-default bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-primary">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-tertiary">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

const badgeTones = {
  /* Palette-pinned (§8): success = inverted ink chip; warning = brand tint;
     danger = approved red tint. Distinction never relies on green/blue hues. */
  neutral: "bg-surface-subtle text-secondary border border-border-default",
  green: "bg-[var(--text-primary)] text-[var(--background)] border border-transparent",
  amber: "bg-warning-subtle text-warning",
  red: "bg-danger-subtle text-danger",
  brand: "bg-brand-subtle text-brand-text",
  success: "bg-success-subtle text-success",
  tertiary: "bg-surface-subtle text-tertiary",
} as const;

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: keyof typeof badgeTones;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        badgeTones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): keyof typeof badgeTones {
  switch (status) {
    case "approved":
    case "active":
    case "done":
      return "green";
    case "pending":
    case "invited":
    case "on_leave":
      return "amber";
    case "rejected":
    case "suspended":
      return "red";
    default:
      return "neutral";
  }
}

export function EmptyState({
  title,
  hint,
  icon,
  action,
}: {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-5 py-10 text-center">
      {icon ? (
        <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-subtle text-tertiary">
          {icon}
        </div>
      ) : null}
      <p className="mt-2 text-sm font-medium text-primary">{title}</p>
      {hint ? <p className="mt-1 text-sm text-tertiary">{hint}</p> : null}
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "neutral" | "red" | "amber" | "brand" | "green" | "success" | "tertiary";
}) {
  return (
    <Card className="px-5 py-4">
      <p className="text-xs font-medium text-tertiary">{label}</p>
      <p
        className={cx(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "red" && "text-danger",
          tone === "amber" && "text-warning",
          tone === "brand" && "text-brand-text",
          tone === "green" && "text-success",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-tertiary">{hint}</p> : null}
    </Card>
  );
}

const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-on-brand transition hover:bg-brand-hover active:bg-brand-active disabled:pointer-events-none disabled:opacity-50",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-primary transition hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-50",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-md border border-danger/30 bg-surface px-3 py-1.5 text-sm font-medium text-danger transition hover:bg-danger-subtle disabled:pointer-events-none disabled:opacity-50",
  success:
    "inline-flex items-center justify-center gap-2 rounded-md border border-success/30 bg-surface px-3 py-1.5 text-sm font-medium text-success transition hover:bg-success-subtle disabled:pointer-events-none disabled:opacity-50",
  small: "px-2.5 py-1.5 text-xs",
};

const input =
  "w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-primary placeholder:text-disabled focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

export function Avatar({ name, src, className }: { name: string; src?: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  if (src) {
     
    return (
      <img
        src={src}
        alt={name}
        className={cx(
          "inline-block h-9 w-9 shrink-0 rounded-full object-cover",
          className,
        )}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-xs font-semibold text-brand-text",
        className,
      )}
    >
      {initials || "?"}
    </span>
  );
}

/**
 * Tiny status dot, used in the corner of an avatar. 8px circle with a
 * 2px white ring so it stands out against the avatar fill.
 */
export function StatusDot({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const tone =
    status === "active"
      ? "bg-success"
      : status === "invited"
        ? "bg-warning"
        : status === "suspended"
          ? "bg-danger"
          : "bg-tertiary";
  return (
    <span
      aria-label={status}
      title={status}
      className={cx("inline-block h-2 w-2 rounded-full ring-2 ring-surface", tone, className)}
    />
  );
}

/** Loading primitive — token-based, accessible. D10 §42 loading states. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block animate-pulse rounded bg-surface-subtle ${className}`}
    />
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <ul aria-hidden className="divide-y divide-border-subtle">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center justify-between gap-3 px-5 py-3">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-3 w-24" />
        </li>
      ))}
    </ul>
  );
}

export { btn, input };

/* ============================================================================
 * Frappe-grammar upgrades (D-ui redesign): Button, PageHeader, Table.
 * Geometry: buttons h-8 (compact) / h-9; table rows 40px dense / 48 standard;
 * radius 6px controls, 10px cards; one primary action per view.
 * ==========================================================================*/

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  loading?: boolean;
}) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
        variant === "primary" && "bg-brand text-on-brand hover:bg-brand-hover active:bg-brand-active",
        variant === "secondary" &&
          "border border-border-strong bg-surface text-primary hover:bg-surface-hover",
        variant === "danger" &&
          "border border-danger/40 bg-surface text-danger hover:bg-danger-subtle",
        variant === "ghost" && "text-secondary hover:bg-surface-hover",
        size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm",
        loading && "pointer-events-none opacity-80",
        className,
      )}
    >
      {loading ? (
        <span
          aria-hidden
          className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}

/** §60: sticky-capable page header with title/subtitle/actions slots. */
export function PageHeader({
  title,
  subtitle,
  actions,
  sticky,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  sticky?: boolean;
}) {
  return (
    <header
      className={cx(
        "flex flex-wrap items-end justify-between gap-3 pb-1",
        sticky &&
          "sticky top-0 z-[var(--z-sticky)] -mx-1 bg-[var(--background)] px-1 pt-1",
      )}
    >
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-primary">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-secondary">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Dense Frappe-style table. Wrap in a Card for surface + border. */
export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="sticky top-0 z-[var(--z-sticky)] bg-surface">
      <tr className="border-b border-border-subtle">{children}</tr>
    </thead>
  );
}

export function Th({
  children,
  align = "left",
  className,
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cx(
        "px-3 py-2 text-xs font-medium text-tertiary",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Tr({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      className={cx(
        "border-b border-border-subtle last:border-0",
        onClick && "cursor-pointer hover:bg-surface-hover",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function Td({
  children,
  align = "left",
  className,
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={cx(
        "px-3 py-2 text-primary",
        align === "right" ? "text-right tabular-nums" : "text-left",
        className,
      )}
    >
      {children}
    </td>
  );
}
