"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar as CalIcon,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  List,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { Avatar, Badge, Card, CardHeader } from "./ui";
import { cx } from "@/lib/cx";

export interface CalendarHoliday {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
}

export interface CalendarLeaveRow {
  id?: string;
  userId?: string;
  userName: string;
  startDate: string;
  endDate: string;
  isSelf: boolean;
}

export interface CalendarDayEvent {
  date: string; // YYYY-MM-DD
  holiday: CalendarHoliday | null;
  /** Approved leave overlapping this day, ordered: self-first, then by name. */
  people: CalendarLeaveRow[];
}

export interface CalendarMonthData {
  year: number;
  month: number; // 1-12
  monthLabel: string;
  days: CalendarDayEvent[];
  leadBlanks: number;
  canManageHolidays: boolean;
  /** Holidays in this calendar year, ordered chronologically. */
  yearHolidays: CalendarHoliday[];
  /** Viewer's own approved leave in this month (denormalized for the rail). */
  myLeave: CalendarLeaveRow[];
  /** Team-out next 8 weeks (already computed server-side). */
  teamOutNext: { date: string; people: string[] }[];
  /** ISO date string of today. */
  todayIso: string;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

type ViewMode = "month" | "list";
type FilterKey = "holidays" | "team" | "me";

const FILTER_LABEL: Record<FilterKey, string> = {
  holidays: "Holidays",
  team: "Team out",
  me: "My time off",
};

function monthName(m: number): string {
  return [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ][m - 1] ?? "";
}

function fmtMonthYear(year: number, month: number): string {
  return `${monthName(month)} ${year}`;
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

function weekdayOfIso(iso: string): number {
  // Returns 0-6 with Mon=0 (matches the grid)
  const d = new Date(`${iso}T00:00:00Z`);
  return (d.getUTCDay() + 6) % 7;
}

export function CalendarListClient({ data }: { data: CalendarMonthData }) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("month");
  const [filter, setFilter] = useState<Record<FilterKey, boolean>>({
    holidays: true,
    team: true,
    me: true,
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Close popover on Escape
  useEffect(() => {
    if (!selectedDay) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedDay(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selectedDay]);

  // Filter a day's people list by the toggle state
  function filterPeople(p: CalendarLeaveRow[]): CalendarLeaveRow[] {
    return p.filter((row) => {
      if (row.isSelf) return filter.me;
      return filter.team;
    });
  }

  const summary = useMemo(() => {
    const visibleDays = data.days.filter((d) => {
      const people = filterPeople(d.people);
      return (d.holiday && filter.holidays) || people.length > 0;
    });
    const holidayCount = data.days.filter((d) => d.holiday).length;
    const leaveDays = data.days.reduce((s, d) => s + filterPeople(d.people).length, 0);
    const myDays = data.days.reduce((s, d) => s + d.people.filter((p) => p.isSelf).length, 0);
    return {
      visibleDays: visibleDays.length,
      holidayCount,
      leaveDays,
      myDays,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.days, filter]);

  async function call(url: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Action failed");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  const prev = shiftMonth(data.year, data.month, -1);
  const next = shiftMonth(data.year, data.month, 1);

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-surface p-0.5">
          <button
            type="button"
            onClick={() => router.push(`/calendar?month=${monthKey(prev.year, prev.month)}`, { scroll: false })}
            aria-label="Previous month"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-tertiary hover:bg-surface-hover hover:text-primary"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => router.push("/calendar", { scroll: false })}
            className="inline-flex h-7 items-center justify-center rounded px-2 text-xs font-medium text-primary hover:bg-surface-hover"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => router.push(`/calendar?month=${monthKey(next.year, next.month)}`, { scroll: false })}
            aria-label="Next month"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-tertiary hover:bg-surface-hover hover:text-primary"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <h2 className="ml-1 text-base font-semibold text-primary">
          {fmtMonthYear(data.year, data.month)}
        </h2>

        {/* Filter chips */}
        <div className="inline-flex rounded-md border border-border-subtle bg-surface p-0.5 text-xs">
          {(["holidays", "team", "me"] as FilterKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter((f) => ({ ...f, [k]: !f[k] }))}
              aria-pressed={filter[k]}
              className={cx(
                "rounded px-2.5 py-1 font-medium transition",
                filter[k]
                  ? k === "me"
                    ? "bg-brand text-on-brand"
                    : k === "team"
                      ? "bg-info text-on-brand"
                      : "bg-success text-on-brand"
                  : "text-tertiary hover:text-primary",
              )}
            >
              {FILTER_LABEL[k]}
            </button>
          ))}
        </div>

        <div className="ml-auto inline-flex rounded-md border border-border-subtle bg-surface p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setView("month")}
            aria-pressed={view === "month"}
            aria-label="Month view"
            className={cx(
              "inline-flex h-6 w-7 items-center justify-center rounded",
              view === "month" ? "bg-brand text-on-brand" : "text-tertiary hover:text-primary",
            )}
          >
            <CalIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            aria-pressed={view === "list"}
            aria-label="List view"
            className={cx(
              "inline-flex h-6 w-7 items-center justify-center rounded",
              view === "list" ? "bg-brand text-on-brand" : "text-tertiary hover:text-primary",
            )}
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* One-line summary */}
      <p className="text-xs text-tertiary">
        {summary.holidayCount} holiday{summary.holidayCount === 1 ? "" : "s"} ·{" "}
        {summary.leaveDays} team-out day{summary.leaveDays === 1 ? "" : "s"} ·{" "}
        {summary.myDays} of your own in {monthName(data.month)}
      </p>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      {view === "month" ? (
        <MonthGrid
          data={data}
          filterPeople={filterPeople}
          filterHolidays={filter.holidays}
          onSelectDay={setSelectedDay}
        />
      ) : (
        <ListView data={data} filterPeople={filterPeople} filterHolidays={filter.holidays} />
      )}

      {/* Side rail */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <MyTimeOffRail
          myLeave={data.myLeave}
          monthLabel={fmtMonthYear(data.year, data.month)}
        />
        <TeamOutRail
          teamOutNext={data.teamOutNext}
        />
        <HolidaysRail
          yearHolidays={data.yearHolidays}
          year={data.year}
          canManage={data.canManageHolidays}
          onAdd={() => setAdding(true)}
          onDelete={async (id) => {
            if (deletingId) return;
            setDeletingId(id);
            await call("/api/v1/holidays", "DELETE", { id });
            setDeletingId(null);
          }}
          deletingId={deletingId}
        />
      </div>

      {adding ? (
        <NewHolidayForm
          busy={busy}
          error={error}
          onCancel={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            router.refresh();
          }}
          onSubmit={async (name, date) => {
            const ok = await call("/api/v1/holidays", "POST", { name, date });
            return ok;
          }}
        />
      ) : null}

      {selectedDay ? (
        <DayPopover
          date={selectedDay}
          event={data.days.find((d) => d.date === selectedDay) ?? null}
          onClose={() => setSelectedDay(null)}
          filterPeople={filterPeople}
        />
      ) : null}
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────
function MonthGrid({
  data,
  filterPeople,
  filterHolidays,
  onSelectDay,
}: {
  data: CalendarMonthData;
  filterPeople: (p: CalendarLeaveRow[]) => CalendarLeaveRow[];
  filterHolidays: boolean;
  onSelectDay: (iso: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-border-subtle bg-surface-subtle">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={cx(
              "px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide",
              i >= 5 ? "text-tertiary" : "text-secondary",
            )}
          >
            {w}
          </div>
        ))}
      </div>
      {/* Days grid */}
      <div className="grid grid-cols-7">
        {Array.from({ length: data.leadBlanks }).map((_, i) => (
          <div
            key={`blank-${i}`}
            className="min-h-24 border-b border-r border-border-subtle bg-surface-subtle/40"
            aria-hidden
          />
        ))}
        {data.days.map((d) => {
          const isToday = d.date === data.todayIso;
          const isWeekend = weekdayOfIso(d.date) >= 5;
          const showHoliday = d.holiday && filterHolidays;
          const people = filterPeople(d.people);
          const eventCount = (showHoliday ? 1 : 0) + people.length;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => onSelectDay(d.date)}
              className={cx(
                "group relative flex min-h-24 flex-col items-stretch border-b border-r border-border-subtle p-1.5 text-left transition",
                isWeekend && !isToday ? "bg-surface-subtle/40" : "bg-surface",
                isToday && "ring-1 ring-inset ring-brand",
                "hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              )}
              aria-label={`Open details for ${d.date}`}
            >
              <div className="flex items-start justify-between">
                <span
                  className={cx(
                    "text-xs font-semibold tabular-nums",
                    isToday ? "text-brand-text" : isWeekend ? "text-tertiary" : "text-primary",
                  )}
                >
                  {Number(d.date.slice(-2))}
                </span>
                {isToday ? (
                  <span className="rounded-full bg-brand px-1.5 py-0 text-[8px] font-bold uppercase tracking-wide text-on-brand">
                    Today
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex flex-col gap-0.5">
                {showHoliday && d.holiday ? (
                  <span
                    className="truncate rounded bg-success-subtle px-1 py-0.5 text-[10px] font-medium text-success"
                    title={d.holiday.name}
                  >
                    {d.holiday.name}
                  </span>
                ) : null}
                {people.slice(0, 2).map((p, i) => (
                  <span
                    key={`${p.userId ?? p.userName}-${i}`}
                    className={cx(
                      "truncate rounded px-1 py-0.5 text-[10px]",
                      p.isSelf
                        ? "bg-brand-subtle font-medium text-brand-text"
                        : "bg-info-subtle text-info",
                    )}
                    title={`${p.userName}${p.isSelf ? " (you)" : ""}`}
                  >
                    {p.isSelf ? "You" : p.userName}
                  </span>
                ))}
                {people.length > 2 ? (
                  <span className="text-[9px] text-tertiary">+{people.length - 2} more</span>
                ) : null}
              </div>
              {eventCount > 0 ? (
                <span className="absolute right-1.5 bottom-1.5 inline-flex h-1.5 w-1.5 rounded-full bg-brand opacity-0 transition group-hover:opacity-100" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ListView({
  data,
  filterPeople,
  filterHolidays,
}: {
  data: CalendarMonthData;
  filterPeople: (p: CalendarLeaveRow[]) => CalendarLeaveRow[];
  filterHolidays: boolean;
}) {
  // Build a flat list of (date, kind, label, sublabel, tone) and group by date
  const rows = useMemo(() => {
    const out: {
      date: string;
      items: { kind: "holiday" | "leave"; label: string; sublabel?: string; tone: "success" | "brand" | "info" }[];
    }[] = [];
    for (const d of data.days) {
      const items: { kind: "holiday" | "leave"; label: string; sublabel?: string; tone: "success" | "brand" | "info" }[] = [];
      if (d.holiday && filterHolidays) {
        items.push({ kind: "holiday", label: d.holiday.name, sublabel: "Company holiday", tone: "success" });
      }
      for (const p of filterPeople(d.people)) {
        items.push({
          kind: "leave",
          label: p.isSelf ? "You" : p.userName,
          sublabel: p.isSelf ? "Your time off" : "On leave",
          tone: p.isSelf ? "brand" : "info",
        });
      }
      if (items.length > 0) out.push({ date: d.date, items });
    }
    return out;
  }, [data.days, filterPeople, filterHolidays]);

  if (rows.length === 0) {
    return (
      <Card>
        <p className="px-5 py-10 text-center text-sm text-tertiary">
          Nothing scheduled in {fmtMonthYear(data.year, data.month)} with current filters.
        </p>
      </Card>
    );
  }

  return (
    <ul className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
      {rows.map((row) => {
        const d = new Date(`${row.date}T00:00:00Z`);
        const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][(d.getUTCDay() + 6) % 7];
        const dayNum = Number(row.date.slice(-2));
        const isToday = row.date === data.todayIso;
        return (
          <li
            key={row.date}
            className={cx(
              "flex items-start gap-4 border-b border-border-subtle px-5 py-3 last:border-b-0",
              isToday && "bg-brand-subtle/30",
            )}
          >
            <div
              className={cx(
                "flex w-12 shrink-0 flex-col items-center justify-center rounded-md py-1",
                isToday ? "bg-brand text-on-brand" : "bg-surface-subtle text-secondary",
              )}
            >
              <span className="text-[9px] font-semibold uppercase tracking-wide">
                {weekday}
              </span>
              <span className="text-lg font-semibold tabular-nums leading-none">
                {dayNum}
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {row.items.map((it, i) => (
                <span
                  key={`${row.date}-${i}`}
                  className={cx(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
                    it.tone === "success" && "bg-success-subtle text-success",
                    it.tone === "brand" && "bg-brand-subtle text-brand-text",
                    it.tone === "info" && "bg-info-subtle text-info",
                  )}
                >
                  <span className="font-medium">{it.label}</span>
                  {it.sublabel ? <span className="text-[10px] opacity-80">· {it.sublabel}</span> : null}
                </span>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function MyTimeOffRail({
  myLeave,
  monthLabel,
}: {
  myLeave: CalendarLeaveRow[];
  monthLabel: string;
}) {
  return (
    <Card>
      <CardHeader title="My time off" subtitle={monthLabel} />
      {myLeave.length === 0 ? (
        <p className="px-5 py-4 text-sm text-tertiary">
          No approved leave in {monthLabel}. Plan ahead on the Leave page.
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {myLeave.map((l, i) => (
            <li key={`${l.userId ?? l.userName}-${i}`} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-primary">
                  {l.startDate} → {l.endDate}
                </p>
                <p className="text-[11px] text-tertiary">
                  {daysBetween(l.startDate, l.endDate)} day{daysBetween(l.startDate, l.endDate) === 1 ? "" : "s"}
                </p>
              </div>
              <Badge tone="brand">Approved</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TeamOutRail({
  teamOutNext,
}: {
  teamOutNext: { date: string; people: string[] }[];
}) {
  const total = teamOutNext.reduce((s, d) => s + d.people.length, 0);
  return (
    <Card>
      <CardHeader
        title="Team out"
        subtitle={`Next 8 weeks · ${total} entries`}
      />
      {teamOutNext.length === 0 ? (
        <p className="px-5 py-4 text-sm text-tertiary">
          Nobody on your team is out in the next 8 weeks.
        </p>
      ) : (
        <ul className="max-h-64 divide-y divide-border-subtle overflow-y-auto">
          {teamOutNext.map((d) => (
            <li
              key={d.date}
              className="flex items-center justify-between gap-2 px-5 py-2 text-sm"
            >
              <span className="tabular-nums text-secondary">{d.date}</span>
              <span className="flex min-w-0 flex-1 justify-end gap-1">
                {d.people.slice(0, 3).map((p, i) => (
                  <span
                    key={`${d.date}-${i}`}
                    className="truncate rounded bg-info-subtle px-1.5 py-0.5 text-[10px] text-info"
                    title={p}
                  >
                    {p}
                  </span>
                ))}
                {d.people.length > 3 ? (
                  <span className="rounded bg-surface-subtle px-1.5 py-0.5 text-[10px] text-tertiary">
                    +{d.people.length - 3}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function HolidaysRail({
  yearHolidays,
  year,
  canManage,
  onAdd,
  onDelete,
  deletingId,
}: {
  yearHolidays: CalendarHoliday[];
  year: number;
  canManage: boolean;
  onAdd: () => void;
  onDelete: (id: string) => void | Promise<void>;
  deletingId: string | null;
}) {
  return (
    <Card>
      <CardHeader
        title={`Holidays ${year}`}
        subtitle={`${yearHolidays.length} configured`}
        action={
          canManage ? (
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1 text-xs font-medium text-on-brand transition hover:bg-brand-hover"
            >
              <Plus className="h-3 w-3" />
              Add
            </button>
          ) : null
        }
      />
      {yearHolidays.length === 0 ? (
        <p className="px-5 py-4 text-sm text-tertiary">
          No holidays configured for {year}.
        </p>
      ) : (
        <ul className="max-h-64 divide-y divide-border-subtle overflow-y-auto">
          {yearHolidays.map((h) => {
            const d = new Date(`${h.date}T00:00:00Z`);
            const monthShort = d.toLocaleDateString("en-US", { month: "short" });
            const day = d.getUTCDate();
            return (
              <li
                key={h.id}
                className="flex items-center gap-3 px-5 py-2.5 text-sm"
              >
                <div className="flex w-10 shrink-0 flex-col items-center rounded bg-success-subtle py-0.5 text-success">
                  <span className="text-[8px] font-semibold uppercase tracking-wide">
                    {monthShort}
                  </span>
                  <span className="text-sm font-semibold tabular-nums leading-none">
                    {day}
                  </span>
                </div>
                <span className="min-w-0 flex-1 truncate font-medium text-primary" title={h.name}>
                  {h.name}
                </span>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => onDelete(h.id)}
                    disabled={deletingId === h.id}
                    className="rounded p-1 text-tertiary hover:bg-danger-subtle hover:text-danger disabled:opacity-50"
                    aria-label={`Delete ${h.name}`}
                    title="Delete"
                  >
                    {deletingId === h.id ? (
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function NewHolidayForm({
  busy,
  error,
  onCancel,
  onCreated,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onCreated: () => void;
  onSubmit: (name: string, date: string) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  return (
    <form
      className="rounded-lg border border-border-subtle bg-surface px-4 py-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await onSubmit(name.trim(), date);
        if (ok) {
          setName("");
          setDate("");
          onCreated();
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <CalendarDays className="h-4 w-4 shrink-0 text-tertiary" aria-hidden />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Holiday name (e.g. Diwali)"
          required
          minLength={2}
          maxLength={80}
          className="min-w-0 grow bg-transparent text-sm text-primary placeholder:text-tertiary focus:outline-none"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          aria-label="Holiday date"
          className="rounded-md border border-border-default bg-surface px-2 py-1 text-xs"
        />
        <button
          type="submit"
          disabled={busy || !name.trim() || !date}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1 text-xs font-medium text-on-brand transition hover:bg-brand-hover disabled:opacity-50"
        >
          {busy ? "Adding…" : (
            <>
              <Check className="h-3 w-3" />
              Add
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2 py-1 text-xs text-tertiary hover:text-primary"
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function DayPopover({
  date,
  event,
  onClose,
  filterPeople,
}: {
  date: string;
  event: CalendarDayEvent | null;
  onClose: () => void;
  filterPeople: (p: CalendarLeaveRow[]) => CalendarLeaveRow[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => window.addEventListener("mousedown", h), 0);
    return () => window.removeEventListener("mousedown", h);
  }, [onClose]);

  if (!event) return null;
  const d = new Date(`${date}T00:00:00Z`);
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const dateLabel = d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const people = filterPeople(event.people);
  return (
    <div
      className="fixed inset-0 z-[var(--z-modal,50)] flex items-center justify-center bg-black/30 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${weekday} ${dateLabel}`}
    >
      <div
        ref={ref}
        className="w-full max-w-sm overflow-hidden rounded-lg border border-border-default bg-surface shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">{weekday}</p>
            <p className="text-sm font-semibold text-primary">{dateLabel}</p>
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
        <div className="max-h-80 overflow-y-auto p-3">
          {event.holiday ? (
            <div className="mb-3 flex items-center gap-2 rounded-md bg-success-subtle px-3 py-2 text-success">
              <CalendarDays className="h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{event.holiday.name}</p>
                <p className="text-[10px] opacity-80">Company holiday</p>
              </div>
            </div>
          ) : null}
          {people.length === 0 && !event.holiday ? (
            <p className="px-2 py-6 text-center text-sm text-tertiary">Nothing scheduled.</p>
          ) : null}
          {people.length > 0 ? (
            <div className="space-y-1">
              <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-tertiary">On leave</p>
              {people.map((p, i) => (
                <div
                  key={`${p.userId ?? p.userName}-${i}`}
                  className={cx(
                    "flex items-center gap-2 rounded-md px-2 py-1.5",
                    p.isSelf ? "bg-brand-subtle" : "bg-info-subtle",
                  )}
                >
                  <Avatar name={p.userName} className="!h-6 !w-6 text-[9px]" />
                  <span
                    className={cx(
                      "text-sm font-medium",
                      p.isSelf ? "text-brand-text" : "text-info",
                    )}
                  >
                    {p.isSelf ? "You" : p.userName}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((db - da) / 86_400_000) + 1);
}
