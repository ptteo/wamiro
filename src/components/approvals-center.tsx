"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Filter,
  Inbox,
  Search,
  X,
  XCircle,
} from "lucide-react";

import { Avatar, Badge, btn } from "./ui";
import { cx } from "@/lib/cx";

// ── Types ───────────────────────────────────────────────────────
export interface PendingItem {
  kind: "leave" | "request";
  id: string;
  title: string;
  subtitle: string;
  requesterName: string;
  requesterAvatar: string | null;
  /** SLA due time (if any) — drives the "stale" / "due soon" badge. */
  slaDueAt: string | null;
  /** When the request was submitted (ISO). */
  submittedAt: string;
  /** Total items currently in the chain. */
  totalSteps?: number;
  /** Current step (0-indexed). */
  currentStep?: number;
  /** Searchable lower-cased haystack. */
  haystack: string;
}

export interface DecisionItem {
  kind: "leave" | "request";
  id: string;
  title: string;
  requesterName: string;
  requesterAvatar: string | null;
  status: "approved" | "rejected";
  decidedAt: string; // ISO
  note: string | null;
  haystack: string;
}

type Tab = "pending" | "approved" | "rejected";
type AgeFilter = "all" | "stale" | "today" | "week";
type KindFilter = "all" | "leave" | "request";

const AGE_LABEL: Record<AgeFilter, string> = {
  all: "All ages",
  stale: "Stale",
  today: "Today",
  week: "This week",
};

const KIND_LABEL: Record<KindFilter, string> = {
  all: "All kinds",
  leave: "Leave",
  request: "Requests",
};

