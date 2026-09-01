"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Grid3x3,
  List,
  Plus,
  Search,
  Target,
  User,
  X,
} from "lucide-react";

import { Avatar, Badge } from "./ui";
import { cx } from "@/lib/cx";

export interface GoalClientRow {
  id: string;
  title: string;
  description: string | null;
  status: "active" | "done" | "archived";
  progress: number;
  dueDate: string | null;
  ownerId: string;
  ownerName: string;
  createdAt: string; // ISO
  mine: boolean;
  canManage: boolean;
}

type ViewMode = "grid" | "list";
type ScopeFilter = "all" | "mine";
type StatusFilter = "all" | "at_risk" | "active" | "done";

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  done: "Done",
  archived: "Archived",
};

const STATUS_TONE: Record<string, "neutral" | "success" | "tertiary"> = {
  active: "success",
  done: "neutral",
  archived: "tertiary",
};

function isOverdue(due: string | null, status: string): boolean {
  if (!due || status !== "active") return false;
  const d = new Date(due + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

function daysUntil(due: string | null): number | null {
  if (!due) return null;
  const d = new Date(due + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function relDue(due: string | null, status: string): { label: string; tone: "muted" | "warning" | "danger" | "success" } | null {
  if (!due) return null;
  if (status === "done") return { label: `Done · was due ${due}`, tone: "success" };
  const days = daysUntil(due);
  if (days === null) return null;
  if (days < 0) {
    const n = Math.abs(days);
    return { label: `Overdue by ${n} day${n === 1 ? "" : "s"} (due ${due})`, tone: "danger" };
  }
  if (days === 0) return { label: `Due today (${due})`, tone: "warning" };
  if (days === 1) return { label: `Due tomorrow (${due})`, tone: "warning" };
  if (days <= 14) return { label: `Due in ${days} days (${due})`, tone: "warning" };
  return { label: `Due ${due}`, tone: "muted" };
}

function progressTone(progress: number, status: string): "brand" | "success" | "warning" | "danger" {
  if (status === "done" || progress >= 100) return "success";
  if (progress >= 70) return "brand";
  if (progress >= 30) return "warning";
  return "danger";
}

function progressBarColor(progress: number, status: string): string {
  if (status === "done" || progress >= 100) return "bg-success";
  if (progress >= 70) return "bg-brand";
  if (progress >= 30) return "bg-warning";
  return "bg-danger";
}

export function GoalsListClient({
  goals,
  canCreate,
}: {
  goals: GoalClientRow[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("grid");
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce search into URL
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (scope !== "all") params.set("s", scope);
      if (status !== "all") params.set("st", status);
      if (view !== "grid") params.set("v", view);
      const qs = params.toString();
      router.replace(qs ? `/goals?${qs}` : "/goals", { scroll: false });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, scope, status, view]);

  // Group + filter
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return goals.filter((g) => {
      if (scope === "mine" && !g.mine) return false;
      if (status === "at_risk" && !(g.status === "active" && isOverdue(g.dueDate, g.status))) return false;
      if (status === "active" && g.status !== "active") return false;
      if (status === "done" && g.status !== "done") return false;
      if (needle) {
        if (
          !g.title.toLowerCase().includes(needle) &&
          !(g.description ?? "").toLowerCase().includes(needle) &&
          !g.ownerName.toLowerCase().includes(needle)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [goals, q, scope, status]);

  const groups = useMemo(() => {
    const atRisk: GoalClientRow[] = [];
    const active: GoalClientRow[] = [];
    const done: GoalClientRow[] = [];
    for (const g of visible) {
      if (g.status === "done") done.push(g);
      else if (g.status === "active" && isOverdue(g.dueDate, g.status)) atRisk.push(g);
      else active.push(g);
    }
    return { atRisk, active, done };
  }, [visible]);

  const summary = useMemo(() => {
    const activeCount = goals.filter((g) => g.status === "active").length;
    const doneCount = goals.filter((g) => g.status === "done").length;
    const atRiskCount = goals.filter(
      (g) => g.status === "active" && isOverdue(g.dueDate, g.status),
    ).length;
    // "owned by you" = every goal where the viewer is the owner, regardless of status
    const mineTotal = goals.filter((g) => g.mine).length;
    const mineActive = goals.filter((g) => g.mine && g.status === "active").length;
    const avgProgress =
      activeCount > 0
        ? Math.round(
            goals
              .filter((g) => g.status === "active")
              .reduce((s, g) => s + g.progress, 0) / activeCount,
          )
        : 0;
    return {
      total: goals.length,
      active: activeCount,
      done: doneCount,
      atRisk: atRiskCount,
      mineTotal,
      mineActive,
      avgProgress,
    };
  }, [goals]);

  return (
    <div className="space-y-5">
      {/* Toolbar — search + filters + view + new */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 grow sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tertiary" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search goals…"
            aria-label="Search goals"
            className="w-full rounded-md border border-border-default bg-surface py-1.5 pl-8 pr-8 text-sm text-primary placeholder:text-tertiary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          {q ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-tertiary hover:text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <div className="inline-flex rounded-md border border-border-subtle bg-surface p-0.5 text-xs">
          {([
            ["all", "All"],
            ["mine", "My goals"],
          ] as Array<[ScopeFilter, string]>).map(([s, label]) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              aria-pressed={scope === s}
              className={cx(
                "rounded px-2.5 py-1 font-medium transition",
                scope === s
                  ? "bg-brand text-on-brand"
                  : "text-tertiary hover:text-primary",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="inline-flex rounded-md border border-border-subtle bg-surface p-0.5 text-xs">
          {([
            ["all", "All status"],
            ["at_risk", "At risk"],
            ["active", "Active"],
            ["done", "Completed"],
          ] as Array<[StatusFilter, string]>).map(([s, label]) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              aria-pressed={status === s}
              className={cx(
                "rounded px-2.5 py-1 font-medium transition",
                status === s
                  ? "bg-brand text-on-brand"
                  : "text-tertiary hover:text-primary",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto inline-flex rounded-md border border-border-subtle bg-surface p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setView("grid")}
            aria-pressed={view === "grid"}
            aria-label="Grid view"
            className={cx(
              "inline-flex h-6 w-7 items-center justify-center rounded",
              view === "grid" ? "bg-brand text-on-brand" : "text-tertiary hover:text-primary",
            )}
          >
            <Grid3x3 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            aria-pressed={view === "list"}
            aria-label="List view"
            className={cx(
              "inline-flex h-6 w-7 items-center justify-center rounded",
              view === "list" ? "bg-brand text-on-brand" : "text-tertiary hover:text-primary",
            )}
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>

        {canCreate ? (
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-hover"
          >
            <Plus className="h-3.5 w-3.5" />
            New goal
          </button>
        ) : null}
      </div>

      {/* One-line summary */}
      <p className="text-xs text-tertiary">
        {summary.total} goal{summary.total === 1 ? "" : "s"} ·{" "}
        {summary.active} active · {summary.done} done ·{" "}
        {summary.atRisk > 0 ? (
          <span className="font-medium text-danger">{summary.atRisk} at risk</span>
        ) : (
          <span>0 at risk</span>
        )}
        {summary.mineTotal > 0 ? (
          <> · {summary.mineTotal} owned by you{summary.mineActive < summary.mineTotal ? ` (${summary.mineActive} active)` : ""}</>
        ) : null}
        {q ? <> · {visible.length} match{visible.length === 1 ? "" : "es"} for &ldquo;{q}&rdquo;</> : null}
      </p>

      {creating ? (
        <NewGoalForm
          busy={busy}
          error={error}
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            router.refresh();
          }}
          onSubmit={async (title, description, dueDate) => {
            setBusy(true);
            setError(null);
            try {
              const res = await fetch("/api/v1/goals", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ title, description, dueDate }),
              });
              if (!res.ok) {
                const d = (await res.json()) as { error?: { message?: string } };
                setError(d.error?.message ?? "Could not create goal");
                return false;
              }
              return true;
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}

      {/* Results */}
      {visible.length === 0 ? (
        <GoalsEmpty scope={scope} status={status} q={q} canCreate={canCreate} onCreate={() => setCreating(true)} />
      ) : view === "grid" ? (
        <div className="space-y-8">
          {groups.atRisk.length > 0 ? (
            <GoalSection
              title="At risk"
              subtitle="Active goals past their target date"
              tone="danger"
              count={groups.atRisk.length}
            >
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {groups.atRisk.map((g) => (
                  <li key={g.id}>
                    <GoalCard goal={g} onProgressChange={() => router.refresh()} />
                  </li>
                ))}
              </ul>
            </GoalSection>
          ) : null}
          {groups.active.length > 0 ? (
            <GoalSection
              title="Active"
              subtitle="In progress, on track"
              tone="brand"
              count={groups.active.length}
            >
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {groups.active.map((g) => (
                  <li key={g.id}>
                    <GoalCard goal={g} onProgressChange={() => router.refresh()} />
                  </li>
                ))}
              </ul>
            </GoalSection>
          ) : null}
          {groups.done.length > 0 ? (
            <GoalSection
              title="Completed"
              subtitle="100% done — closed out"
              tone="success"
              count={groups.done.length}
            >
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {groups.done.map((g) => (
                  <li key={g.id}>
                    <GoalCard goal={g} onProgressChange={() => router.refresh()} />
                  </li>
                ))}
              </ul>
            </GoalSection>
          ) : null}
        </div>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
          {[
            ...groups.atRisk.map((g) => ({ g, _section: "at_risk" as const })),
            ...groups.active.map((g) => ({ g, _section: "active" as const })),
            ...groups.done.map((g) => ({ g, _section: "done" as const })),
          ].map(({ g }) => (
            <li key={g.id}>
              <GoalRow goal={g} onProgressChange={() => router.refresh()} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────
function GoalSection({
  title,
  subtitle,
  tone,
  count,
  children,
}: {
  title: string;
  subtitle: string;
  tone: "brand" | "success" | "danger";
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cx(
            "inline-block h-1.5 w-1.5 rounded-full",
            tone === "brand" && "bg-brand",
            tone === "success" && "bg-success",
            tone === "danger" && "bg-danger",
          )}
          aria-hidden
        />
        <h2 className="text-sm font-semibold text-primary">{title}</h2>
        <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-tertiary">
          {count}
        </span>
        <span className="text-xs text-tertiary">· {subtitle}</span>
      </div>
      {children}
    </section>
  );
}

function GoalCard({
  goal: g,
  onProgressChange,
}: {
  goal: GoalClientRow;
  onProgressChange: () => void;
}) {
  const tone = progressTone(g.progress, g.status);
  const bar = progressBarColor(g.progress, g.status);
  const due = relDue(g.dueDate, g.status);
  const overdue = isOverdue(g.dueDate, g.status);
  const editable = g.mine || g.canManage;
  return (
    <div
      className={cx(
        "flex h-full flex-col rounded-lg border bg-surface transition",
        overdue
          ? "border-danger/40 hover:border-danger/60"
          : "border-border-subtle hover:border-border-default",
        "hover:shadow-[0_4px_10px_rgba(16,24,40,0.08)]",
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-4">
        <div
          className={cx(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
            g.status === "done" ? "bg-success-subtle text-success" : "bg-brand-subtle text-brand-text",
          )}
          aria-hidden
        >
          {g.status === "done" ? <CheckCircle2 className="h-4 w-4" /> : <Target className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-primary">{g.title}</h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {g.mine ? (
              <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-tertiary">
                You
              </span>
            ) : null}
            <Badge tone={STATUS_TONE[g.status] ?? "neutral"}>{STATUS_LABEL[g.status] ?? g.status}</Badge>
            {overdue ? <Badge tone="red">Overdue</Badge> : null}
          </div>
        </div>
        <span
          className={cx(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
            tone === "success" && "bg-success-subtle text-success",
            tone === "brand" && "bg-brand-subtle text-brand-text",
            tone === "warning" && "bg-warning-subtle text-warning",
            tone === "danger" && "bg-danger-subtle text-danger",
          )}
        >
          {g.progress}%
        </span>
      </div>
      {g.description ? (
        <p className="line-clamp-2 px-4 pt-2 text-xs text-secondary">{g.description}</p>
      ) : null}

      {/* Progress */}
      <div className="px-4 pt-3">
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-tertiary">
          <span>Progress</span>
          <span className="tabular-nums text-primary">{g.progress}/100</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
          <div
            className={cx("h-full", bar)}
            style={{ width: `${Math.max(2, Math.min(100, g.progress))}%` }}
            aria-hidden
          />
        </div>
      </div>

      {/* Owner + due */}
      <div className="mt-auto flex items-center justify-between gap-2 px-4 pb-4 pt-3 text-[11px] text-tertiary">
        <div className="flex min-w-0 items-center gap-1.5">
          <Avatar name={g.ownerName} className="!h-5 !w-5 text-[9px]" />
          <span className="truncate">{g.ownerName}</span>
        </div>
        {due ? (
          <span
            className={cx(
              "inline-flex items-center gap-1",
              due.tone === "danger" && "text-danger",
              due.tone === "warning" && "text-warning",
              due.tone === "success" && "text-success",
              due.tone === "muted" && "text-tertiary",
            )}
          >
            <CalendarDays className="h-3 w-3" />
            {due.label}
          </span>
        ) : (
          <span className="text-disabled">No target</span>
        )}
      </div>

      {/* Inline editor for owner or goals.manage */}
      {editable && g.status !== "done" ? (
        <InlineProgressEditor goal={g} onChange={onProgressChange} />
      ) : null}
    </div>
  );
}

function GoalRow({
  goal: g,
  onProgressChange,
}: {
  goal: GoalClientRow;
  onProgressChange: () => void;
}) {
  const tone = progressTone(g.progress, g.status);
  const bar = progressBarColor(g.progress, g.status);
  const due = relDue(g.dueDate, g.status);
  const overdue = isOverdue(g.dueDate, g.status);
  const editable = g.mine || g.canManage;
  return (
    <div
      className={cx(
        "flex items-center gap-4 border-b border-border-subtle px-5 py-4 last:border-b-0 transition",
        overdue ? "bg-danger-subtle/30" : "hover:bg-surface-hover",
      )}
    >
      <div
        className={cx(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
          g.status === "done" ? "bg-success-subtle text-success" : "bg-brand-subtle text-brand-text",
        )}
        aria-hidden
      >
        {g.status === "done" ? <CheckCircle2 className="h-4 w-4" /> : <Target className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="truncate text-sm font-semibold text-primary">{g.title}</h3>
          <Badge tone={STATUS_TONE[g.status] ?? "neutral"}>{STATUS_LABEL[g.status] ?? g.status}</Badge>
          {g.mine ? (
            <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-tertiary">
              You
            </span>
          ) : null}
          {overdue ? <Badge tone="red">Overdue</Badge> : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-tertiary">
          <span className="inline-flex items-center gap-1">
            <User className="h-3 w-3" />
            {g.ownerName}
          </span>
          {due ? (
            <span
              className={cx(
                "inline-flex items-center gap-1",
                due.tone === "danger" && "text-danger",
                due.tone === "warning" && "text-warning",
                due.tone === "success" && "text-success",
                due.tone === "muted" && "text-tertiary",
              )}
            >
              <CalendarDays className="h-3 w-3" />
              {due.label}
            </span>
          ) : null}
        </div>
      </div>
      {g.status !== "done" ? (
        <div className="hidden w-44 sm:block">
          <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
            <div
              className={cx("h-full", bar)}
              style={{ width: `${Math.max(2, Math.min(100, g.progress))}%` }}
            />
          </div>
          <p className="text-right text-[10px] tabular-nums text-tertiary">
            <span
              className={cx(
                tone === "success" && "text-success",
                tone === "brand" && "text-brand-text",
                tone === "warning" && "text-warning",
                tone === "danger" && "text-danger",
              )}
            >
              {g.progress}%
            </span>
          </p>
        </div>
      ) : (
        <span className="hidden rounded-full bg-success-subtle px-2 py-0.5 text-xs font-semibold text-success sm:inline">
          Done
        </span>
      )}
      {editable && g.status !== "done" ? (
        <InlineProgressEditor goal={g} compact onChange={onProgressChange} />
      ) : null}
    </div>
  );
}

function InlineProgressEditor({
  goal: g,
  compact,
  onChange,
}: {
  goal: GoalClientRow;
  compact?: boolean;
  onChange: () => void;
}) {
  const [value, setValue] = useState(g.progress);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    if (value === g.progress) return;
    if (value < 0 || value > 100) {
      setError("0–100");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/goals/${g.id}/progress`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ progress: value }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Update failed");
        return;
      }
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cx(
        "flex items-center gap-2 border-t border-border-subtle bg-surface-subtle/50 px-4 py-2",
        compact && "border-t-0 bg-transparent px-0",
      )}
    >
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        onMouseUp={commit}
        onTouchEnd={commit}
        onKeyUp={commit}
        disabled={busy}
        aria-label={`Progress for ${g.title}`}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-subtle accent-[var(--color-brand-500)] disabled:opacity-50"
      />
      {!compact ? (
        <input
          type="number"
          min={0}
          max={100}
          value={value}
          onChange={(e) => setValue(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="w-14 rounded-md border border-border-default bg-surface px-1.5 py-1 text-right text-xs tabular-nums"
        />
      ) : (
        <span className="w-8 text-right text-xs tabular-nums text-tertiary">{value}%</span>
      )}
      {busy ? (
        <span
          aria-live="polite"
          className="inline-flex items-center gap-1 text-[10px] text-tertiary"
        >
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          Saving
        </span>
      ) : null}
      {error ? <span className="text-[10px] text-danger">{error}</span> : null}
    </div>
  );
}

function NewGoalForm({
  busy,
  error,
  onCancel,
  onCreated,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onCreated: () => void;
  onSubmit: (title: string, description: string | null, dueDate: string | null) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  return (
    <form
      className="rounded-lg border border-border-subtle bg-surface px-4 py-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await onSubmit(title.trim(), description.trim() || null, dueDate || null);
        if (ok) {
          setTitle("");
          setDescription("");
          setDueDate("");
          onCreated();
        }
      }}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 shrink-0 text-tertiary" aria-hidden />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Goal title (e.g. Reach 1000 paying customers)"
            required
            minLength={2}
            maxLength={200}
            className="min-w-0 grow bg-transparent text-sm text-primary placeholder:text-tertiary focus:outline-none"
          />
        </div>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          aria-label="Target date"
          className="rounded-md border border-border-default bg-surface px-2 py-1 text-xs"
        />
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-on-brand transition hover:bg-brand-hover disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2 py-1 text-xs text-tertiary hover:text-primary"
        >
          Cancel
        </button>
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional) — what does success look like?"
        maxLength={2000}
        rows={2}
        className="mt-2 w-full resize-y rounded-md border border-border-default bg-surface px-2 py-1.5 text-xs text-primary placeholder:text-tertiary focus:border-brand focus:outline-none"
      />
      {error ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function GoalsEmpty({
  scope,
  status,
  q,
  canCreate,
  onCreate,
}: {
  scope: ScopeFilter;
  status: StatusFilter;
  q: string;
  canCreate: boolean;
  onCreate: () => void;
}) {
  let title = "No goals yet";
  let hint = "Create the first company objective to get started.";
  if (q) {
    title = "No goals match your search";
    hint = "Try a different search term or clear the filter.";
  } else if (status === "at_risk") {
    title = "Nothing at risk";
    hint = "All your active goals are still on schedule.";
  } else if (status === "done") {
    title = "No completed goals yet";
    hint = "Goals hit 100% appear here.";
  } else if (scope === "mine") {
    title = "You don't own any goals yet";
    hint = "Create a goal, or ask a teammate to make you the owner.";
  }
  return (
    <div className="rounded-lg border border-dashed border-border-default bg-surface px-6 py-10 text-center">
      <Target className="mx-auto h-6 w-6 text-tertiary" />
      <p className="mt-2 text-sm font-medium text-primary">{title}</p>
      <p className="mt-1 text-xs text-tertiary">{hint}</p>
      {canCreate && !q ? (
        <button
          type="button"
          onClick={onCreate}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          New goal
        </button>
      ) : null}
    </div>
  );
}
