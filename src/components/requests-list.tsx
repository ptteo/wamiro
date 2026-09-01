"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Inbox,
  Plus,
  Search,
  X,
} from "lucide-react";

import type { RequestTypeField } from "@/db/schema";
import { Avatar, Badge, btn, input as inputCls } from "./ui";
import { cx } from "@/lib/cx";

// ── Types ───────────────────────────────────────────────────────
export interface RequestTypeClient {
  id: string;
  name: string;
  description: string | null;
  fields: RequestTypeField[];
}

export interface RequestRow {
  id: string;
  typeId: string;
  typeName: string;
  payload: Record<string, string | number | null>;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  createdAt: string; // ISO
  slaDueAt: string | null; // ISO
  escalatedAt: string | null; // ISO
  currentStep: number;
  totalSteps: number;
  /** Whether the viewer is the requester (controls "Withdraw"). */
  mine: boolean;
  /** When status==approved/rejected, the reviewer name (if joined server-side). */
  reviewerName: string | null;
  /** When status==approved/rejected, the reviewed-at timestamp. */
  reviewedAt: string | null;
}

const STATUS_LABEL: Record<RequestRow["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_TONE: Record<RequestRow["status"], "neutral" | "success" | "tertiary"> = {
  pending: "neutral",
  approved: "success",
  rejected: "tertiary",
};

// ── Helpers ─────────────────────────────────────────────────────
function formatPayload(
  payload: Record<string, string | number | null>,
  fields: RequestTypeField[] = [],
): { label: string; value: string }[] {
  const labelByKey = new Map(fields.map((f) => [f.key, f.label] as const));
  return Object.entries(payload)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => ({
      label: labelByKey.get(k) ?? k.replace(/_/g, " "),
      value: String(v),
    }));
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
  return new Date(iso).toLocaleDateString();
}

function slaState(slaDueAt: string | null, status: RequestRow["status"], escalatedAt: string | null) {
  if (status !== "pending" || !slaDueAt) return null;
  const ms = new Date(slaDueAt).getTime() - Date.now();
  const overdue = ms < 0;
  const dueInHrs = Math.round(ms / 3_600_000);
  if (overdue) {
    const days = Math.abs(Math.round(ms / 86_400_000));
    return {
      label: escalatedAt
        ? `SLA breached · escalated · ${days}d overdue`
        : `SLA breached · ${days}d overdue`,
      tone: "danger" as const,
      isStale: true,
    };
  }
  if (dueInHrs <= 24) {
    return { label: `Due in ${dueInHrs}h`, tone: "warning" as const, isStale: false };
  }
  const days = Math.round(dueInHrs / 24);
  return { label: `Due in ${days}d`, tone: "muted" as const, isStale: false };
}

