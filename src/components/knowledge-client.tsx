"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { FavoriteStar } from "./favorite-star";
import { Avatar, Badge, Card, CardHeader, EmptyState, btn, input } from "./ui";

const RECENTS_KEY = "wamiro-knowledge-recents";
const STALE_DAYS = 90;

interface Article {
  id: string;
  title: string;
  excerpt: string;
  tags: string[];
  authorName: string | null;
  updatedAt: string;
}

function freshness(updatedAt: string): { label: string; tone: "green" | "amber" | "red" | "neutral" } {
  const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000);
  if (days <= 30) return { label: days === 0 ? "today" : `${days}d`, tone: "green" };
  if (days <= STALE_DAYS) return { label: `${days}d`, tone: "amber" };
  return { label: `${days}d · stale`, tone: "red" };
}

export function KnowledgeClient({
  articles,
  selectedId,
  canManage,
}: {
  /** body included only for the selected article (server trims the rest) */
  articles: (Article & { body?: string; starred?: boolean })[];
  selectedId: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [recents, setRecents] = useState<string[]>([]);

  // Recents strip — Guru/Notion pattern, client-side per browser.
  useEffect(() => {
    try {
      const stored: string[] = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
      if (Array.isArray(stored)) setRecents(stored.slice(0, 4));
    } catch {
      /* ignore */
    }
  }, []);

  const selected = articles.find((a) => a.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId || creating || editing) return;
    setRecents((prev) => {
      const next = [selectedId, ...prev.filter((r) => r !== selectedId)].slice(0, 4);
      try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [selectedId, creating, editing]);

  const allTags = useMemo(
    () => Array.from(new Set(articles.flatMap((a) => a.tags))).sort(),
    [articles],
  );
  const recentArticles = recents
    .map((id) => articles.find((a) => a.id === id))
    .filter((a): a is Article => Boolean(a));
  const visible = articles.filter((a) => {
    if (tag && !a.tags.includes(tag)) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!a.title.toLowerCase().includes(q) && !a.excerpt.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  async function del(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/knowledge/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(d?.error?.message ?? "Delete failed");
        return;
      }
      router.push("/knowledge");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {canManage && (
        <div>
          <button type="button" className={btn.primary} onClick={() => setCreating((v) => !v)}>
            {creating ? "Cancel" : "New article"}
          </button>
        </div>
      )}

      {creating && (
        <form
          className="grid gap-3 rounded-xl border border-border-default bg-surface p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const f = new FormData(e.currentTarget);
            const tags = String(f.get("tags") ?? "")
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean);
            try {
              const res = await fetch("/api/v1/knowledge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: f.get("title"), body: f.get("body"), tags }),
              });
              if (!res.ok) {
                const d = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
                setError(d?.error?.message ?? "Publish failed");
                return;
              }
              setCreating(false);
              router.refresh();
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <label className="text-sm font-medium">
            Title
            <input name="title" className={`${input} mt-1`} required minLength={3} maxLength={200} />
          </label>
          <label className="text-sm font-medium">
            Tags (comma-separated)
            <input name="tags" className={`${input} mt-1`} placeholder="policy, onboarding" />
          </label>
          <label className="text-sm font-medium">
            Body
            <textarea name="body" className={`${input} mt-1 min-h-48`} required minLength={3} />
          </label>
          <button type="submit" className={btn.primary} disabled={busy}>
            Publish
          </button>
        </form>
      )}

      {recentArticles.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-tertiary">Recent</p>
          <div className="flex flex-wrap gap-1.5">
            {recentArticles.map((r) => (
              <Link
                key={r.id}
                href={`/knowledge?id=${r.id}`}
                className="rounded-md border border-border-default bg-surface-subtle px-2 py-1 text-xs text-secondary hover:bg-surface-hover"
              >
                {r.title}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {articles.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by title or excerpt…"
            className={`${input} w-56`}
          />
          {tag ? (
            <button
              type="button"
              onClick={() => setTag(null)}
              className="rounded-md bg-brand-subtle px-2 py-1 text-xs font-medium text-brand-text"
            >
              {tag} ✕
            </button>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTag(tag === t ? null : t)}
                className={`rounded-md px-2 py-1 text-xs ${
                  tag === t
                    ? "bg-brand text-on-brand"
                    : "border border-border-default text-secondary hover:bg-surface-hover"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-tertiary">
            {visible.length} of {articles.length}
          </span>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardHeader title={`Articles (${visible.length})`} />
          {visible.length === 0 ? (
            <EmptyState
              title={articles.length === 0 ? "No articles yet" : "No matches"}
              hint={
                articles.length === 0
                  ? canManage
                    ? "Write your first article above."
                    : "Company documentation will appear here."
                  : "Adjust the filter or clear it."
              }
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {visible.map((a) => {
                const f = freshness(a.updatedAt);
                return (
                  <li key={a.id}>
                    <Link
                      href={`/knowledge?id=${a.id}`}
                      className={`flex items-start gap-3 px-4 py-3 transition hover:bg-surface-hover ${
                        a.id === selectedId ? "bg-brand-subtle" : ""
                      }`}
                    >
                      <Avatar name={a.authorName ?? "?"} className="mt-0.5 h-7 w-7 text-[10px]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-primary">{a.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-secondary">{a.excerpt}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Badge tone={f.tone}>{f.label}</Badge>
                          {a.tags.slice(0, 3).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setTag(t);
                              }}
                              className="rounded bg-surface-subtle px-1.5 py-0.5 text-[10px] text-tertiary hover:text-primary"
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div>
          {selected ? (
            <Card>
              <div className="border-b border-border-subtle px-6 py-5">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-primary">
                  {selected.starred !== undefined && (
                    <FavoriteStar kind="article" refId={selected.id} starred={selected.starred} />
                  )}
                  {selected.title}
                </h2>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-tertiary">
                  <span>By {selected.authorName ?? "—"}</span>
                  <span>·</span>
                  <span>updated {new Date(selected.updatedAt).toLocaleDateString()}</span>
                  <Badge tone={freshness(selected.updatedAt).tone}>
                    {freshness(selected.updatedAt).label}
                  </Badge>
                </p>
                {selected.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selected.tags.map((t) => (
                      <Badge key={t} tone="brand">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              {editing && selected.body ? (
                <form
                  className="space-y-3 px-6 py-5"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    setError(null);
                    const f = new FormData(e.currentTarget);
                    const tags = String(f.get("tags") ?? "")
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean);
                    try {
                      const res = await fetch(`/api/v1/knowledge/${selected.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          title: f.get("title"),
                          body: f.get("body"),
                          tags,
                        }),
                      });
                      if (!res.ok) {
                        const d = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
                        setError(d?.error?.message ?? "Save failed");
                        return;
                      }
                      setEditing(false);
                      router.refresh();
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label className="block text-sm font-medium">
                    Title
                    <input
                      name="title"
                      className={`${input} mt-1`}
                      defaultValue={selected.title}
                      required
                      minLength={3}
                      maxLength={200}
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Tags (comma-separated)
                    <input name="tags" className={`${input} mt-1`} defaultValue={selected.tags.join(", ")} />
                  </label>
                  <label className="block text-sm font-medium">
                    Body
                    <textarea
                      name="body"
                      className={`${input} mt-1 min-h-48`}
                      defaultValue={selected.body}
                      required
                      minLength={3}
                    />
                  </label>
                  <div className="flex gap-2">
                    <button type="submit" disabled={busy} className={`${btn.primary} ${btn.small}`}>
                      Save changes
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className={`${btn.secondary} ${btn.small}`}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="whitespace-pre-wrap px-6 py-5 text-sm leading-relaxed text-secondary">
                    {selected.body ?? selected.excerpt + "…"}
                  </p>
                  {canManage && (
                    <div className="flex gap-2 border-t border-border-subtle px-6 py-3">
                      {selected.body && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setEditing(true)}
                          className={`${btn.secondary} ${btn.small}`}
                        >
                          Edit
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => del(selected.id)}
                        className={`${btn.danger} ${btn.small}`}
                      >
                        Delete article
                      </button>
                    </div>
                  )}
                </>
              )}
            </Card>
          ) : articles.length > 0 ? (
            <Card>
              <EmptyState
                title="Select an article"
                hint="Pick one from the list to read it here."
              />
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
