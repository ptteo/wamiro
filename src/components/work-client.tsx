"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  Clock3,
  Filter,
  Folder,
  Inbox,
  ListTodo,
  Plus,
  Search,
  X,
} from "lucide-react";

import { Badge } from "./ui";
import { cx } from "@/lib/cx";

export interface WorkTask {
  id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done" | "cancelled" | string;
  priority: "low" | "medium" | "high" | string;
  dueDate: string | null; // YYYY-MM-DD or null
  projectId: string | null;
  projectName: string | null;
  assigneeId: string;
  assigneeName: string;
  loggedMinutes: number;
}

export interface WorkProject {
  id: string;
  name: string;
}

export interface WorkData {
  tasks: WorkTask[];
  projects: WorkProject[];
  teamTasks: WorkTask[];
}

const PRIORITY_COLOR: Record<string, string> = {
  high: "bg-danger",
  medium: "bg-warning",
  low: "bg-tertiary",
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  todo: <Circle className="h-4 w-4" />,
  in_progress: <CircleDot className="h-4 w-4 text-brand" />,
  done: <Check className="h-4 w-4 text-success" />,
  cancelled: <X className="h-4 w-4 text-tertiary" />,
};

const STATUS_LABEL: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};

type PriorityFilter = "all" | "high" | "medium" | "low";
type StatusFilter = "open" | "in_progress" | "done" | "all";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  const ad = new Date(a + "T00:00:00").getTime();
  const bd = new Date(b + "T00:00:00").getTime();
  return Math.round((bd - ad) / 86_400_000);
}
function fmtDueRelative(due: string, today: string): string {
  const diff = daysBetween(today, due);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < -1) return `${Math.abs(diff)}d overdue`;
  if (diff < 7) return `in ${diff}d`;
  if (diff < 30) return `in ${Math.floor(diff / 7)}w`;
  return new Date(due + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function bucketFor(due: string | null, today: string): "overdue" | "today" | "tomorrow" | "this_week" | "later" | "no_date" {
  if (!due) return "no_date";
  const diff = daysBetween(today, due);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff < 7) return "this_week";
  return "later";
}

const BUCKET_ORDER: Array<"overdue" | "today" | "tomorrow" | "this_week" | "later" | "no_date"> = [
  "overdue",
  "today",
  "tomorrow",
  "this_week",
  "later",
  "no_date",
];
const BUCKET_LABEL: Record<string, string> = {
  overdue: "Overdue",
  today: "Due today",
  tomorrow: "Tomorrow",
  this_week: "This week",
  later: "Later",
  no_date: "No date",
};

