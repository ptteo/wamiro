"use client";
/* eslint-disable react/no-unescaped-entities */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CircleAlert,
  History,
  PlaneTakeoff,
} from "lucide-react";

import { ApplyLeaveForm, ForceCancelButton, LeaveSelfActions, ReviewButtons } from "./leave-forms";
import { Avatar, Badge, EmptyState, btn } from "./ui";
import { cx } from "@/lib/cx";
import { type TeamOutRow, type TeamWeek } from "@/modules/leave/dates";

export interface LeaveData {
  balances: {
    leaveTypeId: string;
    name: string;
    annualQuotaDays: number;
    paid: boolean;
    entitledDays: number;
    usedDays: number;
  }[];
  requests: {
    id: string;
    typeName: string;
    startDate: string;
    endDate: string;
    days: number;
    rangeLabel?: string;
    status: string;
    reason: string | null;
    reviewNote: string | null;
    createdAt: string;
  }[];
  types: { id: string; name: string }[];
  approvals: {
    id: string;
    userId: string;
    userName: string;
    jobTitle: string | null;
    departmentName: string | null;
    typeName: string;
    startDate: string;
    endDate: string;
    days: number;
    rangeLabel?: string;
    reason: string | null;
    kind: "apply" | "cancel";
  }[];
  teamOut?: Omit<TeamOutRow, "rangeLabel">[];
  teamWeeks?: TeamWeek[];
}

type StatusFilter = "all" | "pending" | "approved" | "rejected" | "cancelled";

const STATUS_TONES: Record<string, "neutral" | "amber" | "green" | "red" | "brand"> = {
  draft: "neutral",
  pending: "amber",
  approved: "green",
  rejected: "red",
  cancelled: "neutral",
  cancel_requested: "amber",
};

const EMPTY_TRIPS: LeaveData["teamOut"] = [];

function balanceTone(remaining: number, entitled: number): "green" | "amber" | "red" {
  if (entitled <= 0) return "amber";
  const pct = remaining / entitled;
  if (pct < 0.1) return "red";
  if (pct < 0.3) return "amber";
  return "green";
}

