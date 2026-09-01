"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileSignature,
  Inbox,
  Loader2,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

import { Badge } from "./ui";
import { cx } from "@/lib/cx";

// ── Types ───────────────────────────────────────────────────────
export interface AcknowledgementRow {
  id: string;
  title: string;
  body: string;
  authorName: string | null;
  authorAvatar: string | null;
  createdAt: string;
  signedAt: string | null;
  mySignature: string | null;
}

export interface CompletionStat {
  id: string;
  title: string;
  signed: number;
  total: number;
  createdAt: string;
}

type ScopeFilter = "all" | "pending" | "signed";
type SortKey = "recent" | "alpha" | "pending";

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
export function AcknowledgementsListClient({
  items,
  stats,
  canPublish,
  viewerName,
}: {
  items: AcknowledgementRow[];
  stats: CompletionStat[];
  canPublish: boolean;
  viewerName: string;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (scope !== "all") params.set("s", scope);
    else params.delete("s");
    if (q) params.set("q", q);
    else params.delete("q");
    if (selectedId) params.set("d", selectedId);
    else params.delete("d");
    const qs = params.toString();
    router.replace(qs ? `/acknowledgements?${qs}` : "/acknowledgements", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, q, selectedId]);

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
    const out = items.filter((a) => {
      if (scope === "pending" && a.signedAt) return false;
      if (scope === "signed" && !a.signedAt) return false;
      if (needle && !a.title.toLowerCase().includes(needle) && !a.body.toLowerCase().includes(needle)) {
        return false;
      }
      return true;
    });
    const sorted = [...out];
    switch (sort) {
      case "alpha":
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "pending":
        sorted.sort((a, b) => {
          if (!!a.signedAt !== !!b.signedAt) return a.signedAt ? 1 : -1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        break;
      default:
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return sorted;
  }, [items, q, scope, sort]);

  const summary = useMemo(() => {
    return {
      total: items.length,
      pending: items.filter((a) => !a.signedAt).length,
      signed: items.filter((a) => a.signedAt).length,
    };
  }, [items]);

  // Overall completion rate (for the viewer)
  const overall = useMemo(() => {
    if (items.length === 0) return 1;
    return summary.signed / summary.total;
  }, [items, summary]);

  const selected = selectedId ? items.find((a) => a.id === selectedId) ?? null : null;

  async function sign(id: string, signatureName: string) {
    setBusy(id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/v1/acknowledgements/${id}/sign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signatureName }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not record signature");
        return false;
      }
      setSuccess("Signature recorded");
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Hero progress strip (only when there are pending items) */}
      {items.length > 0 && summary.pending > 0 ? (
        <div className="rounded-lg border border-warning-subtle bg-warning-subtle/30 p-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-warning-subtle text-warning">
              <AlertCircle className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-primary">
                {summary.pending} document{summary.pending === 1 ? "" : "s"} need your signature
              </p>
              <p className="text-[11px] text-tertiary">
                Type your full name to acknowledge each one. Your signed copy is timestamped and logged.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ProgressBar pct={overall} />
              <span className="text-[11px] tabular-nums text-tertiary">
                {summary.signed}/{summary.total} signed
              </span>
            </div>
          </div>
        </div>
      ) : items.length > 0 ? (
        <div className="rounded-lg border border-success/30 bg-success-subtle/40 p-3 text-xs text-success">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <CheckCircle2 className="h-3.5 w-3.5" />
            All caught up — you've signed every acknowledgement.
          </span>
        </div>
      ) : null}

      {/* Completion stats for managers */}
      {canPublish && stats.length > 0 ? (
        <CompletionStatsPanel stats={stats} />
      ) : null}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 grow sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tertiary" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search acknowledgements..."
            aria-label="Search acknowledgements"
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
          {(["all", "pending", "signed"] as ScopeFilter[]).map((s) => (
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
              {s === "all" ? "All" : s === "pending" ? "Action required" : "Signed"}
              {s === "pending" && summary.pending > 0 ? (
                <span
                  className={cx(
                    "ml-1 inline-block min-w-4 rounded-full px-1 text-[10px] tabular-nums",
                    scope === s ? "bg-brand-hover" : "bg-warning-subtle text-warning",
                  )}
                >
                  {summary.pending}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <select
          aria-label="Sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-8 rounded-md border border-border-default bg-surface px-2 text-xs text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        >
          <option value="recent">Most recent</option>
          <option value="alpha">Title (A→Z)</option>
          <option value="pending">Pending first</option>
        </select>
      </div>

      {/* One-line summary */}
      <p className="text-xs text-tertiary">
        {summary.total} document{summary.total === 1 ? "" : "s"} · {summary.pending} pending ·{" "}
        {summary.signed} signed
        {q ? <> · {visible.length} match{visible.length === 1 ? "" : "es"} for &ldquo;{q}&rdquo;</> : null}
      </p>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="inline-flex items-center gap-1 text-xs text-success">
          <CheckCircle2 className="h-3 w-3" />
          {success}
        </p>
      ) : null}

      {/* Results */}
      {visible.length === 0 ? (
        <AcknowledgementsEmpty
          scope={scope}
          q={q}
          canPublish={canPublish}
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((a) => (
            <li key={a.id}>
              <AcknowledgementCard
                a={a}
                onOpen={() => setSelectedId(a.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Sign sheet */}
      {selected ? (
        <SignSheet
          a={selected}
          viewerName={viewerName}
          busy={busy === selected.id}
          onClose={() => setSelectedId(null)}
          onSign={sign}
        />
      ) : null}
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────
function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-warning-subtle/60">
      <div
        className="h-full bg-warning"
        style={{ width: `${clamped * 100}%` }}
        aria-hidden
      />
    </div>
  );
}

function CompletionStatsPanel({ stats }: { stats: CompletionStat[] }) {
  const totalSigned = stats.reduce((s, r) => s + r.signed, 0);
  const totalPeople = stats.reduce((s, r) => s + r.total, 0);
  const overall = totalPeople === 0 ? 1 : totalSigned / totalPeople;
  return (
    <div className="rounded-lg border border-border-subtle bg-surface">
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-tertiary" />
          <h2 className="text-sm font-semibold text-primary">Completion</h2>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-tertiary">
          <span className="tabular-nums">
            {totalSigned}/{totalPeople} signed ({Math.round(overall * 100)}%)
          </span>
          <ProgressBar pct={overall} />
        </div>
      </div>
      <ul className="divide-y divide-border-subtle">
        {stats.map((s) => {
          const pct = s.total === 0 ? 1 : s.signed / s.total;
          return (
            <li key={s.id} className="flex items-center gap-3 px-4 py-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-primary">{s.title}</span>
              <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-tertiary">
                {s.signed}/{s.total}
              </span>
              <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-surface-subtle">
                <div
                  className={cx(
                    "h-full",
                    pct >= 1 ? "bg-success" : pct >= 0.5 ? "bg-warning" : "bg-danger",
                  )}
                  style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%` }}
                  aria-hidden
                />
              </div>
              <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-tertiary">
                {Math.round(pct * 100)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AcknowledgementCard({
  a,
  onOpen,
}: {
  a: AcknowledgementRow;
  onOpen: () => void;
}) {
  const signed = !!a.signedAt;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        "group flex w-full items-start gap-3 rounded-lg border bg-surface px-4 py-3 text-left transition",
        signed ? "border-border-subtle hover:border-border-default" : "border-warning/40 hover:border-warning/60 bg-warning-subtle/20",
      )}
    >
      <div
        className={cx(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
          signed ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning",
        )}
        aria-hidden
      >
        {signed ? <CheckCircle2 className="h-4 w-4" /> : <FileSignature className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="truncate text-sm font-semibold text-primary">{a.title}</h3>
          {signed ? (
            <Badge tone="success">Signed</Badge>
          ) : (
            <Badge tone="amber">Action required</Badge>
          )}
        </div>
        <p className="line-clamp-1 text-xs text-secondary">{a.body}</p>
        <p className="mt-1 text-[11px] text-tertiary">
          {signed && a.signedAt ? (
            <>
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="h-3 w-3 text-success" />
                Signed {timeAgo(a.signedAt)}
                {a.mySignature ? ` as "${a.mySignature}"` : ""}
              </span>
              <span className="mx-1.5">·</span>
              Published {timeAgo(a.createdAt)}
            </>
          ) : (
            <>{a.authorName ? `From ${a.authorName}` : "From admin"} · {timeAgo(a.createdAt)}</>
          )}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-tertiary" />
    </button>
  );
}

function AcknowledgementsEmpty({
  scope,
  q,
  canPublish,
}: {
  scope: ScopeFilter;
  q: string;
  canPublish: boolean;
}) {
  let title = "Nothing to acknowledge";
  let hint = "Policies that require your signature appear here.";
  if (q) {
    title = "No documents match your search";
    hint = "Try a different search term or clear the filter.";
  } else if (scope === "pending") {
    title = "All caught up";
    hint = "No pending acknowledgements. Nice work.";
  } else if (scope === "signed") {
    title = "No signed documents yet";
    hint = "Documents you sign will appear here.";
  }
  return (
    <div className="rounded-lg border border-dashed border-border-default bg-surface px-6 py-10 text-center">
      <Inbox className="mx-auto h-6 w-6 text-tertiary" />
      <p className="mt-2 text-sm font-medium text-primary">{title}</p>
      <p className="mt-1 text-xs text-tertiary">{hint}</p>
      {!canPublish ? null : null /* Publish form lives in PublishAcknowledgementForm below */}
    </div>
  );
}

function SignSheet({
  a,
  viewerName,
  busy,
  onClose,
  onSign,
}: {
  a: AcknowledgementRow;
  viewerName: string;
  busy: boolean;
  onClose: () => void;
  onSign: (id: string, signatureName: string) => Promise<boolean>;
}) {
  const [signatureName, setSignatureName] = useState(viewerName);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setSignatureName(viewerName);
  }, [viewerName]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const nameOk =
    signatureName.trim().toLowerCase().replace(/\s+/g, " ") ===
    viewerName.trim().toLowerCase().replace(/\s+/g, " ");

  async function submit() {
    if (!nameOk) {
      setLocalError("Type your full name exactly as it appears on your profile");
      return;
    }
    setLocalError(null);
    const ok = await onSign(a.id, signatureName.trim());
    if (ok) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal,50)] flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={a.title}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="flex h-full w-full max-w-md flex-col bg-surface shadow-xl">
        <div className="flex items-start gap-3 border-b border-border-default px-5 py-3">
          <div
            className={cx(
              "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
              a.signedAt ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning",
            )}
            aria-hidden
          >
            {a.signedAt ? <CheckCircle2 className="h-5 w-5" /> : <FileSignature className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
              Acknowledgement
            </p>
            <h2 className="truncate text-base font-semibold text-primary">{a.title}</h2>
            <p className="mt-0.5 text-[11px] text-tertiary">
              Published {new Date(a.createdAt).toLocaleString()}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded p-1 text-tertiary hover:bg-surface-hover hover:text-primary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <pre className="whitespace-pre-wrap text-sm leading-relaxed text-primary">{a.body}</pre>

          {a.signedAt ? (
            <div className="rounded-md border border-success/30 bg-success-subtle/40 p-3 text-xs">
              <p className="inline-flex items-center gap-1.5 font-semibold text-success">
                <ShieldCheck className="h-3.5 w-3.5" />
                You've signed this document
              </p>
              <p className="mt-1 text-[11px] text-tertiary">
                Signed as <span className="font-medium text-primary">&ldquo;{a.mySignature}&rdquo;</span> on{" "}
                {new Date(a.signedAt).toLocaleString()}. This signature is timestamped and logged.
              </p>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
              className="space-y-3 rounded-md border border-warning/30 bg-warning-subtle/30 p-3"
            >
              <label className="block text-xs font-medium text-secondary">
                Type your full name to sign
                <input
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border-default bg-surface px-2.5 py-1.5 text-sm text-primary placeholder:text-tertiary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="off"
                  placeholder={viewerName}
                />
                <span className="mt-1 block text-[10px] text-tertiary">
                  Must match your profile name: <span className="font-medium text-primary">{viewerName}</span>
                </span>
              </label>
              {localError ? (
                <p role="alert" className="text-xs text-danger">
                  {localError}
                </p>
              ) : null}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-tertiary hover:text-primary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || !nameOk}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-hover disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-3 w-3" />
                  )}
                  I acknowledge
                </button>
              </div>
            </form>
          )}

          <div className="rounded-md border border-border-subtle bg-surface-subtle/40 p-3 text-[11px] text-tertiary">
            <p className="font-medium text-secondary">Legal note</p>
            <p className="mt-1">
              Your signature is a typed name + a timestamp. It is recorded in the audit log
              alongside your account name and the IP address that signed. This is a meaningful
              record of acknowledgment, not a qualified electronic signature.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