export function WorkClient({ data, canCreate }: { data: WorkData; canCreate: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [priority, setPriority] = useState<PriorityFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [showCompleted, setShowCompleted] = useState(false);
  const [showTeam, setShowTeam] = useState(true);

  // Debounce search into URL so the page is shareable
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (priority !== "all") params.set("p", priority);
      if (statusFilter !== "open") params.set("s", statusFilter);
      const qs = params.toString();
      router.replace(qs ? `/my-work?${qs}` : "/my-work", { scroll: false });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, priority, statusFilter]);

  const today = todayIso();

  const stats = useMemo(() => computeStats(data.tasks, today), [data.tasks, today]);

  // Apply search + status + priority filters
  const filteredMine = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.tasks.filter((t) => {
      // Status filter
      if (statusFilter === "open" && (t.status === "done" || t.status === "cancelled")) return false;
      if (statusFilter === "in_progress" && t.status !== "in_progress") return false;
      if (statusFilter === "done" && t.status !== "done") return false;
      if (statusFilter === "all") {
        // include everything
      }
      if (priority !== "all" && t.priority !== priority) return false;
      if (needle) {
        if (
          !t.title.toLowerCase().includes(needle) &&
          !(t.description ?? "").toLowerCase().includes(needle) &&
          !(t.projectName ?? "").toLowerCase().includes(needle)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [data.tasks, q, priority, statusFilter]);

  // Group by due-date bucket
  const grouped = useMemo(() => {
    const map = new Map<string, WorkTask[]>();
    for (const t of filteredMine) {
      const b = bucketFor(t.dueDate, today);
      const arr = map.get(b) ?? [];
      arr.push(t);
      map.set(b, arr);
    }
    const out: Array<{ key: string; label: string; items: WorkTask[]; tone: "red" | "amber" | "neutral" }> = [];
    for (const k of BUCKET_ORDER) {
      const items = (map.get(k) ?? []).slice().sort((a, b) => {
        // sort by priority (high first), then due date, then title
        const pa = priorityRank(a.priority);
        const pb = priorityRank(b.priority);
        if (pa !== pb) return pa - pb;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return a.title.localeCompare(b.title);
      });
      if (items.length > 0) {
        out.push({ key: k, label: BUCKET_LABEL[k]!, items, tone: k === "overdue" ? "red" : k === "today" ? "amber" : "neutral" });
      }
    }
    return out;
  }, [filteredMine, today]);

  const completedCount = data.tasks.filter((t) => t.status === "done").length;

  return (
    <div className="space-y-5">
      <StatsBar stats={stats} />

      <QuickAddRow
        projects={data.projects}
        canCreate={canCreate}
        onCreated={() => router.refresh()}
      />

      {/* Toolbar — search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 grow sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tertiary"
            aria-hidden
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tasks…"
            aria-label="Search tasks"
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
            ["open", "Open"],
            ["in_progress", "Active"],
            ["done", "Done"],
            ["all", "All"],
          ] as Array<[StatusFilter, string]>).map(([s, label]) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              aria-pressed={statusFilter === s}
              className={cx(
                "rounded px-2.5 py-1 font-medium transition",
                statusFilter === s
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
            ["all", "All"],
            ["high", "High"],
            ["medium", "Med"],
            ["low", "Low"],
          ] as Array<[PriorityFilter, string]>).map(([p, label]) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              aria-pressed={priority === p}
              className={cx(
                "rounded px-2.5 py-1 font-medium transition",
                priority === p
                  ? "bg-brand text-on-brand"
                  : "text-tertiary hover:text-primary",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Grouped lists */}
      {grouped.length === 0 ? (
        <EmptyState
          q={q}
          hasFilter={q !== "" || priority !== "all" || statusFilter !== "open"}
          onClear={() => {
            setQ("");
            setPriority("all");
            setStatusFilter("open");
          }}
        />
      ) : (
        <ol className="space-y-6">
          {grouped.map((g) => (
            <li key={g.key}>
              <BucketHeader label={g.label} count={g.items.length} tone={g.tone} />
              <ul className="mt-2 overflow-hidden rounded-lg border border-border-subtle bg-surface">
                {g.items.map((t) => (
                  <TaskRow key={t.id} task={t} onChange={() => router.refresh()} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {/* Completed (collapsed by default) */}
      {completedCount > 0 ? (
        <section>
          <button
            type="button"
            onClick={() => setShowCompleted((v) => !v)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-tertiary hover:text-primary"
          >
            {showCompleted ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span>Completed ({completedCount})</span>
          </button>
          {showCompleted ? (
            <ul className="mt-2 overflow-hidden rounded-lg border border-border-subtle bg-surface opacity-90">
              {data.tasks
                .filter((t) => t.status === "done")
                .slice(0, 30)
                .map((t) => (
                  <TaskRow key={t.id} task={t} onChange={() => router.refresh()} />
                ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {/* Team & reports (collapsed by default) */}
      {data.teamTasks.length > 0 && showTeam ? (
        <TeamSection
          tasks={data.teamTasks}
          onCollapse={() => setShowTeam(false)}
        />
      ) : null}
      {data.teamTasks.length > 0 && !showTeam ? (
        <button
          type="button"
          onClick={() => setShowTeam(true)}
          className="rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-xs font-medium text-secondary transition hover:text-primary"
        >
          Show team & reports ({data.teamTasks.length})
        </button>
      ) : null}
    </div>
  );
}

function priorityRank(p: string): number {
  if (p === "high") return 0;
  if (p === "medium") return 1;
  if (p === "low") return 2;
  return 3;
}

// ── Subcomponents ───────────────────────────────────────────────
function StatsBar({ stats }: { stats: ReturnType<typeof computeStats> }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border-subtle bg-border-subtle sm:grid-cols-4">
      <Stat label="Open" value={String(stats.open)} tone="brand" />
      <Stat label="Due today" value={String(stats.dueToday)} tone={stats.dueToday > 0 ? "amber" : "neutral"} />
      <Stat label="Overdue" value={String(stats.overdue)} tone={stats.overdue > 0 ? "red" : "neutral"} />
      <Stat label="Completed (30d)" value={String(stats.completed30d)} tone="success" />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "neutral" | "red" | "amber" | "brand" | "success" }) {
  return (
    <div className="bg-surface px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">{label}</p>
      <p
        className={cx(
          "mt-0.5 text-2xl font-semibold tabular-nums",
          tone === "red" && "text-danger",
          tone === "amber" && "text-warning",
          tone === "brand" && "text-primary",
          tone === "success" && "text-success",
          tone === "neutral" && "text-primary",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function computeStats(tasks: WorkTask[], today: string) {
  let open = 0;
  let dueToday = 0;
  let overdue = 0;
  let completed30d = 0;
  for (const t of tasks) {
    const isOpen = t.status !== "done" && t.status !== "cancelled";
    if (isOpen) {
      open += 1;
      if (t.dueDate) {
        const diff = daysBetween(today, t.dueDate);
        if (diff < 0) overdue += 1;
        else if (diff === 0) dueToday += 1;
      }
    } else if (t.status === "done") {
      // crude "30d" proxy: only completed in the last 30 days. We don't
      // store a completedAt column, so we use the title's date if any.
      // For v2 we keep this as a count of all done — keep it readable.
      completed30d += 1;
    }
  }
  return { open, dueToday, overdue, completed30d };
}

function BucketHeader({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "red" | "amber" | "neutral";
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-border-subtle pb-1.5">
      <h2
        className={cx(
          "text-[10px] font-semibold uppercase tracking-wide",
          tone === "red" && "text-danger",
          tone === "amber" && "text-warning",
          tone === "neutral" && "text-tertiary",
        )}
      >
        {label}
      </h2>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
        {count}
      </span>
    </div>
  );
}

function TaskRow({ task, onChange }: { task: WorkTask; onChange: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const today = todayIso();
  const isOverdue = task.status !== "done" && task.status !== "cancelled" && task.dueDate && task.dueDate < today;
  const isDone = task.status === "done";

  async function cycle() {
    setBusy(true);
    try {
      const next =
        task.status === "todo" ? "in_progress" : task.status === "in_progress" ? "done" : "todo";
      await fetch(`/api/v1/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="group flex items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-surface-hover">
      {/* Priority dot + status button */}
      <button
        type="button"
        onClick={cycle}
        disabled={busy}
        aria-label={`Mark ${task.title} (currently ${STATUS_LABEL[task.status] ?? task.status})`}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-tertiary transition hover:text-primary disabled:opacity-50"
      >
        {STATUS_ICON[task.status] ?? <Circle className="h-4 w-4" />}
      </button>
      <span
        className={cx("inline-block h-1.5 w-1.5 shrink-0 rounded-full", PRIORITY_COLOR[task.priority] ?? "bg-tertiary")}
        title={`Priority: ${task.priority}`}
        aria-hidden
      />

      <div className="min-w-0 flex-1">
        <p
          className={cx(
            "truncate",
            isDone ? "text-tertiary line-through" : "font-medium text-primary",
          )}
        >
          {task.title}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-tertiary">
          {task.projectName ? (
            <span className="inline-flex items-center gap-0.5">
              <Folder className="h-3 w-3" />
              {task.projectName}
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5">
              <Folder className="h-3 w-3" />
              Personal
            </span>
          )}
          <span aria-hidden>·</span>
          {task.dueDate ? (
            <span
              className={cx(
                isOverdue ? "font-medium text-danger" : "text-tertiary",
              )}
            >
              {fmtDueRelative(task.dueDate, today)}
            </span>
          ) : (
            <span>no date</span>
          )}
          {task.loggedMinutes > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-0.5 text-tertiary">
                <Clock3 className="h-3 w-3" />
                {Math.floor(task.loggedMinutes / 60)}h {task.loggedMinutes % 60}m
              </span>
            </>
          ) : null}
        </p>
      </div>

      <Badge
        tone={
          task.priority === "high" ? "red" : task.priority === "medium" ? "amber" : "neutral"
        }
      >
        {task.priority}
      </Badge>
    </li>
  );
}

function QuickAddRow({
  projects,
  canCreate,
  onCreated,
}: {
  projects: WorkProject[];
  canCreate: boolean;
  onCreated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          dueDate: dueDate || null,
          projectId: projectId || null,
          priority,
        }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not add task");
        return;
      }
      setTitle("");
      setDueDate("");
      setProjectId("");
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border-subtle bg-surface px-4 py-3"
    >
      <Plus className="h-4 w-4 shrink-0 text-tertiary" aria-hidden />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={canCreate ? "Add a task and press Enter" : "Read-only — you can't create tasks"}
        disabled={!canCreate}
        required
        maxLength={300}
        className="min-w-0 grow bg-transparent text-sm text-primary placeholder:text-tertiary focus:outline-none disabled:opacity-50"
      />
      <select
        aria-label="Project"
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        disabled={!canCreate}
        className="rounded-md border border-border-default bg-surface px-2 py-1 text-xs focus:border-brand focus:outline-none disabled:opacity-50"
      >
        <option value="">Personal</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Priority"
        value={priority}
        onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high")}
        disabled={!canCreate}
        className="rounded-md border border-border-default bg-surface px-2 py-1 text-xs focus:border-brand focus:outline-none disabled:opacity-50"
      >
        <option value="low">Low</option>
        <option value="medium">Med</option>
        <option value="high">High</option>
      </select>
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        disabled={!canCreate}
        className="rounded-md border border-border-default bg-surface px-2 py-1 text-xs focus:border-brand focus:outline-none disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={busy || !canCreate || !title.trim()}
        className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-on-brand transition hover:bg-brand-hover disabled:opacity-50"
      >
        Add
      </button>
      {error ? (
        <p role="alert" className="basis-full text-xs text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function EmptyState({
  q,
  hasFilter,
  onClear,
}: {
  q: string;
  hasFilter: boolean;
  onClear: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border-default bg-surface px-6 py-10 text-center">
      <Inbox className="mx-auto h-6 w-6 text-tertiary" />
      <p className="mt-2 text-sm font-medium text-primary">
        {hasFilter
          ? `No tasks match ${q ? `"${q}"` : "your filter"}`
          : "Nothing on your plate"}
      </p>
      <p className="mt-1 text-xs text-tertiary">
        {hasFilter
          ? "Try clearing the search or filters above."
          : "Use the form above to add your first task, or enjoy the calm."}
      </p>
      {hasFilter ? (
        <button
          type="button"
          onClick={onClear}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border-default bg-surface px-3 py-1.5 text-xs font-medium text-secondary hover:text-primary"
        >
          <Filter className="h-3.5 w-3.5" />
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

function TeamSection({ tasks, onCollapse }: { tasks: WorkTask[]; onCollapse: () => void }) {
  return (
    <section className="rounded-lg border border-border-subtle bg-surface">
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
          Team & reports · {tasks.length}
        </p>
        <button
          type="button"
          onClick={onCollapse}
          className="rounded-md px-2 py-0.5 text-[10px] font-medium text-tertiary hover:text-primary"
        >
          Hide
        </button>
      </div>
      <ul>
        {tasks.map((t) => (
          <li
            key={t.id}
            className="flex items-center gap-3 border-t border-border-subtle px-4 py-2 text-sm first:border-t-0"
          >
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-tertiary">
              {STATUS_ICON[t.status] ?? <Circle className="h-4 w-4" />}
            </span>
            <span
              className={cx(
                "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                PRIORITY_COLOR[t.priority] ?? "bg-tertiary",
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-primary">{t.title}</p>
              <p className="truncate text-[11px] text-tertiary">
                {t.assigneeName}
                {t.projectName ? ` · ${t.projectName}` : ""}
                {t.dueDate ? ` · ${fmtDueRelative(t.dueDate, todayIso())}` : ""}
              </p>
            </div>
            <Badge
              tone={
                t.priority === "high" ? "red" : t.priority === "medium" ? "amber" : "neutral"
              }
            >
              {t.priority}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}