export function LeaveClient({
  data,
  todayIso,
  canApply,
  canApprove,
}: {
  data: LeaveData;
  todayIso: string;
  canApply: boolean;
  canApprove: boolean;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [calendarReady, setCalendarReady] = useState(false);
  useEffect(() => {
    setCalendarReady(true);
  }, []);

  const filteredRequests = useMemo(() => {
    if (statusFilter === "all") return data.requests;
    if (statusFilter === "pending") {
      return data.requests.filter((r) => r.status === "pending" || r.status === "cancel_requested");
    }
    return data.requests.filter((r) => r.status === statusFilter);
  }, [data.requests, statusFilter]);

  // Group requests by year for the timeline
  const groupedByYear = useMemo(() => {
    const map = new Map<string, typeof data.requests>();
    for (const r of filteredRequests) {
      const y = r.startDate.slice(0, 4);
      const arr = map.get(y) ?? [];
      arr.push(r);
      map.set(y, arr);
    }
    return Array.from(map.entries()).sort((a, b) => Number(b[0]) - Number(a[0]));
  }, [filteredRequests]);

  const teamOut = Array.isArray(data.teamOut) ? data.teamOut : EMPTY_TRIPS;
  const teamWeeks = Array.isArray(data.teamWeeks) ? data.teamWeeks : [];
  const tripCount = teamOut.length || teamWeeks.reduce((n, w) => n + w.rows.length, 0);

  return (
    <div className="space-y-6">
      {/* Approvals queue (when present) */}
      {data.approvals.length > 0 ? (
        <ApprovalsQueue items={data.approvals} />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        {/* LEFT: balances + apply form + my requests */}
        <div className="space-y-6">
          {/* Balances hero */}
          {data.balances.length > 0 ? (
            <section aria-label="Your balances" className="grid gap-3 sm:grid-cols-2">
              {data.balances.map((b) => {
                const remaining = b.entitledDays - b.usedDays;
                const tone = balanceTone(remaining, b.entitledDays);
                const pct = b.entitledDays > 0 ? Math.min(1, b.usedDays / b.entitledDays) : 0;
                return (
                  <article
                    key={b.leaveTypeId}
                    className="overflow-hidden rounded-lg border border-border-subtle bg-surface p-4"
                  >
                    <div className="flex items-baseline justify-between">
                      <h3 className="text-sm font-semibold text-primary">{b.name}</h3>
                      {!b.paid ? (
                        <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-tertiary">
                          Unpaid
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-3xl font-semibold tabular-nums text-primary">
                      {remaining}
                      <span className="ml-1 text-sm font-normal text-tertiary">
                        of {b.entitledDays} day{b.entitledDays === 1 ? "" : "s"}
                      </span>
                    </p>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
                      <div
                        className={cx(
                          "h-full rounded-full",
                          tone === "green" && "bg-success",
                          tone === "amber" && "bg-warning",
                          tone === "red" && "bg-danger",
                        )}
                        style={{ width: `${Math.max(2, Math.round(pct * 100))}%` }}
                        aria-hidden
                      />
                    </div>
                    <p className="mt-1.5 text-[10px] uppercase tracking-wide text-tertiary">
                      {b.usedDays} day{b.usedDays === 1 ? "" : "s"} used this year
                    </p>
                  </article>
                );
              })}
            </section>
          ) : null}

          {/* Apply form */}
          {!(canApply && data.types.length > 0) ? <div data-tour="leave-apply" className="sr-only" /> : null}
          {canApply && data.types.length > 0 ? (
            <section
              id="leave-apply"
              data-tour="leave-apply"
              aria-label="Apply for leave"
              className="rounded-lg border border-border-subtle bg-surface"
            >
              <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
                  Apply for leave
                </p>
                <span className="rounded-full bg-brand-subtle px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-text">
                  New request
                </span>
              </div>
              <ApplyLeaveForm types={data.types} />
            </section>
          ) : null}

          {/* My requests timeline */}
          <section
            aria-label="My requests"
            className="rounded-lg border border-border-subtle bg-surface"
          >
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
                {'My requests'}
              </p>
              <div className="inline-flex rounded-md border border-border-subtle bg-surface p-0.5 text-[10px]">
                {(["all", "pending", "approved", "rejected", "cancelled"] as StatusFilter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setStatusFilter(f)}
                    aria-pressed={statusFilter === f}
                    className={cx(
                      "rounded px-2 py-0.5 font-medium uppercase tracking-wide",
                      statusFilter === f
                        ? "bg-brand text-on-brand"
                        : "text-tertiary hover:text-primary",
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            {filteredRequests.length === 0 ? (
              <EmptyState
                title={data.requests.length === 0 ? "No leave requests yet" : "No requests match this filter"}
                hint={
                  data.requests.length === 0
                    ? "Apply for leave when you need time off. Your manager reviews it."
                    : "Try another status filter."
                }
                icon={<History className="h-5 w-5" />}
                action={
                  canApply && data.types.length > 0 && data.requests.length === 0 ? (
                    <a href="#leave-apply" className={`${btn.primary} ${btn.small} mt-3`}>
                      Apply leave
                    </a>
                  ) : undefined
                }
              />
            ) : (
              <ol>
                {groupedByYear.map(([year, rows]) => (
                  <li key={year}>
                    <p className="border-b border-border-subtle bg-surface-subtle/40 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
                      {year}
                    </p>
                    <ul className="divide-y divide-border-subtle">
                      {rows.map((r) => (
                        <li key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                          <span
                            className={cx(
                              "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                              STATUS_TONES[r.status] === "green" && "bg-success",
                              STATUS_TONES[r.status] === "amber" && "bg-warning",
                              STATUS_TONES[r.status] === "red" && "bg-danger",
                              STATUS_TONES[r.status] === "neutral" && "bg-tertiary",
                              STATUS_TONES[r.status] === "brand" && "bg-brand",
                            )}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-primary">
                              {r.typeName}
                            </p>
                            <p className="text-[11px] text-tertiary tabular-nums">
                              {r.rangeLabel ?? `${r.startDate}–${r.endDate}`} · {r.days}d
                              {r.reason ? ` · ${r.reason}` : ""}
                            </p>
                            {r.reviewNote ? (
                              <p className="mt-0.5 text-[11px] italic text-tertiary">
                                Note: {r.reviewNote}
                              </p>
                            ) : null}
                          </div>
                          <Badge tone={STATUS_TONES[r.status] ?? "neutral"}>
                            {r.status.replace("_", " ")}
                          </Badge>
                          {canApply ? (
                            <LeaveSelfActions
                              requestId={r.id}
                              status={r.status}
                              endDate={r.endDate}
                              today={todayIso}
                            />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* RIGHT: team calendar + approve info */}
        <aside className="space-y-5">
          <section
            aria-label="Team calendar"
            className="rounded-lg border border-border-subtle bg-surface"
          >
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
                Team out · next 8 weeks
              </p>
              <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-tertiary">
                {tripCount} trip{tripCount === 1 ? "" : "s"}
              </span>
            </div>
            {!calendarReady ? (
              <div className="h-16" aria-hidden />
            ) : teamWeeks.length === 0 ? (
              <div className="p-6 text-center">
                <PlaneTakeoff className="mx-auto h-6 w-6 text-tertiary" />
                <p className="mt-2 text-sm font-medium text-primary">No one is out soon</p>
                <p className="mt-1 text-xs text-tertiary">Approved leave for the next 8 weeks will show up here.</p>
              </div>
            ) : (
              <ol>
                {teamWeeks.map((week) => (
                  <li key={week.mondayIso} className="border-b border-border-subtle px-4 py-2.5 last:border-b-0">
                    <div className="flex items-baseline justify-between">
                      <p
                        className={cx(
                          "text-[10px] font-semibold uppercase tracking-wide",
                          week.current ? "text-brand-text" : "text-tertiary",
                        )}
                      >
                        {week.label}
                      </p>
                      {week.current ? (
                        <span className="rounded-full bg-brand-subtle px-1.5 py-0.5 text-[10px] font-medium text-brand-text">
                          This week
                        </span>
                      ) : null}
                    </div>
                    <ul className="mt-1 space-y-1">
                      {week.rows.map((r) => (
                        <li key={r.id} className="flex items-center gap-2 text-xs">
                          <Avatar
                            name={r.userName}
                            className="!h-5 !w-5 text-[9px] ring-1 ring-border-subtle"
                          />
                          <Link
                            href={`/people/${r.userId}`}
                            className="truncate text-primary hover:underline"
                          >
                            {r.userName}
                          </Link>
                          <span className="text-tertiary">·</span>
                          <span className="truncate text-tertiary">
                            {r.typeName} · {r.rangeLabel}
                          </span>
                          {canApprove ? <ForceCancelButton requestId={r.id} /> : null}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

// ── Approvals queue (separate component so it can be moved/styled) ──
function ApprovalsQueue({
  items,
}: {
  items: LeaveData["approvals"];
}) {
  return (
    <section
      aria-label="Approvals queue"
      className="overflow-hidden rounded-lg border border-warning/30 bg-warning-subtle/20"
    >
      <div className="flex items-center justify-between border-b border-warning/30 bg-warning-subtle/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <CircleAlert className="h-4 w-4 text-warning" aria-hidden />
          <p className="text-xs font-semibold text-primary">
            Awaiting your approval
            <span className="ml-2 rounded-full bg-warning px-1.5 py-0.5 text-[10px] font-bold text-on-brand tabular-nums">
              {items.length}
            </span>
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-tertiary">
          Soonest first
        </span>
      </div>
      <ol className="divide-y divide-warning/20">
        {items.map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-center gap-3 px-4 py-3"
          >
            <Avatar
              name={a.userName}
              className="!h-8 !w-8 text-[10px] ring-1 ring-border-subtle"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-primary">
                {a.kind === "cancel" ? (
                  <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-warning">
                    Cancel
                  </span>
                ) : null}
                {a.userName}
                {a.departmentName ? (
                  <span className="ml-1 text-xs font-normal text-tertiary">
                    · {a.departmentName}
                  </span>
                ) : null}
              </p>
              <p className="text-[11px] text-tertiary tabular-nums">
                {a.kind === "cancel" ? "Cancel request · " : ""}
                {a.typeName} · {a.rangeLabel ?? `${a.startDate}–${a.endDate}`} · {a.days}d
                {a.reason ? ` · ${a.reason}` : ""}
              </p>
            </div>
            <ReviewButtons requestId={a.id} kind={a.kind} />
          </li>
        ))}
      </ol>
    </section>
  );
}