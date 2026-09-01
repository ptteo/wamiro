"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Check,
  Inbox,
  Loader2,
  Plus,
  Search,
  Vote,
  X,
} from "lucide-react";

import { cx } from "@/lib/cx";

// ── Types ───────────────────────────────────────────────────────
export interface PollClientRow {
  id: string;
  question: string;
  options: string[];
  createdAt: string;
  myVote: number | null;
  counts: number[];
  totalVotes: number;
  /** Whether the viewer can delete this poll (i.e. the creator or manage perm). */
  canDelete: boolean;
}

type ScopeFilter = "all" | "open" | "voted";

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
export function PollsListClient({
  polls,
  canAuthor,
}: {
  polls: PollClientRow[];
  canAuthor: boolean;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (scope !== "all") params.set("s", scope);
    else params.delete("s");
    if (q) params.set("q", q);
    else params.delete("q");
    const qs = params.toString();
    router.replace(qs ? `/surveys?${qs}` : "/surveys", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, q]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return polls.filter((p) => {
      if (scope === "voted" && p.myVote === null) return false;
      if (scope === "open" && p.myVote !== null) return false;
      if (needle && !p.question.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [polls, q, scope]);

  const summary = useMemo(() => {
    return {
      total: polls.length,
      open: polls.filter((p) => p.myVote === null).length,
      voted: polls.filter((p) => p.myVote !== null).length,
    };
  }, [polls]);

  async function vote(pollId: string, optionIndex: number) {
    setBusy(`${pollId}:${optionIndex}`);
    setError(null);
    try {
      const res = await fetch(`/api/v1/surveys/${pollId}/vote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optionIndex }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(d.error?.message ?? "Vote failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function create(question: string, options: string[]) {
    setBusy("create");
    setError(null);
    try {
      const res = await fetch("/api/v1/surveys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, options }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not create poll");
        return false;
      }
      setCreating(false);
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

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
            placeholder="Search polls..."
            aria-label="Search polls"
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
          {(["all", "open", "voted"] as ScopeFilter[]).map((s) => (
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
              {s === "all" ? "All" : s === "open" ? "Open" : "Voted"}
              {s === "open" && summary.open > 0 ? (
                <span
                  className={cx(
                    "ml-1 inline-block min-w-4 rounded-full px-1 text-[10px] tabular-nums",
                    scope === s ? "bg-brand-hover" : "bg-warning-subtle text-warning",
                  )}
                >
                  {summary.open}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {canAuthor ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-hover"
          >
            <Plus className="h-3.5 w-3.5" />
            New poll
          </button>
        ) : null}
      </div>

      {/* One-line summary */}
      <p className="text-xs text-tertiary">
        {summary.total} poll{summary.total === 1 ? "" : "s"} · {summary.open} open · {summary.voted} voted
        {q ? <> · {visible.length} match{visible.length === 1 ? "" : "es"} for &ldquo;{q}&rdquo;</> : null}
      </p>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      {/* Results */}
      {visible.length === 0 ? (
        <PollsEmpty
          scope={scope}
          q={q}
          hasPolls={polls.length > 0}
          canAuthor={canAuthor}
          onCreate={() => setCreating(true)}
        />
      ) : (
        <div className="space-y-4">
          {visible.map((p) => (
            <PollCard
              key={p.id}
              poll={p}
              busy={busy}
              onVote={vote}
            />
          ))}
        </div>
      )}

      {creating ? (
        <NewPollDrawer
          busy={busy === "create"}
          error={error}
          onCancel={() => setCreating(false)}
          onCreate={create}
        />
      ) : null}
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────
function PollCard({
  poll: p,
  busy,
  onVote,
}: {
  poll: PollClientRow;
  busy: string | null;
  onVote: (id: string, idx: number) => void;
}) {
  const voted = p.myVote !== null;
  const pct = (i: number) =>
    p.totalVotes === 0 ? 0 : Math.round((p.counts[i] ?? 0) / p.totalVotes * 100);
  const isBusy = busy !== null;

  return (
    <article className="rounded-lg border border-border-subtle bg-surface p-4 transition hover:border-border-default">
      <header className="mb-3 flex flex-wrap items-baseline gap-2">
        <BarChart3 className="h-4 w-4 shrink-0 text-tertiary" />
        <h3 className="text-sm font-semibold text-primary">{p.question}</h3>
        <span className="ml-auto text-[11px] text-tertiary">
          {p.totalVotes} vote{p.totalVotes === 1 ? "" : "s"} · {timeAgo(p.createdAt)}
        </span>
      </header>
      {voted ? (
        <ul className="space-y-2">
          {p.options.map((opt, i) => {
            const isMyVote = p.myVote === i;
            const width = voted ? Math.max(2, pct(i)) : 0;
            return (
              <li key={i}>
                <div
                  className={cx(
                    "relative h-9 overflow-hidden rounded-md border px-3 transition",
                    isMyVote
                      ? "border-brand/40 bg-brand-subtle"
                      : "border-border-subtle bg-surface",
                  )}
                >
                  <div
                    aria-hidden
                    className={cx(
                      "absolute inset-y-0 left-0",
                      isMyVote ? "bg-brand/20" : "bg-surface-subtle",
                    )}
                    style={{ width: `${width}%` }}
                  />
                  <div className="relative flex h-full items-center justify-between">
                    <span
                      className={cx(
                        "flex items-center gap-1.5 truncate text-xs",
                        isMyVote ? "font-semibold text-brand-text" : "text-primary",
                      )}
                    >
                      {isMyVote ? <Check className="h-3 w-3" /> : null}
                      {opt}
                    </span>
                    <span
                      className={cx(
                        "tabular-nums text-[11px]",
                        isMyVote ? "font-semibold text-brand-text" : "text-tertiary",
                      )}
                    >
                      {pct(i)}%
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {p.options.map((opt, i) => {
            const isThisBusy = busy === `${p.id}:${i}`;
            return (
              <li key={i}>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onVote(p.id, i)}
                  className="group flex w-full items-center justify-between rounded-md border border-border-subtle bg-surface px-3 py-2 text-left text-xs font-medium text-primary transition hover:border-brand hover:bg-brand-subtle disabled:opacity-50"
                >
                  <span className="truncate">{opt}</span>
                  <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-tertiary group-hover:text-brand-text">
                    {isThisBusy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Vote className="h-3 w-3" />
                    )}
                    Vote
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-[10px] text-tertiary">
        {voted
          ? "Thanks for voting. Results are anonymous — your selection is highlighted."
          : "Votes are anonymous — pick one to see results."}
      </p>
    </article>
  );
}

function PollsEmpty({
  scope,
  q,
  hasPolls,
  canAuthor,
  onCreate,
}: {
  scope: ScopeFilter;
  q: string;
  hasPolls: boolean;
  canAuthor: boolean;
  onCreate: () => void;
}) {
  let title = "No polls yet";
  let hint = "Quick questions for the whole company.";
  if (q) {
    title = "No polls match your search";
    hint = "Try a different search term or clear the filter.";
  } else if (scope === "open") {
    title = "Nothing to vote on";
    hint = "All your open polls are voted.";
  } else if (scope === "voted") {
    title = "No voted polls";
    hint = "Polls you've answered will appear here.";
  }
  return (
    <div className="rounded-lg border border-dashed border-border-default bg-surface px-6 py-10 text-center">
      <Inbox className="mx-auto h-6 w-6 text-tertiary" />
      <p className="mt-2 text-sm font-medium text-primary">{title}</p>
      <p className="mt-1 text-xs text-tertiary">{hint}</p>
      {canAuthor && !hasPolls && !q ? (
        <button
          type="button"
          onClick={onCreate}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          New poll
        </button>
      ) : null}
    </div>
  );
}

function NewPollDrawer({
  busy,
  error,
  onCancel,
  onCreate,
}: {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onCreate: (question: string, options: string[]) => Promise<boolean>;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);

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

  function setOption(i: number, v: string) {
    setOptions((o) => o.map((x, idx) => (idx === i ? v : x)));
  }
  function addOption() {
    if (options.length >= 8) return;
    setOptions((o) => [...o, ""]);
  }
  function removeOption(i: number) {
    if (options.length <= 2) return;
    setOptions((o) => o.filter((_, idx) => idx !== i));
  }

  const cleaned = options.map((o) => o.trim()).filter(Boolean);

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal,50)] flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="New poll"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="flex h-full w-full max-w-md flex-col bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border-default px-5 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">New</p>
            <h2 className="text-base font-semibold text-primary">Publish a poll</h2>
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
            await onCreate(question.trim(), cleaned);
          }}
        >
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <label className="block text-xs font-medium text-secondary">
              Question
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="mt-1 w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                required
                minLength={3}
                maxLength={300}
                placeholder="What's your favorite meeting-free day?"
              />
            </label>
            <div>
              <p className="text-xs font-medium text-secondary">Options ({cleaned.length})</p>
              <div className="mt-1.5 space-y-1.5">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-[10px] font-semibold tabular-nums text-tertiary">
                      {i + 1}
                    </span>
                    <input
                      value={opt}
                      onChange={(e) => setOption(i, e.target.value)}
                      className="flex-1 rounded-md border border-border-default bg-surface px-2.5 py-1.5 text-sm text-primary placeholder:text-tertiary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                      maxLength={80}
                      required
                      placeholder={`Option ${i + 1}`}
                    />
                    {options.length > 2 ? (
                      <button
                        type="button"
                        onClick={() => removeOption(i)}
                        className="rounded-md px-2 py-1 text-[10px] text-tertiary hover:bg-danger-subtle hover:text-danger"
                        aria-label={`Remove option ${i + 1}`}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              {options.length < 8 ? (
                <button
                  type="button"
                  onClick={addOption}
                  className="mt-2 text-xs font-medium text-brand-text hover:underline"
                >
                  + Add option
                </button>
              ) : null}
            </div>
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
              disabled={busy || !question.trim() || cleaned.length < 2}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-hover disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Publish poll
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
