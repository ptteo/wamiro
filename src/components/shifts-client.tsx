"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CalendarClock, Plus, Trash2, Users } from "lucide-react";

import { Button } from "./ui";
import { cx } from "@/lib/cx";

export interface ShiftData {
  canManage: boolean;
  shifts: {
    id: string;
    date: string;
    name: string;
    startMinutes: number;
    endMinutes: number;
    graceMinutes: number;
    color: string | null;
  }[];
  types: {
    id: string;
    name: string;
    startMinutes: number;
    endMinutes: number;
    graceMinutes: number;
    workingHours: number;
    color: string | null;
  }[];
  members: { id: string; name: string }[];
}

export interface RosterAssignment {
  assignmentId: string;
  date: string;
  userId: string;
  userName: string;
  shiftTypeId: string;
  shiftName: string;
  startMinutes: number;
  endMinutes: number;
}

function fmt(minutes: number): string {
  const m = Math.max(0, Math.min(1439, minutes));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function dow(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" });
}

function monthDay(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function weekStart(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function ShiftsClient({ data }: { data: ShiftData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // ── new shift type form ──
  const [typeName, setTypeName] = useState("");
  const [startT, setStartT] = useState("09:00");
  const [endT, setEndT] = useState("17:00");
  const [grace, setGrace] = useState("15");
  const [color, setColor] = useState("#4f46e5");

  // ── roster assign form ──
  const [memberId, setMemberId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [fromIso, setFromIso] = useState(weekStart());
  const [toIso, setToIso] = useState(addDays(weekStart(), 6));
  const [repeatDays, setRepeatDays] = useState<number[]>([1, 2, 3, 4, 5]);

  // ── roster view ──
  const [rosterFrom, setRosterFrom] = useState(weekStart());
  const [rosterTo, setRosterTo] = useState(addDays(weekStart(), 6));
  const [roster, setRoster] = useState<RosterAssignment[]>([]);
  const [rosterLoaded, setRosterLoaded] = useState(false);

  const typeNameFor = (id: string) => data.types.find((t) => t.id === id)?.name ?? "";

  async function call(url: string, method: string, body: unknown, refresh = true) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
        body: body instanceof FormData ? body : JSON.stringify(body),
      });
      const data2 = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok) {
        setError(data2.error?.message ?? `Request failed (${res.status})`);
        return false;
      }
      if (refresh) router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function loadRoster(from: string, to: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/shifts?roster=1&from=${from}&to=${to}`);
      const d = (await res.json()) as { assignments?: RosterAssignment[]; error?: { message?: string } };
      if (!res.ok) {
        setError(d.error?.message ?? "Failed to load roster");
        return;
      }
      setRoster(d.assignments ?? []);
      setRosterLoaded(true);
    } finally {
      setBusy(false);
    }
  }

  const createType = async (e: React.FormEvent) => {
    e.preventDefault();
    const toMin = (t: string) => {
      const parts = t.split(":");
      return (Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0);
    };
    if (!typeName.trim()) return setError("Name is required");
    if (toMin(endT) <= toMin(startT)) return setError("End must be after start");
    const ok = await call("/api/v1/shifts/types", "POST", {
      name: typeName.trim(),
      startMinutes: toMin(startT),
      endMinutes: toMin(endT),
      graceMinutes: Number(grace) || 15,
      color,
    });
    if (ok) {
      setTypeName("");
      setInfo("Shift type created");
    }
  };

  const deleteType = async (id: string) => {
    if (!confirm("Delete this shift type? Existing assignments are removed too.")) return;
    const ok = await call(`/api/v1/shifts/types/${id}`, "DELETE", {});
    if (ok) setInfo("Shift type deleted");
  };

  const datesInRange = useMemo(() => {
    const out: string[] = [];
    let d = fromIso;
    if (toIso < fromIso) return out;
    // guard runaway loops on bad input
    let guard = 0;
    while (d <= toIso && guard < 370) {
      const day = new Date(d + "T00:00:00").getDay();
      const dowIdx = day === 0 ? 7 : day; // Mon=1..Sun=7
      if (repeatDays.includes(dowIdx)) out.push(d);
      d = addDays(d, 1);
      guard += 1;
    }
    return out;
  }, [fromIso, toIso, repeatDays]);

  const assign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberId) return setError("Choose a person");
    if (!typeId) return setError("Choose a shift type");
    if (datesInRange.length === 0) return setError("No dates match your repeat selection");
    const ok = await call("/api/v1/shifts/assignments", "POST", {
      employeeUserId: memberId,
      shiftTypeId: typeId,
      dates: datesInRange,
    });
    if (ok) {
      setInfo(`Assigned ${typeNameFor(typeId)} on ${datesInRange.length} day(s)`);
      setMemberId("");
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        {/* My upcoming shifts */}
        <section className="rounded-lg border border-border-subtle bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-primary">
              <CalendarClock className="h-4 w-4 text-tertiary" /> My upcoming shifts
            </h2>
            <span className="text-[11px] text-tertiary">next 4 weeks</span>
          </div>
          {data.shifts.length === 0 ? (
            <p className="py-6 text-center text-sm text-tertiary">
              No shifts scheduled for you yet. Your roster appears here once HR assigns one.
            </p>
          ) : (
            <ol className="divide-y divide-border-subtle">
              {data.shifts.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className="h-8 w-1 shrink-0 rounded-full"
                    style={{ background: s.color ?? "#4f46e5" }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-primary">{s.name}</p>
                    <p className="text-[11px] text-tertiary">
                      {dow(s.date)}, {monthDay(s.date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-primary">
                      {fmt(s.startMinutes)}–{fmt(s.endMinutes)}
                    </p>
                    {s.graceMinutes > 0 && (
                      <p className="text-[10px] text-tertiary">{s.graceMinutes} min grace</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Roster (manage) */}
        {data.canManage && (
          <section className="rounded-lg border border-border-subtle bg-surface p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
              <Users className="h-4 w-4 text-tertiary" /> Team roster
            </h2>
            <div className="mb-3 flex flex-wrap items-end gap-2">
              <label className="flex flex-col text-[11px] font-medium text-secondary">
                From
                <input
                  type="date"
                  value={rosterFrom}
                  onChange={(e) => setRosterFrom(e.target.value)}
                  className="mt-1 rounded-md border border-border-strong bg-surface px-2 py-1 text-sm text-primary"
                />
              </label>
              <label className="flex flex-col text-[11px] font-medium text-secondary">
                To
                <input
                  type="date"
                  value={rosterTo}
                  onChange={(e) => setRosterTo(e.target.value)}
                  className="mt-1 rounded-md border border-border-strong bg-surface px-2 py-1 text-sm text-primary"
                />
              </label>
              <Button
                variant="secondary"
                size="sm"
                loading={busy}
                onClick={() => loadRoster(rosterFrom, rosterTo)}
              >
                Load
              </Button>
            </div>

            {rosterLoaded && roster.length === 0 && (
              <p className="py-4 text-center text-sm text-tertiary">No assignments in this range.</p>
            )}
            {roster.length > 0 && (
              <ul className="divide-y divide-border-subtle">
                {roster.map((r) => (
                  <li key={`${r.assignmentId}-${r.date}`} className="flex items-center gap-3 py-2 text-sm">
                    <span className="w-24 shrink-0 text-xs text-tertiary">
                      {dow(r.date)} {monthDay(r.date)}
                    </span>
                    <span className="flex-1 truncate font-medium text-primary">{r.userName}</span>
                    <span className="rounded bg-brand-subtle px-1.5 py-0.5 text-[11px] font-medium text-brand">
                      {r.shiftName} · {fmt(r.startMinutes)}–{fmt(r.endMinutes)}
                    </span>
                    <button
                      type="button"
                      title="Remove assignment"
                      aria-label={`Remove ${r.shiftName} for ${r.userName}`}
                      onClick={async () => {
                        if (!confirm(`Remove this shift for ${r.userName} on ${r.date}?`)) return;
                        const ok = await call(`/api/v1/shifts/assignments/${r.assignmentId}`, "DELETE", {}, false);
                        if (ok) {
                          setRoster((prev) => prev.filter((x) => x.assignmentId !== r.assignmentId));
                          setInfo("Assignment removed");
                        }
                      }}
                      className="text-tertiary transition hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {/* Right rail — manage actions */}
      <aside className="space-y-5">
        {error && (
          <p className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        {info && (
          <p className="rounded-md border border-success/30 bg-success-subtle px-3 py-2 text-sm text-success">
            {info}
          </p>
        )}

        {data.canManage && (
          <>
            <section className="rounded-lg border border-border-subtle bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold text-primary">New shift type</h2>
              <form onSubmit={createType} className="grid gap-3">
                <input
                  value={typeName}
                  onChange={(e) => setTypeName(e.target.value)}
                  placeholder="Name (e.g. Morning)"
                  className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-primary placeholder:text-tertiary"
                />
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col text-[11px] font-medium text-secondary">
                    Starts
                    <input
                      type="time"
                      value={startT}
                      onChange={(e) => setStartT(e.target.value)}
                      className="mt-1 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-primary"
                    />
                  </label>
                  <label className="flex flex-col text-[11px] font-medium text-secondary">
                    Ends
                    <input
                      type="time"
                      value={endT}
                      onChange={(e) => setEndT(e.target.value)}
                      className="mt-1 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-primary"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 items-center gap-2">
                  <label className="flex flex-col text-[11px] font-medium text-secondary">
                    Grace (min)
                    <input
                      type="number"
                      min={0}
                      max={180}
                      value={grace}
                      onChange={(e) => setGrace(e.target.value)}
                      className="mt-1 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-primary"
                    />
                  </label>
                  <label className="flex flex-col text-[11px] font-medium text-secondary">
                    Colour
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="mt-1 h-9 w-full cursor-pointer rounded-md border border-border-strong bg-surface"
                    />
                  </label>
                </div>
                <Button variant="primary" loading={busy} className="justify-center">
                  <Plus className="h-4 w-4" /> Create type
                </Button>
              </form>
            </section>

            <section className="rounded-lg border border-border-subtle bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold text-primary">Shift types</h2>
              {data.types.length === 0 ? (
                <p className="text-sm text-tertiary">None yet — create one above.</p>
              ) : (
                <ul className="space-y-2">
                  {data.types.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: t.color ?? "#4f46e5" }} />
                      <span className="flex-1 truncate font-medium text-primary">{t.name}</span>
                      <span className="text-xs tabular-nums text-tertiary">
                        {fmt(t.startMinutes)}–{fmt(t.endMinutes)}
                      </span>
                      <button
                        type="button"
                        aria-label={`Delete ${t.name}`}
                        onClick={() => deleteType(t.id)}
                        className="text-tertiary transition hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-lg border border-border-subtle bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold text-primary">Assign shift</h2>
              <form onSubmit={assign} className="grid gap-3">
                <select
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                  className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-primary"
                >
                  <option value="">Choose a person…</option>
                  {data.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <select
                  value={typeId}
                  onChange={(e) => setTypeId(e.target.value)}
                  className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-primary"
                >
                  <option value="">Choose a shift type…</option>
                  {data.types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({fmt(t.startMinutes)}–{fmt(t.endMinutes)})
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col text-[11px] font-medium text-secondary">
                    From
                    <input
                      type="date"
                      value={fromIso}
                      onChange={(e) => setFromIso(e.target.value)}
                      className="mt-1 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-primary"
                    />
                  </label>
                  <label className="flex flex-col text-[11px] font-medium text-secondary">
                    To
                    <input
                      type="date"
                      value={toIso}
                      onChange={(e) => setToIso(e.target.value)}
                      className="mt-1 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-primary"
                    />
                  </label>
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-medium text-secondary">Repeat on</p>
                  <div className="flex flex-wrap gap-1">
                    {([["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6], ["Sun", 7]] as const).map(
                      ([label, n]) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() =>
                            setRepeatDays((prev) =>
                              prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort(),
                            )
                          }
                          className={cx(
                            "rounded-md border px-2 py-1 text-[11px] font-medium transition",
                            repeatDays.includes(n)
                              ? "border-brand bg-brand-subtle text-brand"
                              : "border-border-strong bg-surface text-secondary hover:bg-surface-hover",
                          )}
                        >
                          {label}
                        </button>
                      ),
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-tertiary">
                    {datesInRange.length} day(s) selected
                  </p>
                </div>
                <Button variant="primary" loading={busy} className="justify-center">
                  Assign
                </Button>
              </form>
            </section>
          </>
        )}

        {!data.canManage && (
          <p className="rounded-lg border border-border-subtle bg-surface p-4 text-sm text-secondary">
            Shift planning is managed by HR. You can see your own schedule here and on the{" "}
            <Link href="/attendance" className="font-medium text-brand hover:underline">
              attendance
            </Link>{" "}
            page.
          </p>
        )}
      </aside>
    </div>
  );
}