// ── Component ───────────────────────────────────────────────────
export function RequestsListClient({
  types,
  mine,
  hasApprovalsPermission = false,
}: {
  types: RequestTypeClient[];
  mine: RequestRow[];
  hasApprovalsPermission?: boolean;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<"all" | "open" | "approved" | "rejected">("all");
  const [q, setQ] = useState("");
  const [drawerTypeId, setDrawerTypeId] = useState<string | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  // Debounce search into URL
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (scope !== "all") params.set("s", scope);
      const qs = params.toString();
      router.replace(qs ? `/requests?${qs}` : "/requests", { scroll: false });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, scope]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return mine.filter((r) => {
      if (scope === "open" && r.status !== "pending") return false;
      if (scope === "approved" && r.status !== "approved") return false;
      if (scope === "rejected" && r.status !== "rejected") return false;
      if (needle) {
        if (
          !r.typeName.toLowerCase().includes(needle) &&
          !Object.values(r.payload).some((v) =>
            String(v ?? "").toLowerCase().includes(needle),
          )
        ) {
          return false;
        }
      }
      return true;
    });
  }, [mine, q, scope]);

  const summary = useMemo(() => {
    return {
      total: mine.length,
      open: mine.filter((r) => r.status === "pending").length,
      approved: mine.filter((r) => r.status === "approved").length,
      rejected: mine.filter((r) => r.status === "rejected").length,
    };
  }, [mine]);

  // Group by status
  const groups = useMemo(() => {
    const open = visible.filter((r) => r.status === "pending");
    const approved = visible.filter((r) => r.status === "approved");
    const rejected = visible.filter((r) => r.status === "rejected");
    return { open, approved, rejected };
  }, [visible]);

  async function withdraw(id: string) {
    if (withdrawingId) return;
    setWithdrawingId(id);
    try {
      const res = await fetch(`/api/v1/requests/${id}/withdraw`, { method: "POST" });
      if (!res.ok && res.status !== 404) {
        const d = (await res.json()) as { error?: { message?: string } };
        alert(d.error?.message ?? "Could not withdraw request");
        return;
      }
      router.refresh();
    } finally {
      setWithdrawingId(null);
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
            placeholder="Search requests..."
            aria-label="Search requests"
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
            ["open", "Open"],
            ["approved", "Approved"],
            ["rejected", "Rejected"],
          ] as Array<[typeof scope, string]>).map(([s, label]) => (
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
              {s === "open" && summary.open > 0 ? (
                <span className="ml-1 inline-block min-w-4 rounded-full bg-brand-hover px-1 text-[10px] tabular-nums">
                  {summary.open}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {hasApprovalsPermission ? (
            <Link
              href="/approvals"
              className="inline-flex items-center gap-1.5 rounded-md border border-border-default bg-surface px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-surface-hover"
            >
              <Inbox className="h-3.5 w-3.5" />
              Approvals
            </Link>
          ) : null}
          {types.length > 0 ? (
            <button
              type="button"
              onClick={() => setDrawerTypeId(types[0]?.id ?? null)}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-hover"
            >
              <Plus className="h-3.5 w-3.5" />
              New request
            </button>
          ) : null}
        </div>
      </div>

      {/* One-line summary */}
      <p className="text-xs text-tertiary">
        {summary.total} total · {summary.open} open · {summary.approved} approved ·{" "}
        {summary.rejected} rejected
        {q ? <> · {visible.length} match{visible.length === 1 ? "" : "es"} for &ldquo;{q}&rdquo;</> : null}
      </p>

      {types.length === 0 ? (
        <NoTypesCard />
      ) : null}

      {/* Results */}
      {visible.length === 0 ? (
        <RequestsEmpty
          scope={scope}
          q={q}
          hasTypes={types.length > 0}
          onCreate={() => setDrawerTypeId(types[0]?.id ?? null)}
        />
      ) : (
        <div className="space-y-8">
          {groups.open.length > 0 ? (
            <GroupSection
              title="Open"
              subtitle="Awaiting decision"
              tone="brand"
              count={groups.open.length}
            >
              <ul className="space-y-3">
                {groups.open.map((r) => (
                  <RequestCard
                    key={r.id}
                    request={r}
                    fieldsByType={fieldsMap(types)}
                    onWithdraw={withdraw}
                    withdrawing={withdrawingId === r.id}
                  />
                ))}
              </ul>
            </GroupSection>
          ) : null}
          {groups.approved.length > 0 ? (
            <GroupSection
              title="Approved"
              subtitle="Closed out — fulfilled"
              tone="success"
              count={groups.approved.length}
            >
              <ul className="space-y-3">
                {groups.approved.map((r) => (
                  <RequestCard
                    key={r.id}
                    request={r}
                    fieldsByType={fieldsMap(types)}
                  />
                ))}
              </ul>
            </GroupSection>
          ) : null}
          {groups.rejected.length > 0 ? (
            <GroupSection
              title="Rejected"
              subtitle="Not approved"
              tone="danger"
              count={groups.rejected.length}
            >
              <ul className="space-y-3">
                {groups.rejected.map((r) => (
                  <RequestCard
                    key={r.id}
                    request={r}
                    fieldsByType={fieldsMap(types)}
                  />
                ))}
              </ul>
            </GroupSection>
          ) : null}
        </div>
      )}

      {drawerTypeId ? (
        <NewRequestDrawer
          types={types}
          initialTypeId={drawerTypeId}
          onClose={() => setDrawerTypeId(null)}
          onChangeType={setDrawerTypeId}
        />
      ) : null}
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────
function fieldsMap(types: RequestTypeClient[]): Map<string, RequestTypeField[]> {
  const m = new Map<string, RequestTypeField[]>();
  for (const t of types) m.set(t.id, t.fields);
  return m;
}

function GroupSection({
  title,
  subtitle,
  tone,
  count,
  children,
}: {
  title: string;
  subtitle: string;
  tone: "brand" | "success" | "danger";
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cx(
            "inline-block h-1.5 w-1.5 rounded-full",
            tone === "brand" && "bg-brand",
            tone === "success" && "bg-success",
            tone === "danger" && "bg-danger",
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

function RequestCard({
  request: r,
  fieldsByType,
  onWithdraw,
  withdrawing,
}: {
  request: RequestRow;
  fieldsByType: Map<string, RequestTypeField[]>;
  onWithdraw?: (id: string) => void;
  withdrawing?: boolean;
}) {
  const fields = fieldsByType.get(r.typeId) ?? [];
  const formatted = formatPayload(r.payload, fields);
  const sla = slaState(r.slaDueAt, r.status, r.escalatedAt);
  const overdue = sla?.isStale ?? false;
  return (
    <li
      className={cx(
        "rounded-lg border bg-surface transition",
        overdue
          ? "border-danger/40 hover:border-danger/60"
          : "border-border-subtle hover:border-border-default",
        "hover:shadow-[0_4px_10px_rgba(16,24,40,0.06)]",
      )}
    >
      <div className="flex items-start gap-3 px-4 pt-4">
        <div
          className={cx(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
            r.status === "approved"
              ? "bg-success-subtle text-success"
              : r.status === "rejected"
                ? "bg-danger-subtle text-danger"
                : "bg-brand-subtle text-brand-text",
          )}
          aria-hidden
        >
          {r.status === "approved" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : r.status === "rejected" ? (
            <X className="h-4 w-4" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="truncate text-sm font-semibold text-primary">{r.typeName}</h3>
            <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
            {r.status === "pending" && r.totalSteps > 1 ? (
              <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-tertiary">
                Step {r.currentStep + 1}/{r.totalSteps}
              </span>
            ) : null}
          </div>
          {formatted.length > 0 ? (
            <ul className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-secondary">
              {formatted.slice(0, 3).map((f) => (
                <li key={f.label} className="truncate">
                  <span className="text-tertiary">{f.label}:</span>{" "}
                  <span className="font-medium text-primary">{truncate(f.value, 60)}</span>
                </li>
              ))}
              {formatted.length > 3 ? (
                <li className="text-tertiary">+{formatted.length - 3} more</li>
              ) : null}
            </ul>
          ) : null}
          {r.reviewNote ? (
            <p className="mt-1 text-[11px] text-tertiary">
              <span className="font-medium text-secondary">Note:</span> {r.reviewNote}
            </p>
          ) : null}
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
          <span title={r.createdAt}>Submitted {timeAgo(r.createdAt)}</span>
          {r.reviewedAt && r.reviewerName ? (
            <span className="inline-flex items-center gap-1">
              <Avatar name={r.reviewerName} className="!h-4 !w-4 text-[8px]" />
              by {r.reviewerName}
            </span>
          ) : null}
        </div>
      </div>
      {/* Action footer for pending requests */}
      {r.mine && r.status === "pending" && onWithdraw ? (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border-subtle bg-surface-subtle/50 px-4 py-2 text-[11px] text-tertiary">
          <span>You submitted this — you can withdraw while it&apos;s pending.</span>
          <button
            type="button"
            onClick={() => onWithdraw(r.id)}
            disabled={withdrawing}
            className="rounded-md border border-border-default bg-surface px-2.5 py-1 text-xs font-medium text-secondary transition hover:bg-danger-subtle hover:text-danger disabled:opacity-50"
          >
            {withdrawing ? "Withdrawing…" : "Withdraw"}
          </button>
        </div>
      ) : null}
    </li>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function NoTypesCard() {
  return (
    <div className="rounded-lg border border-dashed border-border-default bg-surface px-6 py-8 text-center">
      <FileText className="mx-auto h-6 w-6 text-tertiary" />
      <p className="mt-2 text-sm font-medium text-primary">No request types configured yet</p>
      <p className="mt-1 text-xs text-tertiary">
        An administrator can add request types to let your team start submitting.
      </p>
    </div>
  );
}

function RequestsEmpty({
  scope,
  q,
  hasTypes,
  onCreate,
}: {
  scope: "all" | "open" | "approved" | "rejected";
  q: string;
  hasTypes: boolean;
  onCreate: () => void;
}) {
  let title = "No requests yet";
  let hint = "Submit your first request to get started.";
  if (q) {
    title = "No requests match your search";
    hint = "Try a different search term or clear the filter.";
  } else if (scope === "open") {
    title = "Nothing open right now";
    hint = "All your requests are closed out.";
  } else if (scope === "approved") {
    title = "No approved requests yet";
    hint = "Approved requests show up here.";
  } else if (scope === "rejected") {
    title = "No rejected requests";
    hint = "Good news — nothing's been turned down.";
  }
  return (
    <div className="rounded-lg border border-dashed border-border-default bg-surface px-6 py-10 text-center">
      <Inbox className="mx-auto h-6 w-6 text-tertiary" />
      <p className="mt-2 text-sm font-medium text-primary">{title}</p>
      <p className="mt-1 text-xs text-tertiary">{hint}</p>
      {hasTypes && !q ? (
        <button
          type="button"
          onClick={onCreate}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          New request
        </button>
      ) : null}
    </div>
  );
}

function NewRequestDrawer({
  types,
  initialTypeId,
  onClose,
  onChangeType,
}: {
  types: RequestTypeClient[];
  initialTypeId: string;
  onClose: () => void;
  onChangeType: (id: string) => void;
}) {
  const router = useRouter();
  const [typeId, setTypeId] = useState(initialTypeId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const selected = types.find((t) => t.id === typeId) ?? types[0];

  // ESC closes
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, busy]);

  // Lock body scroll
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
      aria-label="New request"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="flex h-full w-full max-w-md flex-col bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border-default px-5 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">New</p>
            <h2 className="text-base font-semibold text-primary">Submit a request</h2>
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

        {done ? (
          <SuccessState
            typeName={selected?.name ?? "request"}
            onAnother={() => {
              setDone(false);
              (document.getElementById("request-form") as HTMLFormElement | null)?.reset();
            }}
            onClose={() => {
              onClose();
              router.refresh();
            }}
          />
        ) : (
          <form
            id="request-form"
            className="flex flex-1 flex-col overflow-hidden"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!selected) return;
              setBusy(true);
              setError(null);
              const f = new FormData(e.currentTarget);
              const payload: Record<string, string> = {};
              for (const field of selected.fields) {
                payload[field.key] = String(f.get(field.key) ?? "");
              }
              try {
                const res = await fetch("/api/v1/requests", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ typeId, payload }),
                });
                if (!res.ok) {
                  const d = (await res.json()) as { error?: { message?: string } };
                  setError(d.error?.message ?? "Could not submit request");
                  return;
                }
                setDone(true);
                router.refresh();
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {/* Type chips */}
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
                  Request type
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {types.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTypeId(t.id);
                        onChangeType(t.id);
                      }}
                      className={cx(
                        "rounded-full px-3 py-1 text-xs font-medium transition",
                        t.id === typeId
                          ? "bg-brand text-on-brand"
                          : "bg-surface-subtle text-secondary hover:bg-surface-hover",
                      )}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
                {selected?.description ? (
                  <p className="mt-2 text-xs text-tertiary">{selected.description}</p>
                ) : null}
              </div>

              {/* Dynamic fields */}
              {selected?.fields.map((field) => (
                <div key={field.key}>
                  <label className="text-xs font-medium text-secondary">
                    {field.label}
                    {field.required ? <span className="ml-0.5 text-danger">*</span> : null}
                  </label>
                  <div className="mt-1">
                    <FieldInput name={field.key} field={field} />
                  </div>
                </div>
              ))}

              {error ? (
                <p role="alert" className="text-xs text-danger">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border-default bg-surface px-5 py-3">
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
                disabled={busy || !selected}
                className={btn.primary}
              >
                {busy ? "Submitting…" : (
                  <>
                    Submit
                    <ChevronRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function FieldInput({ name, field }: { name: string; field: RequestTypeField }) {
  const cls = `${inputCls} mt-1`;
  switch (field.type) {
    case "textarea":
      return (
        <textarea
          name={name}
          className={`${cls} min-h-24`}
          required={field.required}
          maxLength={5000}
          placeholder={field.required ? "Required" : "Optional"}
        />
      );
    case "number":
      return (
        <input
          type="number"
          step="any"
          name={name}
          className={cls}
          required={field.required}
        />
      );
    case "date":
      return <input type="date" name={name} className={cls} required={field.required} />;
    case "select":
      return (
        <select name={name} className={cls} required={field.required} defaultValue="">
          <option value="" disabled>
            Choose…
          </option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    default:
      return (
        <input
          name={name}
          className={cls}
          required={field.required}
          maxLength={2000}
          placeholder={field.required ? "Required" : "Optional"}
        />
      );
  }
}

function SuccessState({
  typeName,
  onAnother,
  onClose,
}: {
  typeName: string;
  onAnother: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-5 py-8 text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-success-subtle text-success">
        <CheckCircle2 className="h-6 w-6" />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-primary">Submitted for review</h3>
      <p className="mt-1 text-xs text-tertiary">
        Your <span className="font-medium text-primary">{typeName}</span> is in the queue. You&apos;ll be
        notified when there&apos;s a decision.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={onAnother}
          className="rounded-md border border-border-default bg-surface px-3 py-1.5 text-xs font-medium text-secondary transition hover:bg-surface-hover"
        >
          Submit another
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
