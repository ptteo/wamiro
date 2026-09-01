"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  History,
  ListFilter,
  LogIn,
  LogOut,
  PlayCircle,
  Users,
} from "lucide-react";

import { Avatar } from "./ui";
import { ClockInButton } from "./clock-button";
import { cx } from "@/lib/cx";

export interface MyAttendanceData {
  open: { id: string; clockIn: string } | null;
  todayMinutes: number;
  weekMinutes: number;
  daysWorkedThisWeek: number;
  week: { date: string; minutes: number; isToday: boolean; hasShift: boolean }[];
  history: {
    id: string;
    userId: string;
    userName: string;
    date: string;
    clockIn: string;
    clockOut: string | null;
    minutes: number | null;
  }[];
  teamNow: { userId: string; userName: string; clockIn: string; minutes: number }[];
  orgClockedInNow: number;
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type Range = "today" | "week" | "month" | "all";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDuration(min: number | null | undefined): string {
  if (min == null) return "—";
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
function fmtClockFor(min: number): string {
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function dateLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === yest.getTime()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export function AttendanceClient({
  data,
  progress,
}: {
  data: MyAttendanceData;
  /** 0..1, fraction of the way through a typical 8h workday. */
  progress: number;
}) {
  const router = useRouter();
  // Live-update the open-shift duration every minute
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Live open-shift duration (ms) — recomputed on every tick
  const openSinceMs = data.open
    ? Date.now() - new Date(data.open.clockIn).getTime()
    : 0;
  const openMinutes = Math.max(0, Math.round(openSinceMs / 60_000));
  void tick; // keep the dep referenced

  // Filter the history
  const [range, setRange] = useState<Range>("week");
  const filteredHistory = useMemo(() => {
    const now = new Date();
    let cutoff: Date | null = null;
    if (range === "today") {
      cutoff = new Date(now);
      cutoff.setHours(0, 0, 0, 0);
    } else if (range === "week") {
      const dow = now.getUTCDay();
      const offset = (dow + 6) % 7;
      cutoff = new Date(now);
      cutoff.setUTCDate(now.getUTCDate() - offset);
      cutoff.setUTCHours(0, 0, 0, 0);
    } else if (range === "month") {
      cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    }
    if (!cutoff) return data.history;
    return data.history.filter((r) => new Date(r.clockIn) >= cutoff!);
  }, [data.history, range]);

  // Group history by date for the list
  const grouped = useMemo(() => {
    const out = new Map<string, typeof data.history>();
    for (const r of filteredHistory) {
      const arr = out.get(r.date) ?? [];
      arr.push(r);
      out.set(r.date, arr);
    }
    return Array.from(out.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filteredHistory]);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <NowCard
          open={data.open}
          openMinutes={openMinutes}
          todayMinutes={data.todayMinutes}
          weekMinutes={data.weekMinutes}
          daysWorkedThisWeek={data.daysWorkedThisWeek}
          orgClockedInNow={data.orgClockedInNow}
          progress={progress}
        />
        <WeekStrip week={data.week} />
        <HistoryList
          range={range}
          onRangeChange={setRange}
          grouped={grouped}
        />
      </div>

      <aside className="space-y-5">
        <TeamPanel teamNow={data.teamNow} />
      </aside>
    </div>
  );
}

// ── Now card (the centerpiece) ────────────────────────────────────
function NowCard({
  open,
  openMinutes,
  todayMinutes,
  weekMinutes,
  daysWorkedThisWeek,
  orgClockedInNow,
  progress,
}: {
  open: { id: string; clockIn: string } | null;
  openMinutes: number;
  todayMinutes: number;
  weekMinutes: number;
  daysWorkedThisWeek: number;
  orgClockedInNow: number;
  progress: number;
}) {
  return (
    <section
      aria-label="Your status right now"
      className={cx(
        "overflow-hidden rounded-lg border bg-surface",
        open ? "border-success/30" : "border-border-subtle",
      )}
    >
      <div className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
        {/* Left: status + big clock in/out */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cx(
                "inline-flex h-2.5 w-2.5 rounded-full",
                open ? "bg-success" : "bg-tertiary",
              )}
              aria-hidden
            />
            <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
              {open ? "Clocked in" : "Clocked out"}
            </p>
          </div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-primary">
            {open
              ? `Working for ${fmtClockFor(openMinutes)}`
              : todayMinutes > 0
                ? `Clocked out · ${fmtClockFor(todayMinutes)} today`
                : "Not clocked in today"}
          </h2>
          {open ? (
            <p className="mt-0.5 text-xs text-tertiary">
              Since {fmtTime(open.clockIn)} · avg{" "}
              {(openMinutes / 60).toFixed(1)}h so far
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-tertiary">
              Click "Clock in" below when you start your shift.
            </p>
          )}
        </div>

        {/* Right: clock in/out button */}
        <div className="flex items-center gap-2 sm:flex-col sm:items-stretch">
          <ClockInButton openShift={open} />
        </div>
      </div>

      {/* Progress bar (today's hours toward 8h target) */}
      <div className="border-t border-border-subtle bg-surface-subtle/50 px-5 py-3">
        <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-tertiary">
          <span>Today</span>
          <span className="tabular-nums text-primary">
            {fmtClockFor(todayMinutes)} <span className="text-disabled">/ 8h</span>
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
          <div
            className={cx(
              "h-full rounded-full transition-all",
              open ? "bg-success" : "bg-brand",
            )}
            style={{ width: `${Math.max(2, Math.round(progress * 100))}%` }}
            aria-hidden
          />
        </div>

        {/* Week + org metrics */}
        <div className="mt-3 grid grid-cols-3 gap-3 text-center sm:text-left">
          <MiniStat label="This week" value={fmtClockFor(weekMinutes)} sub={`${daysWorkedThisWeek} day${daysWorkedThisWeek === 1 ? "" : "s"}`} />
          <MiniStat label="Org clocked in" value={String(orgClockedInNow)} sub="people working now" />
          <MiniStat label="Status" value={open ? "Active" : "Idle"} sub={open ? "Session running" : "No open shift"} />
        </div>
      </div>
    </section>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-primary">{value}</p>
      {sub ? <p className="text-[10px] text-tertiary">{sub}</p> : null}
    </div>
  );
}

// ── Week strip ────────────────────────────────────────────────────
function WeekStrip({
  week,
}: {
  week: { date: string; minutes: number; isToday: boolean; hasShift: boolean }[];
}) {
  const max = Math.max(8 * 60, ...week.map((d) => d.minutes));
  return (
    <section
      aria-label="This week"
      className="rounded-lg border border-border-subtle bg-surface p-4"
    >
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">This week</p>
        <p className="text-[10px] text-tertiary">Mon → Sun</p>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {week.map((d, i) => {
          const dow = DOW[i] ?? "";
          const dayNum = new Date(d.date + "T00:00:00").getDate();
          const heightPct = d.minutes > 0 ? Math.max(8, (d.minutes / max) * 100) : 0;
          return (
            <div
              key={d.date}
              className={cx(
                "flex flex-col items-stretch gap-1.5 rounded-md border p-1.5",
                d.isToday
                  ? "border-brand/40 bg-brand-subtle"
                  : "border-border-subtle bg-surface",
                !d.hasShift && "opacity-60",
              )}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-tertiary">
                  {dow}
                </span>
                {d.isToday ? (
                  <span className="rounded-full bg-brand px-1 text-[9px] font-bold uppercase text-on-brand">
                    Now
                  </span>
                ) : null}
              </div>
              <p className="text-sm font-semibold tabular-nums text-primary">{dayNum}</p>
              <div className="flex h-12 items-end">
                <div
                  className={cx(
                    "w-full rounded-t",
                    d.hasShift ? "bg-brand" : "bg-surface-subtle",
                  )}
                  style={{ height: `${heightPct}%`, minHeight: d.hasShift ? "4px" : 0 }}
                  aria-hidden
                />
              </div>
              <p className="text-center text-[10px] tabular-nums text-tertiary">
                {d.hasShift ? fmtClockFor(d.minutes) : "—"}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── History list (grouped by date) ───────────────────────────────
function HistoryList({
  range,
  onRangeChange,
  grouped,
}: {
  range: Range;
  onRangeChange: (r: Range) => void;
  grouped: [string, MyAttendanceData["history"]][];
}) {
  return (
    <section
      aria-label="My history"
      className="rounded-lg border border-border-subtle bg-surface"
    >
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
          My history
        </p>
        <div className="inline-flex rounded-md border border-border-subtle bg-surface p-0.5 text-[10px]">
          {(["today", "week", "month", "all"] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onRangeChange(r)}
              aria-pressed={range === r}
              className={cx(
                "rounded px-2 py-0.5 font-medium uppercase tracking-wide",
                range === r
                  ? "bg-brand text-on-brand"
                  : "text-tertiary hover:text-primary",
              )}
            >
              {r === "all" ? "All" : r}
            </button>
          ))}
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-tertiary">
          <History className="mx-auto h-6 w-6 text-tertiary" />
          <p className="mt-2">No records in this range yet.</p>
        </div>
      ) : (
        <ol className="divide-y divide-border-subtle">
          {grouped.map(([date, rows]) => (
            <li key={date} className="px-4 py-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
                {dateLabel(date)}
              </p>
              <ul className="space-y-1">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-surface-hover"
                  >
                    <Avatar
                      name={r.userName}
                      className="!h-7 !w-7 text-[10px] ring-1 ring-border-subtle"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-primary">{r.userName}</p>
                      <p className="text-[10px] tabular-nums text-tertiary">
                        {fmtTime(r.clockIn)}
                        {r.clockOut ? ` → ${fmtTime(r.clockOut)}` : " · still running"}
                      </p>
                    </div>
                    <span
                      className={cx(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums",
                        r.clockOut
                          ? "bg-surface-subtle text-secondary"
                          : "bg-success-subtle text-success",
                      )}
                    >
                      {fmtDuration(r.minutes)}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ── Team panel ──────────────────────────────────────────────────
function TeamPanel({
  teamNow,
}: {
  teamNow: { userId: string; userName: string; clockIn: string; minutes: number }[];
}) {
  return (
    <section
      aria-label="Team now"
      className="rounded-lg border border-border-subtle bg-surface"
    >
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
          Your team right now
        </p>
        <span className="rounded-full bg-success-subtle px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-success">
          {teamNow.length} active
        </span>
      </div>
      {teamNow.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-tertiary">
          <Users className="mx-auto h-6 w-6 text-tertiary" />
          <p className="mt-2">No direct reports are clocked in right now.</p>
          <p className="mt-0.5">This panel only shows your direct reports.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {teamNow.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="relative">
                <Avatar
                  name={m.userName}
                  className="!h-7 !w-7 text-[10px] ring-1 ring-border-subtle"
                />
                <span className="absolute -bottom-0.5 -right-0.5 inline-block h-2 w-2 rounded-full bg-success ring-2 ring-surface" />
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/people/${m.userId}`}
                  className="truncate font-medium text-primary hover:underline"
                >
                  {m.userName}
                </Link>
                <p className="text-[10px] tabular-nums text-tertiary">
                  Since {fmtTime(m.clockIn)} · {fmtClockFor(m.minutes)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Re-export the helper in case we need it
export { fmtDuration as _fmtDuration };