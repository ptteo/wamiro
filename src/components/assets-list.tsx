"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Inbox,
  Laptop,
  Loader2,
  Monitor,
  MoreHorizontal,
  PackageCheck,
  Plus,
  Search,
  Smartphone,
  Undo2,
  User as UserIcon,
  X,
} from "lucide-react";

import { Avatar, Badge } from "./ui";
import { cx } from "@/lib/cx";

// ── Types ───────────────────────────────────────────────────────
export type AssetCategory = "laptop" | "phone" | "monitor" | "other";

export interface AssetClientRow {
  id: string;
  name: string;
  category: AssetCategory;
  serialNumber: string | null;
  notes: string | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  assignedToAvatar: string | null;
  createdAt: string; // ISO
}

type ScopeFilter = "all" | "in_stock" | "assigned_to_me" | "category";

const CATEGORIES: AssetCategory[] = ["laptop", "phone", "monitor", "other"];

const CATEGORY_LABEL: Record<AssetCategory, string> = {
  laptop: "Laptops",
  phone: "Phones",
  monitor: "Monitors",
  other: "Other",
};

const CATEGORY_PLURAL: Record<AssetCategory, string> = {
  laptop: "Laptops",
  phone: "Phones",
  monitor: "Monitors",
  other: "Other",
};

