"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Badge, Card, CardHeader, EmptyState, btn, input } from "./ui";

interface Ticket {
  id: number;
  title: string;
  state: string;
  priority: string;
  createdAt: string;
  updatedAt: string | null;
}

interface Article {
  id: number;
  ticket_id: number;
  subject?: string;
  body?: string;
  sender?: string;
  internal?: boolean;
  created_at: string;
}

interface TicketDetail {
  id: number;
  title: string;
  state: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  customerId: number | null;
  ownerId: number | null;
  articles: Article[];
}

const stateTone = {
  closed: "neutral",
  open: "amber",
  new: "brand",
  "pending reminder": "amber",
  escalated: "red",
} as Record<string, "neutral" | "amber" | "brand" | "red">;

const priorityTone = {
  low: "neutral",
  "1 low": "neutral",
  "2 normal": "brand",
  normal: "brand",
  "3 high": "amber",
  high: "amber",
  urgent: "red",
} as Record<string, "neutral" | "amber" | "brand" | "red">;

const stateOptions = ["all", "new", "open", "pending reminder", "escalated", "closed"] as const;
type StateFilter = typeof stateOptions[number];

const RECENTS_KEY = "wamiro-support-recents";
const MAX_RECENTS = 4;

interface RecentEntry { id: number; title: string; openedAt: number }

function readRecents(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r) => r && typeof r.id === "number")
      .slice(0, MAX_RECENTS);
  } catch { return []; }
}

