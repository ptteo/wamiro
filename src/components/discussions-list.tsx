"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Inbox,
  Loader2,
  MessageCircle,
  Pin,
  Plus,
  Search,
  Send,
  X,
} from "lucide-react";

import { Avatar, Badge } from "./ui";
import { cx } from "@/lib/cx";

// ── Types ───────────────────────────────────────────────────────
export interface DiscussionSummary {
  id: string;
  title: string;
  body: string;
  authorName: string;
  authorAvatar: string | null;
  scope: string;
  pinned: boolean;
  createdAt: string;
  replyCount: number;
  lastReplyAt: string | null;
  /** Whether the viewer authored this discussion. */
  mine: boolean;
}

export interface DiscussionReply {
  id: string;
  body: string;
  userName: string;
  userAvatar: string | null;
  userId: string;
  createdAt: string;
  /** Whether this reply is from the viewer. */
  mine: boolean;
}

type ScopeFilter = "all" | "pinned" | "mine";

// ── Helpers ─────────────────────────────────────────────────────
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
export function DiscussionsListClient({
  discussions,
  canCreate = true,
  currentUserId,
}: {
  discussions: DiscussionSummary[];
  canCreate?: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // URL state
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (scope !== "all") params.set("s", scope);
    else params.delete("s");
    if (q) params.set("q", q);
    else params.delete("q");
    if (selectedId) params.set("d", selectedId);
    else params.delete("d");
    const qs = params.toString();
    router.replace(qs ? `/discussions?${qs}` : "/discussions", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, q, selectedId]);

  // Restore selectedId from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const d = params.get("d");
    if (d) setSelectedId(d);
  }, []);

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
    return discussions.filter((d) => {
      if (scope === "pinned" && !d.pinned) return false;
      if (scope === "mine" && !d.mine) return false;
      if (needle) {
        if (
          !d.title.toLowerCase().includes(needle) &&
          !d.body.toLowerCase().includes(needle) &&
          !d.authorName.toLowerCase().includes(needle)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [discussions, q, scope]);

  // Sort: pinned first, then by recency
  const sorted = useMemo(() => {
    return [...visible].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [visible]);

  const summary = useMemo(() => {
    return {
      total: discussions.length,
      pinned: discussions.filter((d) => d.pinned).length,
      mine: discussions.filter((d) => d.mine).length,
    };
  }, [discussions]);

  async function create(title: string, body: string, pinned: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/discussions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body, pinned }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not create discussion");
        return null;
      }
      const out = (await res.json().catch(() => null)) as { id?: string } | null;
      setCreating(false);
      router.refresh();
      if (out?.id) setSelectedId(out.id);
      return out?.id ?? null;
    } finally {
      setBusy(false);
    }
  }

  const selected = selectedId ? discussions.find((d) => d.id === selectedId) ?? null : null;

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
            placeholder="Search discussions..."
            aria-label="Search discussions"
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
          {(["all", "pinned", "mine"] as ScopeFilter[]).map((s) => (
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
              {s === "all" ? "All" : s === "pinned" ? "Pinned" : "My posts"}
              {s === "pinned" && summary.pinned > 0 ? (
                <span
                  className={cx(
                    "ml-1 inline-block min-w-4 rounded-full px-1 text-[10px] tabular-nums",
                    scope === s ? "bg-brand-hover" : "bg-surface-subtle text-tertiary",
                  )}
                >
                  {summary.pinned}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {canCreate ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-hover"
          >
            <Plus className="h-3.5 w-3.5" />
            New discussion
          </button>
        ) : null}
      </div>

      {/* One-line summary */}
      <p className="text-xs text-tertiary">
        {summary.total} discussion{summary.total === 1 ? "" : "s"} · {summary.pinned} pinned ·{" "}
        {summary.mine} started by you
        {q ? <> · {visible.length} match{visible.length === 1 ? "" : "es"} for &ldquo;{q}&rdquo;</> : null}
      </p>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      {/* Results */}
      {sorted.length === 0 ? (
        <DiscussionsEmpty
          scope={scope}
          q={q}
          canCreate={canCreate}
          onCreate={() => setCreating(true)}
        />
      ) : (
        <ul className="space-y-3">
          {sorted.map((d) => (
            <li key={d.id}>
              <DiscussionCard
                d={d}
                onOpen={() => setSelectedId(d.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Thread view (slide-in panel) */}
      {selected ? (
        <ThreadPanel
          summary={selected}
          onClose={() => setSelectedId(null)}
          currentUserId={currentUserId}
        />
      ) : null}

      {/* New discussion drawer */}
      {creating ? (
        <NewDiscussionDrawer
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
function DiscussionCard({
  d,
  onOpen,
}: {
  d: DiscussionSummary;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        "group flex w-full items-start gap-3 rounded-lg border bg-surface px-4 py-3 text-left transition",
        d.pinned
          ? "border-brand/40 bg-brand-subtle/20 hover:border-brand/60"
          : "border-border-subtle hover:border-border-default hover:shadow-[0_4px_10px_rgba(16,24,40,0.06)]",
      )}
    >
      <Avatar
        name={d.authorName}
        src={d.authorAvatar ?? undefined}
        className="!h-9 !w-9 text-[10px]"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          {d.pinned ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-subtle px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-brand-text">
              <Pin className="h-2.5 w-2.5" />
              Pinned
            </span>
          ) : null}
          <h3 className="truncate text-sm font-semibold text-primary">{d.title}</h3>
          {d.mine ? (
            <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-tertiary">
              You
            </span>
          ) : null}
        </div>
        <p className="line-clamp-2 text-xs text-secondary">{d.body}</p>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-tertiary">
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="h-3 w-3" />
            {d.replyCount} repl{d.replyCount === 1 ? "y" : "ies"}
          </span>
          <span>{d.authorName}</span>
          <span>{timeAgo(d.createdAt)}</span>
          {d.lastReplyAt ? <span>· last activity {timeAgo(d.lastReplyAt)}</span> : null}
        </div>
      </div>
    </button>
  );
}

function DiscussionsEmpty({
  scope,
  q,
  canCreate,
  onCreate,
}: {
  scope: ScopeFilter;
  q: string;
  canCreate: boolean;
  onCreate: () => void;
}) {
  let title = "No discussions yet";
  let hint = "Start the first conversation above.";
  if (q) {
    title = "No discussions match your search";
    hint = "Try a different search term or clear the filter.";
  } else if (scope === "pinned") {
    title = "Nothing pinned yet";
    hint = "Pinned discussions stay at the top of the list.";
  } else if (scope === "mine") {
    title = "You haven't started a discussion yet";
    hint = "Start one to share an idea or ask a question.";
  }
  return (
    <div className="rounded-lg border border-dashed border-border-default bg-surface px-6 py-10 text-center">
      <Inbox className="mx-auto h-6 w-6 text-tertiary" />
      <p className="mt-2 text-sm font-medium text-primary">{title}</p>
      <p className="mt-1 text-xs text-tertiary">{hint}</p>
      {canCreate && !q ? (
        <button
          type="button"
          onClick={onCreate}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          New discussion
        </button>
      ) : null}
    </div>
  );
}

function ThreadPanel({
  summary,
  onClose,
  currentUserId,
}: {
  summary: DiscussionSummary;
  onClose: () => void;
  currentUserId: string;
}) {
  const router = useRouter();
  const [replies, setReplies] = useState<DiscussionReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [replying, setReplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/v1/discussions/${summary.id}`)
      .then((r) => (r.ok ? r.json() : { replies: [] }))
      .then((d: { replies?: DiscussionReply[] }) => {
        if (cancelled) return;
        setReplies(
          (d.replies ?? []).map((r) => ({ ...r, mine: r.userId === currentUserId })),
        );
      })
      .catch(() => setReplies([]))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [summary.id, currentUserId]);

  async function sendReply(body: string) {
    setReplying(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/discussions/${summary.id}/replies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not post reply");
        return false;
      }
      // refresh replies
      const refresh = await fetch(`/api/v1/discussions/${summary.id}`);
      if (refresh.ok) {
        const d = (await refresh.json()) as { replies?: DiscussionReply[] };
        setReplies(
          (d.replies ?? []).map((r) => ({ ...r, mine: r.userId === currentUserId })),
        );
      }
      router.refresh();
      return true;
    } finally {
      setReplying(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal,50)] flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={summary.title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full w-full max-w-2xl flex-col bg-surface shadow-xl">
        <div className="flex items-start gap-3 border-b border-border-default px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-tertiary hover:bg-surface-hover hover:text-primary"
            aria-label="Back to all discussions"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Avatar
            name={summary.authorName}
            src={summary.authorAvatar ?? undefined}
            className="!h-9 !w-9 text-[10px]"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              {summary.pinned ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-subtle px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-brand-text">
                  <Pin className="h-2.5 w-2.5" />
                  Pinned
                </span>
              ) : null}
              <h2 className="text-base font-semibold text-primary">{summary.title}</h2>
            </div>
            <p className="text-[11px] text-tertiary">
              {summary.authorName} · {new Date(summary.createdAt).toLocaleString()}
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

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="rounded-md bg-surface-subtle/50 p-3 text-sm">
            <p className="whitespace-pre-wrap leading-relaxed text-primary">{summary.body}</p>
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
              <MessageCircle className="h-3 w-3" />
              {replies.length} repl{replies.length === 1 ? "y" : "ies"}
            </h3>
            {loading ? (
              <p className="inline-flex items-center gap-1 text-xs text-tertiary">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading…
              </p>
            ) : replies.length === 0 ? (
              <p className="text-xs text-tertiary">No replies yet. Be the first to chime in.</p>
            ) : (
              <ul className="space-y-3">
                {replies.map((r) => (
                  <li
                    key={r.id}
                    className={cx(
                      "rounded-md border p-3",
                      r.mine ? "border-brand/30 bg-brand-subtle/20" : "border-border-subtle bg-surface",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Avatar
                        name={r.userName}
                        src={r.userAvatar ?? undefined}
                        className="!h-6 !w-6 text-[9px]"
                      />
                      <span className="text-xs font-medium text-primary">{r.userName}</span>
                      <span className="text-[11px] text-tertiary">
                        {new Date(r.createdAt).toLocaleString()}
                      </span>
                      {r.mine ? (
                        <Badge tone="brand">You</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap pl-8 text-sm leading-relaxed text-primary">
                      {r.body}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {error ? (
              <p role="alert" className="mt-2 text-xs text-danger">
                {error}
              </p>
            ) : null}
          </div>
        </div>

        <ReplyForm onSubmit={sendReply} busy={replying} />
      </div>
    </div>
  );
}

function ReplyForm({
  onSubmit,
  busy,
}: {
  onSubmit: (body: string) => Promise<boolean>;
  busy: boolean;
}) {
  const [body, setBody] = useState("");
  async function send() {
    if (!body.trim()) return;
    const ok = await onSubmit(body.trim());
    if (ok) setBody("");
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
      className="flex items-end gap-2 border-t border-border-default bg-surface px-5 py-3"
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void send();
          }
        }}
        placeholder="Write a reply… (Cmd/Ctrl+Enter to send)"
        className="min-h-12 max-h-32 w-full resize-y rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        rows={2}
      />
      <button
        type="submit"
        disabled={busy || !body.trim()}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-brand px-3 text-xs font-medium text-on-brand transition hover:bg-brand-hover disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Send className="h-3 w-3" />
        )}
        Reply
      </button>
    </form>
  );
}

function NewDiscussionDrawer({
  busy,
  error,
  onCancel,
  onCreate,
}: {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onCreate: (title: string, body: string, pinned: boolean) => Promise<unknown>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);

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
      aria-label="New discussion"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="flex h-full w-full max-w-md flex-col bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border-default px-5 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">New</p>
            <h2 className="text-base font-semibold text-primary">Start a discussion</h2>
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

        <form
          className="flex flex-1 flex-col overflow-hidden"
          onSubmit={async (e) => {
            e.preventDefault();
            await onCreate(title.trim(), body.trim(), pinned);
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
                maxLength={200}
                placeholder="What's on your mind?"
              />
            </label>
            <label className="block text-xs font-medium text-secondary">
              Message
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="mt-1 w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                required
                minLength={1}
                maxLength={20000}
                rows={8}
                placeholder="Share the details..."
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-secondary">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border-default text-brand focus:ring-brand"
              />
              <span className="inline-flex items-center gap-1">
                <Pin className="h-3 w-3" />
                Pin this discussion to the top
              </span>
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
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Post
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
