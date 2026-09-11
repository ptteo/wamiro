"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  Bell,
  Calendar,
  Check,
  CheckCheck,
  CircleAlert,
  Inbox,
  ListTodo,
  Megaphone,
  Plane,
  Receipt,
  Settings2,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

import { cx } from "@/lib/cx";
import { toast } from "@/components/toaster";

interface Item {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

const ICON: Record<string, React.ReactNode> = {
  // exact
  leave: <Calendar className="h-3.5 w-3.5" />,
  request: <Receipt className="h-3.5 w-3.5" />,
  task: <ListTodo className="h-3.5 w-3.5" />,
  project: <ListTodo className="h-3.5 w-3.5" />,
  team: <UserPlus className="h-3.5 w-3.5" />,
  announcement: <Megaphone className="h-3.5 w-3.5" />,
  asset: <Wallet className="h-3.5 w-3.5" />,
  automation: <Zap className="h-3.5 w-3.5" />,
  governance: <CircleAlert className="h-3.5 w-3.5" />,
  recognition: <Sparkles className="h-3.5 w-3.5" />,
  ai: <Sparkles className="h-3.5 w-3.5" />,
  system: <Settings2 className="h-3.5 w-3.5" />,
  // legacy / dot-prefixed kinds emitted by older services
  "leave.requested": <Calendar className="h-3.5 w-3.5" />,
  "leave.approved": <Calendar className="h-3.5 w-3.5" />,
  "leave.rejected": <Calendar className="h-3.5 w-3.5" />,
  "request.created": <Receipt className="h-3.5 w-3.5" />,
  "request.approved": <Receipt className="h-3.5 w-3.5" />,
  "request.rejected": <Receipt className="h-3.5 w-3.5" />,
  "request.step_pending": <Receipt className="h-3.5 w-3.5" />,
  "task.assigned": <ListTodo className="h-3.5 w-3.5" />,
  "project.member_added": <UserPlus className="h-3.5 w-3.5" />,
  "team.member_added": <UserPlus className="h-3.5 w-3.5" />,
  "asset.assigned": <Wallet className="h-3.5 w-3.5" />,
  "automation.matched": <Zap className="h-3.5 w-3.5" />,
};

const STRIPE: Record<string, string> = {
  leave: "bg-brand",
  request: "bg-warning",
  task: "bg-info",
  project: "bg-info",
  team: "bg-info",
  announcement: "bg-warning",
  asset: "bg-info",
  automation: "bg-info",
  governance: "bg-danger",
  recognition: "bg-warning",
  ai: "bg-brand",
  system: "bg-tertiary",
};

function iconFor(type: string): React.ReactNode {
  return ICON[type] ?? ICON[type.split(".")[0] ?? ""] ?? <Bell className="h-3.5 w-3.5" />;
}
function stripeFor(type: string): string {
  const t = STRIPE[type] ?? STRIPE[type.split(".")[0] ?? ""] ?? "bg-tertiary";
  return t;
}

/** Compact relative time — same format as Home. */
function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const m = Math.floor((Date.now() - t) / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d`;
  if (d < 30) return `${Math.floor(d / 7)}w`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function bucket(iso: string): "today" | "yesterday" | "this_week" | "earlier" {
  const t = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const startOfWeek = startOfToday - 6 * 86_400_000;
  if (t.getTime() >= startOfToday) return "today";
  if (t.getTime() >= startOfYesterday) return "yesterday";
  if (t.getTime() >= startOfWeek) return "this_week";
  return "earlier";
}

const BUCKET_LABEL: Record<string, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This week",
  earlier: "Earlier",
};

const BUCKET_ORDER: Array<"today" | "yesterday" | "this_week" | "earlier"> = [
  "today",
  "yesterday",
  "this_week",
  "earlier",
];

export function NotificationsClient({ items }: { items: Item[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  // Phase 6 §2 — optimistic read state: flips instantly, rolls back on error.
  const [optimisticRead, setOptimisticRead] = useState<Record<string, boolean>>({});

  const visible = useMemo(
    () =>
      items
        .map((i) => (i.id in optimisticRead ? { ...i, read: optimisticRead[i.id]! } : i))
        .filter((i) => (filter === "unread" ? !i.read : true)),
    [items, filter, optimisticRead],
  );
  const unread = items.filter((i) => !i.read).length;

  const groups = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of visible) {
      const b = bucket(it.createdAt);
      const arr = map.get(b) ?? [];
      arr.push(it);
      map.set(b, arr);
    }
    return BUCKET_ORDER.filter((b) => (map.get(b)?.length ?? 0) > 0).map((b) => ({
      key: b,
      label: BUCKET_LABEL[b]!,
      items: map.get(b)!,
    }));
  }, [visible]);

  async function markRead(id: string) {
    if (optimisticRead[id]) return;
    setOptimisticRead((cur) => ({ ...cur, [id]: true }));
    setPendingId(id);
    try {
      const res = await fetch(`/api/v1/notifications/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "read" }),
      });
      if (!res.ok) throw new Error("Could not mark as read");
      router.refresh();
    } catch (e) {
      setOptimisticRead((cur) => {
        const next = { ...cur };
        delete next[id];
        return next;
      });
      toast.error((e as Error).message);
    } finally {
      setPendingId(null);
    }
  }

  async function markAll() {
    setBusy(true);
    const prev = optimisticRead;
    // optimistic: flip everything visible
    setOptimisticRead(Object.fromEntries(visible.map((i) => [i.id, true])));
    try {
      const res = await fetch("/api/v1/notifications/read-all", { method: "POST" });
      if (!res.ok) throw new Error("Could not mark all as read");
      router.refresh();
      toast.success("All caught up");
    } catch (e) {
      setOptimisticRead(prev); // rollback
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[820px] space-y-5">
      {/* Header — title + counters + filter chips + mark all */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-primary">Notifications</h1>
          <p className="mt-0.5 text-xs text-tertiary">
            {unread > 0
              ? `${unread} unread of ${items.length}`
              : items.length === 0
                ? "Inbox zero"
                : `All ${items.length} read`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border-default bg-surface p-0.5 text-xs">
            {(["all", "unread"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cx(
                  "rounded px-2.5 py-1 font-medium transition",
                  filter === f
                    ? "bg-brand text-on-brand"
                    : "text-tertiary hover:text-primary",
                )}
                aria-pressed={filter === f}
              >
                {f === "all" ? "All" : `Unread${unread > 0 ? ` · ${unread}` : ""}`}
              </button>
            ))}
          </div>
          {unread > 0 ? (
            <button
              type="button"
              onClick={markAll}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-default bg-surface px-2.5 py-1 text-xs font-medium text-secondary transition hover:border-border-default hover:text-primary disabled:opacity-50"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          ) : null}
        </div>
      </header>

      {items.length === 0 ? (
        <EmptyState />
      ) : visible.length === 0 ? (
        <FilteredEmpty filter={filter} />
      ) : (
        <ul className="space-y-6">
          {groups.map((g) => (
            <li key={g.key}>
              <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
                {g.label}
              </p>
              <ul className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
                {g.items.map((n, idx) => (
                  <li
                    key={n.id}
                    className={cx(
                      "group relative",
                      idx > 0 && "border-t border-border-subtle",
                    )}
                  >
                    {/* Left colored stripe (3px) — type indicator */}
                    <span
                      aria-hidden
                      className={cx(
                        "absolute inset-y-0 left-0 w-[3px]",
                        stripeFor(n.type),
                        n.read && "opacity-40",
                      )}
                    />
                    <div className="flex items-start gap-3 px-4 py-3 pl-5">
                      {/* Type icon */}
                      <span
                        className={cx(
                          "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                          n.read ? "bg-surface-subtle text-tertiary" : "bg-brand-subtle text-brand-text",
                        )}
                      >
                        {iconFor(n.type)}
                      </span>

                      {/* Title + body */}
                      <div className="min-w-0 flex-1">
                        {n.link ? (
                          <Link
                            href={n.link}
                            onClick={() => {
                              if (!n.read) void markRead(n.id);
                            }}
                            className={cx(
                              "block text-sm leading-snug hover:underline",
                              n.read ? "text-secondary" : "font-semibold text-primary",
                            )}
                          >
                            {n.title}
                          </Link>
                        ) : (
                          <p
                            className={cx(
                              "text-sm leading-snug",
                              n.read ? "text-secondary" : "font-semibold text-primary",
                            )}
                          >
                            {n.title}
                          </p>
                        )}
                        {n.body ? (
                          <p className="mt-0.5 line-clamp-2 text-xs text-tertiary">{n.body}</p>
                        ) : null}
                      </div>

                      {/* Time + per-row mark read */}
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className="text-[11px] tabular-nums text-tertiary"
                          title={new Date(n.createdAt).toLocaleString()}
                        >
                          {relTime(n.createdAt)}
                        </span>
                        {!n.read ? (
                          <button
                            type="button"
                            aria-label="Mark as read"
                            disabled={pendingId === n.id}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void markRead(n.id);
                            }}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-tertiary opacity-0 transition group-hover:opacity-100 hover:bg-surface-hover hover:text-primary disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {/* Unread dot — small, top-right of body */}
                    {!n.read ? (
                      <span
                        aria-hidden
                        className="absolute right-3 top-3 h-1.5 w-1.5 rounded-full bg-brand"
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border-default bg-surface px-6 py-12 text-center">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-success-subtle text-success">
        <Inbox className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold text-primary">Inbox zero</p>
      <p className="mt-0.5 text-xs text-tertiary">
        Approvals, leave decisions and other updates will land here.
      </p>
    </div>
  );
}

function FilteredEmpty({ filter }: { filter: "all" | "unread" }) {
  return (
    <div className="rounded-lg border border-dashed border-border-default bg-surface px-6 py-10 text-center">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-subtle text-tertiary">
        <AlertCircle className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-medium text-primary">
        {filter === "unread" ? "No unread notifications" : "Nothing here"}
      </p>
      <p className="mt-0.5 text-xs text-tertiary">
        {filter === "unread" ? "You are all caught up." : "Try a different filter."}
      </p>
    </div>
  );
}