function writeRecents(entry: RecentEntry) {
  if (typeof window === "undefined") return;
  const next = [entry, ...readRecents().filter((r) => r.id !== entry.id)].slice(0, MAX_RECENTS);
  try { window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch {}
}

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

export function SupportClient({
  tickets,
  configured,
}: {
  tickets: Ticket[];
  configured: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => { setRecents(readRecents()); }, []);

  // Stats
  const stats = useMemo(() => {
    const open = tickets.filter((t) => !["closed"].includes(t.state.toLowerCase())).length;
    const closed = tickets.filter((t) => t.state.toLowerCase() === "closed").length;
    const escalated = tickets.filter((t) => t.state.toLowerCase() === "escalated").length;
    return { total: tickets.length, open, closed, escalated };
  }, [tickets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      const matchesQ = !q || t.title.toLowerCase().includes(q) || String(t.id).includes(q);
      const matchesState = stateFilter === "all" || t.state.toLowerCase() === stateFilter;
      return matchesQ && matchesState;
    });
  }, [tickets, search, stateFilter]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/v1/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: f.get("title"), body: f.get("body") }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not create ticket");
        return;
      }
      setDone(true);
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function openTicket(t: Ticket) {
    setOpenId(t.id);
    setDetail(null);
    setDetailError(null);
    setDetailBusy(true);
    const entry: RecentEntry = { id: t.id, title: t.title, openedAt: Date.now() };
    writeRecents(entry);
    setRecents(readRecents());
    try {
      const res = await fetch(`/api/v1/support/tickets/${t.id}`);
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setDetailError(d.error?.message ?? `Could not load ticket #${t.id}`);
        return;
      }
      const body = (await res.json()) as { ticket: TicketDetail };
      setDetail(body.ticket);
    } finally {
      setDetailBusy(false);
    }
  }

  if (!configured) {
    return (
      <Card>
        <EmptyState
          title="Helpdesk not connected"
          hint="An administrator must connect Zammad (ZAMMAD_BASE_URL and ZAMMAD_TOKEN) to enable support tickets."
        />
      </Card>
    );
  }

  return (
    <>
      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total" value={stats.total} />
        <Stat label="Open" value={stats.open} hint="new, open, pending, escalated" />
        <Stat label="Escalated" value={stats.escalated} tone="red" />
        <Stat label="Closed" value={stats.closed} tone="neutral" />
      </div>

      {recents.length > 0 && (
        <Card>
          <CardHeader title="Recently opened" subtitle="Up to your last four tickets" />
          <ul className="flex flex-wrap gap-2 px-5 py-3">
            {recents.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    const t = tickets.find((x) => x.id === r.id);
                    if (t) openTicket(t);
                    else setOpenId(r.id);
                  }}
                  className="inline-flex items-center gap-2 rounded-md border border-border-default bg-surface px-2.5 py-1.5 text-xs hover:bg-surface-hover"
                  title={new Date(r.openedAt).toLocaleString()}
                >
                  <span aria-hidden>🕘</span>
                  <span className="max-w-[20ch] truncate font-medium text-primary">#{r.id} · {r.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="New ticket" />
        <form onSubmit={submit} className="space-y-3 px-5 py-4">
          <label className="block text-sm font-medium">
            Subject
            <input name="title" className={`${input} mt-1`} required minLength={3} maxLength={200} />
          </label>
          <label className="block text-sm font-medium">
            Describe the issue
            <textarea name="body" className={`${input} mt-1 min-h-28`} required minLength={5} />
          </label>
          <button type="submit" disabled={busy} className={btn.primary}>
            {busy ? "Submitting…" : "Submit ticket"}
          </button>
          {done && (
            <span role="status" className="ml-3 text-sm text-success">
              Ticket created — the IT team will follow up.
            </span>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </form>
      </Card>

      <Card>
        <CardHeader
          title={`My tickets (${filtered.length})`}
          action={
            <div className="flex items-center gap-2">
              <input
                aria-label="Search tickets"
                placeholder="Filter by title or id…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${input} h-8 w-56`}
              />
              <select
                aria-label="State filter"
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value as StateFilter)}
                className={`${input} h-8 w-40`}
              >
                {stateOptions.map((s) => (
                  <option key={s} value={s}>{s === "all" ? "All states" : s}</option>
                ))}
              </select>
            </div>
          }
        />
        {filtered.length === 0 ? (
          <EmptyState
            title={tickets.length === 0 ? "No tickets yet" : "No tickets match your filter"}
            hint={tickets.length === 0 ? "Open one above and track its status here." : "Try a different search or state filter."}
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {filtered.map((t) => {
              const isOpen = openId === t.id;
              const pTone = priorityTone[t.priority.toLowerCase()] ?? "neutral";
              return (
                <li key={t.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-mono text-xs text-tertiary">#{t.id}</span>
                    <button
                      type="button"
                      onClick={() => (isOpen ? setOpenId(null) : openTicket(t))}
                      className="min-w-0 flex-1 truncate text-left font-medium text-primary hover:underline"
                      aria-expanded={isOpen}
                    >
                      {t.title}
                    </button>
                    <Badge tone={stateTone[t.state.toLowerCase()] ?? "neutral"}>{t.state}</Badge>
                    <Badge tone={pTone}>{t.priority}</Badge>
                    <span className="text-xs text-tertiary" title={new Date(t.createdAt).toLocaleString()}>
                      {fmtRelative(t.createdAt)}
                      {t.updatedAt && t.updatedAt !== t.createdAt ? ` · updated ${fmtRelative(t.updatedAt)}` : ""}
                    </span>
                  </div>
                  {isOpen && (
                    <div className="mt-3 rounded-md border border-border-subtle bg-surface-subtle px-4 py-3 text-sm">
                      {detailBusy && <p className="text-tertiary">Loading ticket…</p>}
                      {detailError && <p role="alert" className="text-danger">{detailError}</p>}
                      {detail && (
                        <>
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                            <div><dt className="text-tertiary">Opened</dt><dd className="text-primary">{new Date(detail.createdAt).toLocaleString()}</dd></div>
                            <div><dt className="text-tertiary">Updated</dt><dd className="text-primary">{new Date(detail.updatedAt).toLocaleString()}</dd></div>
                            <div><dt className="text-tertiary">State</dt><dd className="text-primary">{detail.state}</dd></div>
                            <div><dt className="text-tertiary">Priority</dt><dd className="text-primary">{detail.priority}</dd></div>
                          </dl>
                          {detail.articles.length > 0 && (
                            <div className="mt-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">Conversation</p>
                              <ol className="mt-2 space-y-2">
                                {detail.articles.map((a) => (
                                  <li
                                    key={a.id}
                                    className={[
                                      "rounded-md border px-3 py-2 text-sm",
                                      a.sender === "Customer"
                                        ? "border-brand/30 bg-brand-subtle"
                                        : "border-border-default bg-surface",
                                    ].join(" ")}
                                  >
                                    <div className="flex items-center justify-between text-xs text-tertiary">
                                      <span className="font-medium">{a.sender ?? "Note"}</span>
                                      <span>{new Date(a.created_at).toLocaleString()}</span>
                                    </div>
                                    {a.subject && a.subject !== t.title && (
                                      <p className="mt-1 text-xs font-semibold text-primary">{a.subject}</p>
                                    )}
                                    <p className="mt-1 whitespace-pre-wrap text-primary">{a.body}</p>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}
                          <p className="mt-3 text-xs text-tertiary">
                            To reply, open the ticket in the helpdesk. Wamiro surfaces IT status; the helpdesk is the system of record.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "neutral" | "red" | "amber" | "brand";
}) {
  return (
    <Card className="px-5 py-4">
      <p className="text-xs font-medium text-tertiary">{label}</p>
      <p
        className={[
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "red" && "text-danger",
          tone === "amber" && "text-warning",
          tone === "brand" && "text-brand-text",
        ].filter(Boolean).join(" ")}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-tertiary">{hint}</p> : null}
    </Card>
  );
}