// ── Helpers ─────────────────────────────────────────────────────
function categoryVisual(cat: AssetCategory): {
  Icon: typeof Laptop;
  tone: "brand" | "warning" | "success" | "neutral";
  label: string;
} {
  switch (cat) {
    case "laptop":
      return { Icon: Laptop, tone: "brand", label: "Laptop" };
    case "phone":
      return { Icon: Smartphone, tone: "warning", label: "Phone" };
    case "monitor":
      return { Icon: Monitor, tone: "success", label: "Monitor" };
    default:
      return { Icon: Archive, tone: "neutral", label: "Other" };
  }
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
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

// ── Component ───────────────────────────────────────────────────
export function AssetsListClient({
  assets,
  canManage,
  currentUserId,
}: {
  assets: AssetClientRow[];
  canManage: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<AssetCategory | null>(null);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // URL state
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (scope !== "all") params.set("s", scope);
    else params.delete("s");
    if (categoryFilter) params.set("c", categoryFilter);
    else params.delete("c");
    if (q) params.set("q", q);
    else params.delete("q");
    if (selectedId) params.set("d", selectedId);
    else params.delete("d");
    const qs = params.toString();
    router.replace(qs ? `/assets?${qs}` : "/assets", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, categoryFilter, q, selectedId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const d = params.get("d");
    if (d) setSelectedId(d);
    const c = params.get("c");
    if (c === "laptop" || c === "phone" || c === "monitor" || c === "other") {
      setCategoryFilter(c);
    }
    const s = params.get("s");
    if (s === "in_stock" || s === "assigned_to_me") setScope(s);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selectedId]);

  // Filter
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return assets.filter((a) => {
      if (scope === "in_stock" && a.assignedToUserId) return false;
      if (scope === "assigned_to_me" && a.assignedToUserId !== currentUserId) return false;
      if (categoryFilter && a.category !== categoryFilter) return false;
      if (needle) {
        if (
          !a.name.toLowerCase().includes(needle) &&
          !(a.serialNumber ?? "").toLowerCase().includes(needle) &&
          !(a.notes ?? "").toLowerCase().includes(needle) &&
          !(a.assignedToName ?? "").toLowerCase().includes(needle)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [assets, q, scope, categoryFilter, currentUserId]);

  // Sort: in-stock first, then by name
  const sorted = useMemo(() => {
    return [...visible].sort((a, b) => {
      if (!a.assignedToUserId !== !b.assignedToUserId) {
        return a.assignedToUserId ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [visible]);

  // Group by status
  const groups = useMemo(() => {
    const inStock: AssetClientRow[] = [];
    const assigned: AssetClientRow[] = [];
    for (const a of sorted) {
      if (a.assignedToUserId) assigned.push(a);
      else inStock.push(a);
    }
    return { inStock, assigned };
  }, [sorted]);

  // Category counts for the filter chips
  const categoryCounts = useMemo(() => {
    const counts: Record<AssetCategory, number> = { laptop: 0, phone: 0, monitor: 0, other: 0 };
    for (const a of assets) counts[a.category]++;
    return counts;
  }, [assets]);

  const summary = useMemo(() => {
    return {
      total: assets.length,
      inStock: assets.filter((a) => !a.assignedToUserId).length,
      assigned: assets.filter((a) => !!a.assignedToUserId).length,
      mine: assets.filter((a) => a.assignedToUserId === currentUserId).length,
    };
  }, [assets, currentUserId]);

  const selected = selectedId ? assets.find((a) => a.id === selectedId) ?? null : null;

  async function create(name: string, category: AssetCategory, serialNumber: string | null, notes: string | null) {
    setBusy("create");
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/v1/assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, category, serialNumber, notes }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not add asset");
        return false;
      }
      setInfo(`Added ${name}`);
      setCreating(false);
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function assign(id: string, email: string | null) {
    setBusy(id);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/v1/assets/${id}/assign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not update assignment");
        return false;
      }
      setInfo(email ? "Asset assigned" : "Asset returned to stock");
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
            placeholder="Search by name, serial, or notes..."
            aria-label="Search assets"
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
          {([
            ["all", "All"],
            ["in_stock", "In stock"],
            ["assigned_to_me", "My assets"],
          ] as Array<[ScopeFilter, string]>).map(([s, label]) => (
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
              {label}
              {s === "in_stock" && summary.inStock > 0 ? (
                <span
                  className={cx(
                    "ml-1 inline-block min-w-4 rounded-full px-1 text-[10px] tabular-nums",
                    scope === s ? "bg-brand-hover" : "bg-surface-subtle text-tertiary",
                  )}
                >
                  {summary.inStock}
                </span>
              ) : null}
              {s === "assigned_to_me" && summary.mine > 0 ? (
                <span
                  className={cx(
                    "ml-1 inline-block min-w-4 rounded-full px-1 text-[10px] tabular-nums",
                    scope === s ? "bg-brand-hover" : "bg-surface-subtle text-tertiary",
                  )}
                >
                  {summary.mine}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <select
          aria-label="Category"
          value={categoryFilter ?? ""}
          onChange={(e) => setCategoryFilter((e.target.value || null) as AssetCategory | null)}
          className="h-8 rounded-md border border-border-default bg-surface px-2 text-xs text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]} ({categoryCounts[c]})
            </option>
          ))}
        </select>

        {canManage ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-hover"
          >
            <Plus className="h-3.5 w-3.5" />
            Add asset
          </button>
        ) : null}
      </div>

      {/* One-line summary */}
      <p className="text-xs text-tertiary">
        {summary.total} asset{summary.total === 1 ? "" : "s"} ·{" "}
        {summary.inStock} in stock · {summary.assigned} assigned
        {summary.mine > 0 ? <> · {summary.mine} assigned to you</> : null}
        {q ? <> · {visible.length} match{visible.length === 1 ? "" : "es"} for &ldquo;{q}&rdquo;</> : null}
      </p>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      {info ? (
        <p role="status" className="inline-flex items-center gap-1 text-xs text-success">
          <PackageCheck className="h-3 w-3" />
          {info}
        </p>
      ) : null}

      {/* Results */}
      {visible.length === 0 ? (
        <AssetsEmpty
          scope={scope}
          q={q}
          hasAssets={assets.length > 0}
          canManage={canManage}
          onCreate={() => setCreating(true)}
        />
      ) : (
        <div className="space-y-8">
          {groups.inStock.length > 0 ? (
            <AssetSection
              title="In stock"
              subtitle="Available to assign"
              tone="brand"
              count={groups.inStock.length}
            >
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {groups.inStock.map((a) => (
                  <li key={a.id}>
                    <AssetCard
                      a={a}
                      onOpen={() => setSelectedId(a.id)}
                      onAssign={canManage ? assign : null}
                      busy={busy === a.id}
                    />
                  </li>
                ))}
              </ul>
            </AssetSection>
          ) : null}
          {groups.assigned.length > 0 ? (
            <AssetSection
              title="Assigned"
              subtitle="Currently held by a teammate"
              tone="success"
              count={groups.assigned.length}
            >
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {groups.assigned.map((a) => (
                  <li key={a.id}>
                    <AssetCard
                      a={a}
                      onOpen={() => setSelectedId(a.id)}
                      onAssign={canManage ? assign : null}
                      busy={busy === a.id}
                    />
                  </li>
                ))}
              </ul>
            </AssetSection>
          ) : null}
        </div>
      )}

      {/* Detail sheet */}
      {selected ? (
        <AssetDetail
          a={selected}
          canManage={canManage}
          isMine={selected.assignedToUserId === currentUserId}
          busy={busy === selected.id}
          onClose={() => setSelectedId(null)}
          onAssign={canManage ? assign : null}
        />
      ) : null}

      {/* Create drawer */}
      {creating ? (
        <NewAssetDrawer
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
function AssetSection({
  title,
  subtitle,
  tone,
  count,
  children,
}: {
  title: string;
  subtitle: string;
  tone: "brand" | "success";
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cx(
            "inline-block h-1.5 w-1.5 rounded-full",
            tone === "brand" ? "bg-brand" : "bg-success",
          )}
          aria-hidden
        />
        <h2 className="text-sm font-semibold text-primary">{title}</h2>
        <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-tertiary">
          {count}
        </span>
        <span className="text-xs text-tertiary">· {subtitle}</span>
      </div>
      {children}
    </section>
  );
}

function AssetCard({
  a,
  onOpen,
  onAssign,
  busy,
}: {
  a: AssetClientRow;
  onOpen: () => void;
  onAssign: ((id: string, email: string | null) => Promise<boolean>) | null;
  busy: boolean;
}) {
  const { Icon, tone, label } = categoryVisual(a.category);
  const assigned = !!a.assignedToUserId;
  const toneCls =
    tone === "brand"
      ? "bg-brand-subtle text-brand-text"
      : tone === "warning"
        ? "bg-warning-subtle text-warning"
        : tone === "success"
          ? "bg-success-subtle text-success"
          : "bg-surface-subtle text-secondary";
  return (
    <div
      className={cx(
        "flex h-full flex-col overflow-hidden rounded-lg border bg-surface transition",
        assigned ? "border-border-subtle" : "border-border-subtle",
        "hover:border-border-default hover:shadow-[0_4px_10px_rgba(16,24,40,0.06)]",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className={cx("flex h-20 items-center justify-center", toneCls)}
        aria-hidden
      >
        <Icon className="h-8 w-8" />
      </button>
      <div className="flex flex-1 flex-col gap-1.5 px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate text-xs font-semibold text-primary" title={a.name}>
            {a.name}
          </h3>
          {assigned ? (
            <Badge tone="success">Assigned</Badge>
          ) : (
            <Badge tone="neutral">In stock</Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-tertiary">
            {label}
          </span>
          {a.serialNumber ? (
            <span className="truncate text-[10px] text-tertiary" title={a.serialNumber}>
              S/N {a.serialNumber}
            </span>
          ) : null}
        </div>
        {assigned && a.assignedToName ? (
          <div className="mt-auto flex items-center gap-1.5 text-[10px] text-tertiary">
            <Avatar
              name={a.assignedToName}
              src={a.assignedToAvatar ?? undefined}
              className="!h-4 !w-4 text-[8px]"
            />
            <span className="truncate">{a.assignedToName}</span>
          </div>
        ) : (
          <p className="mt-auto text-[10px] text-tertiary">Available to assign</p>
        )}
        {onAssign ? (
          <div className="mt-1 flex items-center gap-1 border-t border-border-subtle pt-1.5">
            {assigned ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAssign(a.id, null);
                }}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-tertiary transition hover:bg-surface-hover hover:text-primary disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Undo2 className="h-2.5 w-2.5" />}
                Return to stock
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAssign(a.id, prompt(`Assign "${a.name}" to which email?`) || null);
                }}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-tertiary transition hover:bg-surface-hover hover:text-primary disabled:opacity-50"
              >
                <UserIcon className="h-2.5 w-2.5" />
                Assign
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AssetsEmpty({
  scope,
  q,
  hasAssets,
  canManage,
  onCreate,
}: {
  scope: ScopeFilter;
  q: string;
  hasAssets: boolean;
  canManage: boolean;
  onCreate: () => void;
}) {
  let title = "No assets yet";
  let hint = "Hardware inventory will appear here.";
  if (q) {
    title = "No assets match your search";
    hint = "Try a different search term or clear the filter.";
  } else if (scope === "in_stock") {
    title = "Nothing in stock right now";
    hint = "Every piece of equipment is currently assigned.";
  } else if (scope === "assigned_to_me") {
    title = "Nothing assigned to you yet";
    hint = "When your manager assigns hardware, it shows up here.";
  }
  return (
    <div className="rounded-lg border border-dashed border-border-default bg-surface px-6 py-10 text-center">
      <Inbox className="mx-auto h-6 w-6 text-tertiary" />
      <p className="mt-2 text-sm font-medium text-primary">{title}</p>
      <p className="mt-1 text-xs text-tertiary">{hint}</p>
      {canManage && !hasAssets && !q ? (
        <button
          type="button"
          onClick={onCreate}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          Add asset
        </button>
      ) : null}
    </div>
  );
}

function AssetDetail({
  a,
  canManage,
  isMine,
  busy,
  onClose,
  onAssign,
}: {
  a: AssetClientRow;
  canManage: boolean;
  isMine: boolean;
  busy: boolean;
  onClose: () => void;
  onAssign: ((id: string, email: string | null) => Promise<boolean>) | null;
}) {
  const [email, setEmail] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const { Icon, tone, label } = categoryVisual(a.category);
  const toneCls =
    tone === "brand"
      ? "bg-brand-subtle text-brand-text"
      : tone === "warning"
        ? "bg-warning-subtle text-warning"
        : tone === "success"
          ? "bg-success-subtle text-success"
          : "bg-surface-subtle text-secondary";

  async function apply() {
    if (!onAssign) return;
    setLocalError(null);
    const ok = await onAssign(a.id, email.trim() || null);
    if (ok) {
      setEmail("");
      onClose();
    } else {
      setLocalError("Could not update assignment");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal,50)] flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={a.name}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full w-full max-w-md flex-col bg-surface shadow-xl">
        <div className="flex items-start gap-3 border-b border-border-default px-5 py-3">
          <div
            className={cx(
              "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
              toneCls,
            )}
            aria-hidden
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
              {CATEGORY_PLURAL[a.category].slice(0, -1)} · Added {timeAgo(a.createdAt)}
            </p>
            <h2 className="truncate text-base font-semibold text-primary">{a.name}</h2>
            <div className="mt-1 flex items-center gap-1.5">
              {a.assignedToUserId ? (
                <Badge tone="success">Assigned</Badge>
              ) : (
                <Badge tone="neutral">In stock</Badge>
              )}
            </div>
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

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <Field label="Category">{label}</Field>
            <Field label="Serial number">{a.serialNumber || <span className="text-tertiary">—</span>}</Field>
            <Field label="Added">{new Date(a.createdAt).toLocaleString()}</Field>
            <Field label="Holder" className="col-span-2">
              {a.assignedToName ? (
                <span className="inline-flex items-center gap-1.5">
                  <Avatar
                    name={a.assignedToName}
                    src={a.assignedToAvatar ?? undefined}
                    className="!h-5 !w-5 text-[9px]"
                  />
                  {a.assignedToName}
                </span>
              ) : (
                <span className="text-tertiary">In stock</span>
              )}
            </Field>
            {a.notes ? (
              <Field label="Notes" className="col-span-2">
                <span className="whitespace-pre-wrap text-primary">{a.notes}</span>
              </Field>
            ) : null}
          </dl>

          {isMine ? (
            <div className="rounded-md border border-brand/30 bg-brand-subtle/30 p-3 text-[11px] text-brand-text">
              <p className="inline-flex items-center gap-1.5 font-semibold">
                <PackageCheck className="h-3.5 w-3.5" />
                This asset is assigned to you
              </p>
              <p className="mt-1 text-[11px] text-tertiary">
                Need to return it? Tell your manager and they&apos;ll mark it back to stock.
              </p>
            </div>
          ) : null}

          {canManage && onAssign ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void apply();
              }}
              className="space-y-2 rounded-md border border-border-subtle bg-surface-subtle/40 p-3"
            >
              <label className="block text-xs font-medium text-secondary">
                {a.assignedToUserId ? "Reassign to" : "Assign to"} (email)
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border-default bg-surface px-2.5 py-1.5 text-sm text-primary placeholder:text-tertiary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  placeholder="colleague@company.com"
                />
                <span className="mt-1 block text-[10px] text-tertiary">
                  Leave blank and press Apply to return to stock.
                </span>
              </label>
              {localError ? (
                <p role="alert" className="text-xs text-danger">
                  {localError}
                </p>
              ) : null}
              <div className="flex items-center justify-end gap-2">
                {a.assignedToUserId ? (
                  <button
                    type="button"
                    onClick={async () => {
                      setLocalError(null);
                      const ok = await onAssign(a.id, null);
                      if (ok) onClose();
                    }}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border-default bg-surface px-3 py-1.5 text-xs font-medium text-secondary transition hover:bg-surface-hover disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                    Return to stock
                  </button>
                ) : null}
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-hover disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserIcon className="h-3 w-3" />}
                  {email.trim() ? "Assign" : "Apply"}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <dt className="font-semibold uppercase tracking-wide text-[10px] text-tertiary">{label}</dt>
      <dd className="mt-0.5 text-primary">{children}</dd>
    </div>
  );
}

function NewAssetDrawer({
  busy,
  error,
  onCancel,
  onCreate,
}: {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onCreate: (name: string, category: AssetCategory, serialNumber: string | null, notes: string | null) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<AssetCategory>("laptop");
  const [serial, setSerial] = useState("");
  const [notes, setNotes] = useState("");

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
      aria-label="Add asset"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="flex h-full w-full max-w-md flex-col bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border-default px-5 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">New</p>
            <h2 className="text-base font-semibold text-primary">Add hardware</h2>
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
            const ok = await onCreate(
              name.trim(),
              category,
              serial.trim() || null,
              notes.trim() || null,
            );
            if (ok) {
              setName("");
              setSerial("");
              setNotes("");
              setCategory("laptop");
            }
          }}
        >
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <label className="block text-xs font-medium text-secondary">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                required
                minLength={2}
                maxLength={120}
                placeholder="MacBook Pro 14 (M3)"
                autoFocus
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-medium text-secondary">
                Category
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as AssetCategory)}
                  className="mt-1 w-full rounded-md border border-border-default bg-surface px-2.5 py-1.5 text-sm text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                >
                  <option value="laptop">Laptop</option>
                  <option value="phone">Phone</option>
                  <option value="monitor">Monitor</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="block text-xs font-medium text-secondary">
                Serial number
                <input
                  value={serial}
                  onChange={(e) => setSerial(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border-default bg-surface px-2.5 py-1.5 text-sm text-primary placeholder:text-tertiary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  maxLength={120}
                  placeholder="C02ABC123DE"
                />
              </label>
            </div>
            <label className="block text-xs font-medium text-secondary">
              Notes (optional)
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                maxLength={2000}
                rows={3}
                placeholder="Purchase date, condition, location..."
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
              disabled={busy || !name.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-hover disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Add asset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Unused-but-exported so the type is in the surface
export { MoreHorizontal };
