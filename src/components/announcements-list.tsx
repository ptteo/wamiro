"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Megaphone,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { Avatar } from "./ui";
import { cx } from "@/lib/cx";

// ── Types ───────────────────────────────────────────────────────
export interface AnnouncementClientRow {
  id: string;
  title: string;
  body: string;
  authorName: string | null;
  authorAvatar: string | null;
  authorId: string | null;
  audience: string;
  publishedAt: string; // ISO
}

type ScopeFilter = "all" | "recent" | "older";

// ── Helpers ─────────────────────────────────────────────────────
function dayBucket(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((now.getTime() - d.getTime()) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return "This week";
  if (diff < 30) return "This month";
  if (diff < 365) return new Date(iso).toLocaleDateString("en-US", { month: "long" });
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Component ───────────────────────────────────────────────────
export function AnnouncementsListClient({
  items,
  canManage,
  currentUserId,
}: {
  items: AnnouncementClientRow[];
  canManage: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (scope !== "all") params.set("s", scope);
    else params.delete("s");
    if (q) params.set("q", q);
    else params.delete("q");
    const qs = params.toString();
    router.replace(qs ? `/announcements?${qs}` : "/announcements", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, q]);

  useEffect(() => {
    if (!selectedId) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selectedId]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((a) => {
      if (scope === "recent") {
        if (Date.now() - new Date(a.publishedAt).getTime() > 7 * 86_400_000) return false;
      } else if (scope === "older") {
        if (Date.now() - new Date(a.publishedAt).getTime() <= 7 * 86_400_000) return false;
      }
      if (needle) {
        if (
          !a.title.toLowerCase().includes(needle) &&
          !a.body.toLowerCase().includes(needle) &&
          !(a.authorName ?? "").toLowerCase().includes(needle)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [items, q, scope]);

  // Group by day bucket
  const groups = useMemo(() => {
    const m = new Map<string, AnnouncementClientRow[]>();
    for (const a of visible) {
      const key = dayBucket(a.publishedAt);
      const arr = m.get(key) ?? [];
      arr.push(a);
      m.set(key, arr);
    }
    return Array.from(m.entries());
  }, [visible]);

  async function create(title: string, body: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/announcements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not publish");
        return false;
      }
      setCreating(false);
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch("/api/v1/announcements", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not delete");
        return;
      }
      if (selectedId === id) setSelectedId(null);
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  const selected = selectedId ? items.find((a) => a.id === selectedId) ?? null : null;

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 grow sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tertiary" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search announcements..."
            aria-label="Search announcements"
            className="w-full rounded-md border border-border-default bg-surface py-1.5 pl-8 pr-8 text-sm text-primary placeholder:text-tertiary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          {q ? (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-tertiary hover:text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <div className="inline-flex rounded-md border border-border-subtle bg-surface p-0.5 text-xs">
          {(["all", "recent", "older"] as ScopeFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              aria-pressed={scope === s}
              className={cx(
                "rounded px-2.5 py-1 font-medium transition",
                scope === s ? "bg-brand text-on-brand" : "text-tertiary hover:text-primary",
              )}
            >
              {s === "all" ? "All" : s === "recent" ? "This week" : "Older"}
            </button>
          ))}
        </div>

        {canManage ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-hover"
          >
            <Plus className="h-3.5 w-3.5" />
            New announcement
          </button>
        ) : null}
      </div>

      {/* One-line summary */}
      <p className="text-xs text-tertiary">
        {items.length} announcement{items.length === 1 ? "" : "s"} · {visible.length} visible
        {q ? <> · {visible.length} match{visible.length === 1 ? "" : "es"} for &ldquo;{q}&rdquo;</> : null}
      </p>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      {/* Results */}
      {visible.length === 0 ? (
        <AnnouncementsEmpty
          scope={scope}
          q={q}
          canManage={canManage}
          onCreate={() => setCreating(true)}
        />
      ) : (
        <div className="space-y-8">
          {groups.map(([bucket, list]) => (
            <section key={bucket}>
              <div className="mb-3 flex items-center gap-2">
                <CalendarDays className="h-3.5 w-3.5 text-tertiary" />
                <h2 className="text-xs font-semibold uppercase tracking-wide text-tertiary">
                  {bucket}
                </h2>
                <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] tabular-nums text-tertiary">
                  {list.length}
                </span>
              </div>
              <ul className="space-y-3">
                {list.map((a) => (
                  <AnnouncementCard
                    key={a.id}
                    a={a}
                    canManage={canManage}
                    mine={a.authorId === currentUserId}
                    onOpen={() => setSelectedId(a.id)}
                    onDelete={remove}
                    deleting={deletingId === a.id}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Detail sheet */}
      {selected ? (
        <AnnouncementDetail
          a={selected}
          canManage={canManage}
          mine={selected.authorId === currentUserId}
          deleting={deletingId === selected.id}
          onClose={() => setSelectedId(null)}
          onDelete={remove}
        />
      ) : null}

      {/* New announcement drawer */}
      {creating ? (
        <NewAnnouncementDrawer
          busy={busy}
          error={error}
          onCancel={() => setCreating(false)}
          onCreate={create}
        />
      ) : null}
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────
function AnnouncementCard({
  a,
  canManage,
  mine,
  onOpen,
  onDelete,
  deleting,
}: {
  a: AnnouncementClientRow;
  canManage: boolean;
  mine: boolean;
  onOpen: () => void;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  return (
    <li className="rounded-lg border border-border-subtle bg-surface transition hover:border-border-default hover:shadow-[0_4px_10px_rgba(16,24,40,0.06)]">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <Avatar
          name={a.authorName ?? "Wamiro"}
          src={a.authorAvatar ?? undefined}
          className="!h-9 !w-9 text-[10px]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="text-sm font-semibold text-primary">{a.title}</h3>
            {mine ? (
              <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-tertiary">
                You
              </span>
            ) : null}
          </div>
          <p className="line-clamp-2 text-xs text-secondary">{a.body}</p>
          <p className="mt-1 text-[11px] text-tertiary">
            {a.authorName ?? "Unknown"} · {timeAgo(a.publishedAt)}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-tertiary" />
      </button>
      {(canManage || mine) ? (
        <div className="flex items-center justify-end gap-1.5 border-t border-border-subtle bg-surface-subtle/40 px-4 py-1.5">
          <button
            type="button"
            onClick={() => onDelete(a.id)}
            disabled={deleting}
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-tertiary transition hover:bg-danger-subtle hover:text-danger disabled:opacity-50"
          >
            {deleting ? (
              <span
                aria-hidden
                className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
            Delete
          </button>
        </div>
      ) : null}
    </li>
  );
}

function AnnouncementsEmpty({
  scope,
  q,
  canManage,
  onCreate,
}: {
  scope: ScopeFilter;
  q: string;
  canManage: boolean;
  onCreate: () => void;
}) {
  let title = "No announcements yet";
  let hint = "Updates published by HR or admins will appear here.";
  if (q) {
    title = "No announcements match your search";
    hint = "Try a different search term or clear the filter.";
  } else if (scope === "recent") {
    title = "Nothing new this week";
    hint = "Switch to 'All' to see older updates.";
  } else if (scope === "older") {
    title = "Nothing in the archive yet";
    hint = "Older announcements will appear here as they age.";
  }
  return (
    <div className="rounded-lg border border-dashed border-border-default bg-surface px-6 py-10 text-center">
      <Megaphone className="mx-auto h-6 w-6 text-tertiary" />
      <p className="mt-2 text-sm font-medium text-primary">{title}</p>
      <p className="mt-1 text-xs text-tertiary">{hint}</p>
      {canManage && !q ? (
        <button
          type="button"
          onClick={onCreate}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          New announcement
        </button>
      ) : null}
    </div>
  );
}

function AnnouncementDetail({
  a,
  canManage,
  mine,
  deleting,
  onClose,
  onDelete,
}: {
  a: AnnouncementClientRow;
  canManage: boolean;
  mine: boolean;
  deleting: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal,50)] flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={a.title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full w-full max-w-lg flex-col bg-surface shadow-xl">
        <div className="flex items-start gap-3 border-b border-border-default px-5 py-3">
          <Avatar
            name={a.authorName ?? "Wamiro"}
            src={a.authorAvatar ?? undefined}
            className="!h-10 !w-10 text-[10px]"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
              Announcement
            </p>
            <h2 className="text-base font-semibold text-primary">{a.title}</h2>
            <p className="mt-0.5 text-[11px] text-tertiary">
              {a.authorName ?? "Unknown"} · {new Date(a.publishedAt).toLocaleString()}
              {mine ? <span className="ml-2 inline-flex items-center gap-1 text-success">· Posted by you</span> : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-tertiary hover:bg-surface-hover hover:text-primary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-primary">{a.body}</p>
        </div>

        {(canManage || mine) ? (
          <div className="flex items-center justify-end gap-2 border-t border-border-default bg-surface px-5 py-3">
            <button
              type="button"
              onClick={() => onDelete(a.id)}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 rounded-md border border-danger/30 bg-surface px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger-subtle disabled:opacity-50"
            >
              {deleting ? (
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function NewAnnouncementDrawer({
  busy,
  error,
  onCancel,
  onCreate,
}: {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onCreate: (title: string, body: string) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancel, busy]);

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal,50)] flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="New announcement"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="flex h-full w-full max-w-md flex-col bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border-default px-5 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">New</p>
            <h2 className="text-base font-semibold text-primary">Publish announcement</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded p-1 text-tertiary hover:bg-surface-hover hover:text-primary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {title || body ? (
          <SuccessState
            onAnother={() => {
              setTitle("");
              setBody("");
            }}
            onClose={onCancel}
          />
        ) : (
          <form
            className="flex flex-1 flex-col overflow-hidden"
            onSubmit={async (e) => {
              e.preventDefault();
              await onCreate(title.trim(), body.trim());
            }}
          >
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <label className="block text-xs font-medium text-secondary">
                Title
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  required
                  minLength={3}
                  maxLength={150}
                  placeholder="What's the headline?"
                />
              </label>
              <label className="block text-xs font-medium text-secondary">
                Body
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  required
                  minLength={3}
                  maxLength={5000}
                  rows={8}
                  placeholder="Share the news..."
                />
              </label>
              {error ? (
                <p role="alert" className="text-xs text-danger">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border-default bg-surface px-5 py-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-tertiary hover:text-primary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !title.trim() || !body.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-hover disabled:opacity-50"
              >
                {busy ? (
                  <span
                    aria-hidden
                    className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                  />
                ) : (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                Publish
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function SuccessState({
  onAnother,
  onClose,
}: {
  onAnother: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-5 py-8 text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-success-subtle text-success">
        <CheckCircle2 className="h-6 w-6" />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-primary">Published</h3>
      <p className="mt-1 text-xs text-tertiary">
        Your announcement is now visible to the whole company.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={onAnother}
          className="rounded-md border border-border-default bg-surface px-3 py-1.5 text-xs font-medium text-secondary transition hover:bg-surface-hover"
        >
          Publish another
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-hover"
        >
          Done
        </button>
      </div>
    </div>
  );
}