function slaState(iso: string | null, submittedAt: string) {
  if (!iso) {
    // No SLA — fall back to age buckets
    const ageMs = Date.now() - new Date(submittedAt).getTime();
    if (ageMs > 3 * 86_400_000) return { label: "No SLA · 3d+ old", tone: "muted" as const, isStale: false };
    return null;
  }
  const ms = new Date(iso).getTime() - Date.now();
  const overdue = ms < 0;
  const hrs = Math.round(ms / 3_600_000);
  if (overdue) {
    const days = Math.abs(Math.round(ms / 86_400_000));
    return { label: `SLA breached · ${days}d overdue`, tone: "danger" as const, isStale: true };
  }
  if (hrs <= 24) {
    return { label: `Due in ${hrs}h`, tone: "warning" as const, isStale: false };
  }
  return { label: `Due in ${Math.round(hrs / 24)}d`, tone: "muted" as const, isStale: false };
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
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function dayBucket(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((now.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return "This week";
  if (diff < 30) return "Earlier this month";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// ── Component ───────────────────────────────────────────────────
export function ApprovalsCenter({
  pending,
  decisions,
}: {
  pending: PendingItem[];
  decisions: DecisionItem[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("pending");
  const [age, setAge] = useState<AgeFilter>("all");
  const [kind, setKind] = useState<KindFilter>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filteredPending = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const now = Date.now();
    return pending.filter((p) => {
      if (kind !== "all" && p.kind !== kind) return false;
      if (needle && !p.haystack.includes(needle)) return false;
      if (age !== "all") {
        const ageMs = now - new Date(p.submittedAt).getTime();
        const sla = slaState(p.slaDueAt, p.submittedAt);
        if (age === "stale") {
          if (!(sla?.isStale || ageMs > 3 * 86_400_000)) return false;
        } else if (age === "today") {
          if (ageMs > 86_400_000) return false;
        } else if (age === "week") {
          if (ageMs > 7 * 86_400_000) return false;
        }
      }
      return true;
    });
  }, [pending, q, kind, age]);

  const approved = decisions.filter((d) => d.status === "approved");
  const rejected = decisions.filter((d) => d.status === "rejected");
  const filteredApproved = useMemo(() => filterSet(approved, q, kind), [approved, q, kind]);
  const filteredRejected = useMemo(() => filterSet(rejected, q, kind), [rejected, q, kind]);

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function decide(
    kind: "leave" | "request",
    id: string,
    decision: "approved" | "rejected",
    note?: string,
  ): Promise<boolean> {
    setBusy(`${kind}:${id}`);
    setError(null);
    try {
      const url =
        kind === "leave"
          ? `/api/v1/leave/${id}/review`
          : `/api/v1/requests/${id}/review`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Action failed");
        return false;
      }
      router.refresh();
      setSelected((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function bulkApprove() {
    if (selected.size === 0) return;
    setBusy("bulk");
    setError(null);
    try {
      const items = filteredPending.filter((p) => selected.has(p.id));
      const results = await Promise.allSettled(
        items.map((p) =>
          fetch(p.kind === "leave" ? `/api/v1/leave/${p.id}/review` : `/api/v1/requests/${p.id}/review`, {
            method: "POST",
            headers: { "content-Type": "application/json" },
            body: JSON.stringify({ decision: "approved" }),
          }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;
      if (failed > 0) {
        setError(`${items.length - failed} approved, ${failed} failed`);
      }
      clearSelection();
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const tabs: Array<{ key: Tab; label: string; count: number; tone: "brand" | "success" | "tertiary" }> = [
    { key: "pending", label: "Pending", count: pending.length, tone: "brand" },
    { key: "approved", label: "Approved", count: approved.length, tone: "success" },
    { key: "rejected", label: "Rejected", count: rejected.length, tone: "tertiary" },
  ];

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Approval views" className="inline-flex rounded-md border border-border-subtle bg-surface p-0.5 text-xs">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => {
                setTab(t.key);
                clearSelection();
              }}
              className={cx(
                "inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition",
                tab === t.key ? "bg-brand text-on-brand" : "text-tertiary hover:text-primary",
              )}
            >
              {t.label}
              <span
                className={cx(
                  "rounded-full px-1 text-[10px] tabular-nums",
                  tab === t.key ? "bg-brand-hover" : "bg-surface-subtle text-tertiary",
                )}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {tab === "pending" ? (
          <>
            <div className="relative min-w-0 grow sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tertiary" aria-hidden />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search pending..."
                aria-label="Search pending"
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
            <FilterChips
              label="Age"
              value={age}
              onChange={setAge}
              options={AGE_LABEL}
            />
            <FilterChips
              label="Kind"
              value={kind}
              onChange={setKind}
              options={KIND_LABEL}
            />
          </>
        ) : null}
      </div>

      {/* Bulk action bar (only on pending with selection) */}
      {tab === "pending" && selected.size > 0 ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-brand-subtle bg-brand-subtle px-3 py-2 text-xs text-brand-text">
          <span className="font-medium">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-md px-2 py-1 text-xs font-medium text-secondary hover:bg-surface-hover"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={bulkApprove}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md bg-success px-3 py-1 text-xs font-medium text-on-brand transition hover:bg-success/90 disabled:opacity-50"
            >
              {busy === "bulk" ? (
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Approve all
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      {/* Tab content */}
      {tab === "pending" ? (
        <PendingList
          items={filteredPending}
          totalCount={pending.length}
          selected={selected}
          busy={busy}
          onToggleSelect={toggleSelect}
          onApprove={(k, id) => decide(k, id, "approved")}
          onRejectStart={(k, id) => setRejectingId(`${k}:${id}`)}
          onRejectCancel={() => setRejectingId(null)}
          onRejectConfirm={async (k, id, note) => {
            const ok = await decide(k, id, "rejected", note);
            if (ok) setRejectingId(null);
            return ok;
          }}
          rejectingId={rejectingId}
        />
      ) : (
        <HistoryTimeline
          items={tab === "approved" ? filteredApproved : filteredRejected}
          emptyTitle={
            tab === "approved" ? "No approved decisions yet" : "No rejected decisions yet"
          }
        />
      )}
    </div>
  );
}

function filterSet(items: DecisionItem[], q: string, kind: KindFilter): DecisionItem[] {
  const needle = q.trim().toLowerCase();
  return items.filter((d) => {
    if (kind !== "all" && d.kind !== kind) return false;
    if (needle && !d.haystack.includes(needle)) return false;
    return true;
  });
}

function FilterChips<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Record<T, string>;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-surface p-0.5 text-xs">
      <span className="px-1.5 text-[10px] font-medium uppercase tracking-wide text-tertiary">
        {label}
      </span>
      {(Object.entries(options) as Array<[T, string]>).map(([k, v]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          aria-pressed={value === k}
          className={cx(
            "rounded px-2 py-0.5 text-[11px] font-medium transition",
            value === k ? "bg-surface text-primary" : "text-tertiary hover:text-primary",
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────
function PendingList({
  items,
  totalCount,
  selected,
  busy,
  onToggleSelect,
  onApprove,
  onRejectStart,
  onRejectCancel,
  onRejectConfirm,
  rejectingId,
}: {
  items: PendingItem[];
  totalCount: number;
  selected: Set<string>;
  busy: string | null;
  onToggleSelect: (id: string) => void;
  onApprove: (kind: "leave" | "request", id: string) => Promise<boolean>;
  onRejectStart: (kind: "leave" | "request", id: string) => void;
  onRejectCancel: () => void;
  onRejectConfirm: (kind: "leave" | "request", id: string, note: string) => Promise<boolean>;
  rejectingId: string | null;
}) {
  if (items.length === 0) {
    return (
      <PendingEmpty
        totalCount={totalCount}
      />
    );
  }
  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const isSelected = selected.has(item.id);
        const isRejecting = rejectingId === `${item.kind}:${item.id}`;
        const itemBusy = busy === `${item.kind}:${item.id}`;
        const sla = slaState(item.slaDueAt, item.submittedAt);
        return (
          <li
            key={`${item.kind}-${item.id}`}
            className={cx(
              "rounded-lg border bg-surface transition",
              sla?.isStale
                ? "border-danger/40"
                : isSelected
                  ? "border-brand bg-brand-subtle/30"
                  : "border-border-subtle hover:border-border-default",
            )}
          >
            <div className="flex items-start gap-3 px-4 pt-4">
              <label className="pt-0.5">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelect(item.id)}
                  aria-label={`Select ${item.title}`}
                  className="h-3.5 w-3.5 rounded border-border-default text-brand focus:ring-brand"
                />
              </label>
              <Avatar
                name={item.requesterName}
                src={item.requesterAvatar ?? undefined}
                className="!h-9 !w-9 text-[10px]"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="truncate text-sm font-semibold text-primary">
                    {item.title}
                  </h3>
                  <Badge tone={item.kind === "leave" ? "brand" : "neutral"}>
                    {item.kind === "leave" ? "Leave" : "Request"}
                  </Badge>
                  {item.totalSteps && item.totalSteps > 1 ? (
                    <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-tertiary">
                      Step {item.currentStep !== undefined ? item.currentStep + 1 : 1}/{item.totalSteps}
                    </span>
                  ) : null}
                  {sla?.isStale ? <Badge tone="red">SLA breached</Badge> : null}
                </div>
                <p className="mt-0.5 text-[11px] text-secondary">{item.subtitle}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-[11px] text-tertiary">
                {sla ? (
                  <span
                    className={cx(
                      "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      sla.tone === "danger" && "bg-danger-subtle text-danger",
                      sla.tone === "warning" && "bg-warning-subtle text-warning",
                      sla.tone === "muted" && "bg-surface-subtle text-tertiary",
                    )}
                  >
                    <Clock className="h-2.5 w-2.5" />
                    {sla.label}
                  </span>
                ) : null}
                <span>Submitted {timeAgo(item.submittedAt)}</span>
              </div>
            </div>
            {isRejecting ? (
              <RejectionForm
                onCancel={onRejectCancel}
                busy={itemBusy}
                onSubmit={async (note) => {
                  const ok = await onRejectConfirm(item.kind, item.id, note ?? "");
                  return ok;
                }}
              />
            ) : (
              <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-border-subtle bg-surface-subtle/50 px-4 py-2">
                <button
                  type="button"
                  onClick={onRejectStart.bind(null, item.kind, item.id)}
                  disabled={busy !== null}
                  className={`${btn.danger} text-xs`}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Reject
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await onApprove(item.kind, item.id);
                  }}
                  disabled={busy !== null}
                  className={`${btn.success} text-xs`}
                >
                  {itemBusy ? (
                    <span
                      aria-hidden
                      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                    />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Approve
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PendingEmpty({ totalCount }: { totalCount: number }) {
  if (totalCount === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-default bg-surface px-6 py-10 text-center">
        <Inbox className="mx-auto h-6 w-6 text-tertiary" />
        <p className="mt-2 text-sm font-medium text-primary">Inbox zero</p>
        <p className="mt-1 text-xs text-tertiary">
          Nothing currently needs your decision. New requests will appear here.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-dashed border-border-default bg-surface px-6 py-10 text-center">
      <Filter className="mx-auto h-6 w-6 text-tertiary" />
      <p className="mt-2 text-sm font-medium text-primary">No matches</p>
      <p className="mt-1 text-xs text-tertiary">
        Try clearing your filters or search.
      </p>
    </div>
  );
}

function RejectionForm({
  onCancel,
  onSubmit,
  busy,
}: {
  onCancel: () => void;
  onSubmit: (note: string | null) => Promise<boolean>;
  busy: boolean;
}) {
  const [note, setNote] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (note.trim().length < 3) return;
        const ok = await onSubmit(note.trim());
        if (ok) setNote("");
      }}
      className="mt-3 space-y-2 border-t border-danger-subtle bg-danger-subtle/40 px-4 py-3"
    >
      <label className="block text-xs font-medium text-secondary">
        Reason for rejection
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 min-h-16 w-full rounded-md border border-border-default bg-surface px-2.5 py-1.5 text-sm text-primary placeholder:text-tertiary focus:border-danger focus:outline-none"
          placeholder="Explain why this is being rejected..."
          required
          minLength={3}
          maxLength={500}
        />
      </label>
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-md px-3 py-1 text-xs text-tertiary hover:text-primary"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || note.trim().length < 3}
          className={`${btn.danger} text-xs`}
        >
          <XCircle className="h-3.5 w-3.5" />
          Confirm rejection
        </button>
      </div>
    </form>
  );
}

function HistoryTimeline({
  items,
  emptyTitle,
}: {
  items: DecisionItem[];
  emptyTitle: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-default bg-surface px-6 py-10 text-center">
        <CheckCircle2 className="mx-auto h-6 w-6 text-tertiary" />
        <p className="mt-2 text-sm font-medium text-primary">{emptyTitle}</p>
        <p className="mt-1 text-xs text-tertiary">
          Your decision history will appear here.
        </p>
      </div>
    );
  }
  // Group by day bucket
  const groups = new Map<string, DecisionItem[]>();
  for (const d of items) {
    const key = dayBucket(d.decidedAt);
    const arr = groups.get(key) ?? [];
    arr.push(d);
    groups.set(key, arr);
  }
  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([bucket, list]) => (
        <section key={bucket}>
          <div className="mb-2 flex items-center gap-2">
            <CalendarClock className="h-3.5 w-3.5 text-tertiary" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-tertiary">
              {bucket}
            </h2>
            <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] tabular-nums text-tertiary">
              {list.length}
            </span>
          </div>
          <ul className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
            {list.map((d, i) => (
              <li
                key={d.id}
                className={cx(
                  "flex items-start gap-3 px-4 py-3 text-sm",
                  i > 0 && "border-t border-border-subtle",
                )}
              >
                <Avatar
                  name={d.requesterName}
                  src={d.requesterAvatar ?? undefined}
                  className="!h-8 !w-8 text-[10px]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h3 className="truncate text-sm font-semibold text-primary">{d.title}</h3>
                    <Badge tone={d.status === "approved" ? "success" : "tertiary"}>
                      {d.status === "approved" ? "Approved" : "Rejected"}
                    </Badge>
                    <Badge tone="neutral">{d.kind === "leave" ? "Leave" : "Request"}</Badge>
                  </div>
                  {d.note ? (
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-tertiary">
                      <span className="font-medium text-secondary">Note:</span> {d.note}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right text-[11px] text-tertiary">
                  <div>{new Date(d.decidedAt).toLocaleString()}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// Unused-but-exported so future code can build on it
export { AlertCircle };
