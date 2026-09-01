"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  Clock3,
  Folder,
  Grid3x3,
  List,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";

import { Avatar, Badge } from "./ui";
import { cx } from "@/lib/cx";

// 8 stable colors for projects (deterministic hash of the project name)
const PROJECT_HUES = [
  { bar: "bg-brand", tint: "bg-brand-subtle", text: "text-brand-text" },
  { bar: "bg-warning", tint: "bg-warning-subtle", text: "text-warning" },
  { bar: "bg-success", tint: "bg-success-subtle", text: "text-success" },
  { bar: "bg-info", tint: "bg-info-subtle", text: "text-info" },
  { bar: "bg-brand/60", tint: "bg-brand-subtle/60", text: "text-brand-text" },
  { bar: "bg-warning/60", tint: "bg-warning-subtle/60", text: "text-warning" },
  { bar: "bg-success/60", tint: "bg-success-subtle/60", text: "text-success" },
  { bar: "bg-info/60", tint: "bg-info-subtle/60", text: "text-info" },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function hueFor(name: string) {
  return PROJECT_HUES[hashString(name) % PROJECT_HUES.length]!;
}

function fmtMinutes(min: number): string {
  if (min <= 0) return "0h";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const STATUS_TONE: Record<string, "neutral" | "success" | "tertiary"> = {
  active: "success",
  completed: "neutral",
  archived: "tertiary",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

export interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  openTasks: number;
  doneTasks: number;
  totalTasks: number;
  memberCount: number;
  totalMinutes: number;
  ownerName: string | null;
  createdAt: string;
  isMember: boolean;
  members: { userId: string; name: string; avatarUrl: string | null }[];
}

type ViewMode = "grid" | "list";
type ScopeFilter = "all" | "mine";

export function ProjectsListClient({
  projects,
  canCreate,
}: {
  projects: ProjectRow[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("grid");
  const [scope, setScope] = useState<ScopeFilter>("all");
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
      if (view !== "grid") params.set("v", view);
      const qs = params.toString();
      router.replace(qs ? `/projects?${qs}` : "/projects", { scroll: false });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, scope, view]);

  // Filter
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return projects.filter((p) => {
      if (scope === "mine" && !p.isMember) return false;
      if (needle) {
        if (
          !p.name.toLowerCase().includes(needle) &&
          !(p.description ?? "").toLowerCase().includes(needle)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [projects, q, scope]);

  const summary = useMemo(() => {
    const totalOpen = projects.reduce((s, p) => s + p.openTasks, 0);
    const totalHours = Math.floor(
      projects.reduce((s, p) => s + p.totalMinutes, 0) / 60,
    );
    return `${projects.length} project${projects.length === 1 ? "" : "s"} · ${totalOpen} open task${totalOpen === 1 ? "" : "s"} · ${totalHours}h logged`;
  }, [projects]);

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
            placeholder="Search projects…"
            aria-label="Search projects"
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
            ["mine", "My projects"],
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
            New project
          </button>
        ) : null}
      </div>

      {/* One-line summary */}
      <p className="text-xs text-tertiary">
        {summary}
        {q ? <> · {visible.length} match{visible.length === 1 ? "" : "es"} for &ldquo;{q}&rdquo;</> : null}
      </p>

      {creating ? (
        <NewProjectForm
          busy={busy}
          error={error}
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            router.refresh();
          }}
          onSubmit={async (name, description) => {
            setBusy(true);
            setError(null);
            try {
              const res = await fetch("/api/v1/projects", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name, description }),
              });
              if (!res.ok) {
                const d = (await res.json()) as { error?: { message?: string } };
                setError(d.error?.message ?? "Could not create project");
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
        <EmptyState scope={scope} q={q} />
      ) : view === "grid" ? (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((p) => (
            <li key={p.id}>
              <ProjectCard project={p} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
          {visible.map((p) => (
            <li key={p.id}>
              <ProjectRow project={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────
function ProjectCard({ project: p }: { project: ProjectRow }) {
  const hue = hueFor(p.name);
  const pct = p.totalTasks > 0 ? Math.round((p.doneTasks / p.totalTasks) * 100) : 0;
  const visibleMembers = p.members.slice(0, 4);
  const extraMembers = Math.max(0, p.members.length - visibleMembers.length);
  return (
    <Link
      href={`/projects/${p.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-lg border border-border-subtle bg-surface transition hover:border-border-default hover:shadow-[0_4px_10px_rgba(16,24,40,0.08)]"
    >
      {/* Color bar — 8px, a real cover stripe */}
      <div className={cx("h-2", hue.bar)} aria-hidden />
      <div className="flex items-start gap-3 px-4 pt-4">
        <div
          className={cx(
            "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
            hue.bar,
            "text-on-brand",
          )}
          aria-hidden
        >
          <Folder className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-primary">{p.name}</h3>
          <div className="mt-0.5 flex items-center gap-1.5">
            {p.isMember ? (
              <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-tertiary">
                You
              </span>
            ) : null}
            <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>
              {STATUS_LABEL[p.status] ?? p.status}
            </Badge>
          </div>
        </div>
      </div>
      {p.description ? (
        <p className="line-clamp-2 px-4 pt-2 text-xs text-secondary">{p.description}</p>
      ) : null}
      <div className="mt-auto px-4 pb-4 pt-3">
        {/* Progress */}
        {p.totalTasks > 0 ? (
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-tertiary">
              <span>Progress</span>
              <span className="tabular-nums text-primary">{p.doneTasks}/{p.totalTasks} · {pct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
              <div
                className={cx("h-full", pct >= 100 ? "bg-success" : "bg-brand")}
                style={{ width: `${Math.max(2, pct)}%` }}
                aria-hidden
              />
            </div>
          </div>
        ) : null}
        {/* Members + stats row */}
        <div className="flex items-center justify-between gap-2">
          {p.members.length > 0 ? (
            <ul className="flex -space-x-1.5">
              {visibleMembers.map((m) => (
                <li
                  key={m.userId}
                  title={m.name}
                  className="inline-block"
                >
                  <Avatar
                    name={m.name}
                    src={m.avatarUrl ?? undefined}
                    className="!h-6 !w-6 text-[9px] ring-2 ring-surface"
                  />
                </li>
              ))}
              {extraMembers > 0 ? (
                <li
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-subtle text-[9px] font-semibold tabular-nums text-tertiary ring-2 ring-surface"
                  title={`+${extraMembers} more`}
                >
                  +{extraMembers}
                </li>
              ) : null}
            </ul>
          ) : (
            <span className="text-[10px] text-disabled">No members</span>
          )}
          <div className="flex items-center gap-2.5 text-[11px] text-tertiary">
            <span className="inline-flex items-center gap-1">
              <Check className="h-3 w-3" />
              {p.openTasks}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3 w-3" />
              {fmtMinutes(p.totalMinutes)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function ProjectRow({ project: p }: { project: ProjectRow }) {
  const hue = hueFor(p.name);
  const pct = p.totalTasks > 0 ? Math.round((p.doneTasks / p.totalTasks) * 100) : 0;
  return (
    <Link
      href={`/projects/${p.id}`}
      className="group flex items-center gap-4 border-b border-border-subtle px-5 py-4 last:border-b-0 transition hover:bg-surface-hover"
    >
      <div className={cx("h-10 w-1 shrink-0 rounded", hue.bar)} aria-hidden />
      <div
        className={cx(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
          hue.bar,
          "text-on-brand",
        )}
        aria-hidden
      >
        <Folder className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <h3 className="truncate text-sm font-semibold text-primary">{p.name}</h3>
          <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>
            {STATUS_LABEL[p.status] ?? p.status}
          </Badge>
        </div>
        {p.description ? (
          <p className="truncate text-[11px] text-tertiary">{p.description}</p>
        ) : null}
      </div>
      {p.totalTasks > 0 ? (
        <div className="hidden w-40 sm:block">
          <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
            <div
              className={cx("h-full", pct >= 100 ? "bg-success" : "bg-brand")}
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>
          <p className="text-right text-[10px] tabular-nums text-tertiary">
            {p.doneTasks}/{p.totalTasks} · {pct}%
          </p>
        </div>
      ) : null}
      <div className="hidden items-center gap-3 text-[11px] text-tertiary md:flex">
        <span className="inline-flex items-center gap-1">
          <Check className="h-3 w-3" />
          {p.openTasks}
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="h-3 w-3" />
          {p.memberCount}
        </span>
        {p.totalMinutes > 0 ? (
          <span className="inline-flex items-center gap-1">
            <Clock3 className="h-3 w-3" />
            {fmtMinutes(p.totalMinutes)}
          </span>
        ) : null}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-tertiary transition group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

function NewProjectForm({
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
  onSubmit: (name: string, description: string | null) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <form
      className="rounded-lg border border-border-subtle bg-surface px-4 py-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await onSubmit(name.trim(), description.trim() || null);
        if (ok) {
          setName("");
          setDescription("");
          onCreated();
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Plus className="h-4 w-4 shrink-0 text-tertiary" aria-hidden />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name (e.g. Wamiro v2)"
          required
          minLength={2}
          maxLength={120}
          className="min-w-0 grow bg-transparent text-sm text-primary placeholder:text-tertiary focus:outline-none"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short description (optional)"
          maxLength={2000}
          className="min-w-0 grow rounded-md border border-border-default bg-surface px-2 py-1 text-xs sm:max-w-xs"
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
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
      {error ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function EmptyState({ scope, q }: { scope: ScopeFilter; q: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border-default bg-surface px-6 py-10 text-center">
      <Folder className="mx-auto h-6 w-6 text-tertiary" />
      <p className="mt-2 text-sm font-medium text-primary">
        {q ? "No projects match your search" : scope === "mine" ? "You're not in any project yet" : "No projects yet"}
      </p>
      <p className="mt-1 text-xs text-tertiary">
        {q
          ? "Try a different search term or clear the filter."
          : scope === "mine"
            ? "Create a new project, or ask a teammate to add you to one."
            : "Create your first project to get started."}
      </p>
    </div>
  );
}
