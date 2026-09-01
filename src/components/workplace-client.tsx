"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Badge, Card, CardHeader, EmptyState, Stat, btn, input } from "./ui";

interface Resource {
  id: string;
  name: string;
  kind: string;
  location: string | null;
  capacity: number | null;
  features: string[];
  status: string;
}

interface Booking {
  id: string;
  resourceId: string;
  resourceName: string;
  startsAt: string;
  endsAt: string;
  status: string;
}

interface Visitor {
  id: string;
  name: string;
  email: string | null;
  visitDate: string;
  status: string;
  hostUserId: string;
  hostName: string | null;
}

interface OrgToday {
  id: string;
  resourceId: string;
  resourceName: string;
  userName: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
}

const RECENTS_KEY = "wamiro-workplace-recents";
const MAX_RECENTS = 4;

const VISITOR_TONES: Record<string, "neutral" | "amber" | "green" | "red"> = {
  invited: "neutral",
  checked_in: "green",
  checked_out: "neutral",
  cancelled: "red",
};

const RESOURCE_KIND_LABEL: Record<string, string> = {
  room: "Room",
  desk: "Desk",
  resource: "Resource",
};

function readRecents(): { id: string; name: string; openedAt: number }[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { id: string; name: string; openedAt: number }[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r) => r && typeof r.id === "string").slice(0, MAX_RECENTS);
  } catch { return []; }
}

function writeRecents(entry: { id: string; name: string; openedAt: number }) {
  if (typeof window === "undefined") return;
  const next = [entry, ...readRecents().filter((r) => r.id !== entry.id)].slice(0, MAX_RECENTS);
  try { window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch {}
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export function WorkplaceClient({
  resources,
  bookings,
  visitors,
  orgToday,
  canBook,
  canManage,
  day,
}: {
  resources: Resource[];
  bookings: Booking[];
  visitors: Visitor[];
  orgToday: OrgToday[];
  canBook: boolean;
  canManage: boolean;
  day: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [recents, setRecents] = useState<{ id: string; name: string; openedAt: number }[]>([]);
  const [resourceFilter, setResourceFilter] = useState<"all" | "room" | "desk" | "resource">("all");
  const [activeResource, setActiveResource] = useState<Resource | null>(null);
  const [visitorTab, setVisitorTab] = useState<"today" | "upcoming" | "all">("today");

  useEffect(() => { setRecents(readRecents()); }, []);

  const activeResources = useMemo(
    () => resources.filter((r) => r.status === "active"),
    [resources],
  );

  const stats = useMemo(() => {
    const todayKey = day;
    const myBookingsToday = bookings.filter(
      (b) => b.startsAt.slice(0, 10) === todayKey && b.status === "booked",
    ).length;
    const visitorsToday = visitors.filter(
      (v) => v.visitDate === todayKey,
    ).length;
    const onSite = visitors.filter((v) => v.status === "checked_in").length;
    const freeRooms = activeResources.filter(
      (r) => r.kind === "room" && !orgToday.some((b) => b.resourceId === r.id),
    ).length;
    return { myBookingsToday, visitorsToday, onSite, freeRooms };
  }, [bookings, visitors, activeResources, orgToday, day]);

  const filteredResources = useMemo(
    () => resources.filter((r) => resourceFilter === "all" || r.kind === resourceFilter),
    [resources, resourceFilter],
  );

  const upcomingVisitors = useMemo(
    () => visitors.filter((v) => v.visitDate >= day && v.status !== "cancelled").slice(0, 8),
    [visitors, day],
  );
  const todaysVisitors = useMemo(
    () => visitors.filter((v) => v.visitDate === day),
    [visitors, day],
  );

  function rememberResource(r: Resource) {
    writeRecents({ id: r.id, name: r.name, openedAt: Date.now() });
    setRecents(readRecents());
  }

  async function bookResource(r: Resource, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canBook) return;
    setBusy(true); setError(null); setInfo(null);
    const f = new FormData(e.currentTarget);
    const startsAt = `${f.get("date")}T${f.get("startTime")}:00.000Z`;
    const endsAt = `${f.get("date")}T${f.get("endTime")}:00.000Z`;
    try {
      const res = await fetch("/api/v1/workplace/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resourceId: r.id, startsAt, endsAt }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(d.error?.message ?? "Booking failed");
        return;
      }
      setInfo(`Booked ${r.name} from ${f.get("startTime")} to ${f.get("endTime")}`);
      rememberResource(r);
      router.refresh();
    } finally { setBusy(false); }
  }

  async function cancelBooking(id: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/v1/workplace/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel", id }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(d.error?.message ?? "Cancel failed");
        return;
      }
      router.refresh();
    } finally { setBusy(false); }
  }

  async function inviteVisitor(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canBook) return;
    setBusy(true); setError(null); setInfo(null);
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/v1/workplace/visitors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: f.get("name"),
          email: f.get("email") || undefined,
          visitDate: f.get("visitDate"),
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(d.error?.message ?? "Invite failed");
        return;
      }
      setInfo("Visitor invited");
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } finally { setBusy(false); }
  }

  async function visitorAction(id: string, action: "checkin" | "checkout" | "cancel") {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/v1/workplace/visitors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(d.error?.message ?? `${action} failed`);
        return;
      }
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-primary">Workplace</h1>
        <p className="mt-1 text-sm text-secondary">Rooms, desks, equipment, and visitors for {day}.</p>
      </header>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="My bookings today" value={stats.myBookingsToday} tone={stats.myBookingsToday > 0 ? "brand" : "neutral"} />
        <Stat label="Visitors today" value={stats.visitorsToday} hint={`${stats.onSite} on-site`} tone={stats.onSite > 0 ? "green" : "neutral"} />
        <Stat label="Free rooms now" value={stats.freeRooms} hint={`of ${activeResources.filter((r) => r.kind === "room").length}`} />
        <Stat label="Active resources" value={activeResources.length} />
      </div>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {info && !error && <p role="status" className="text-sm text-success">{info}</p>}

      {/* Recents */}
      {recents.length > 0 && (
        <Card>
          <CardHeader title="Recent resources" subtitle="Quickly jump back to a room or desk" />
          <ul className="flex flex-wrap gap-2 px-5 py-3">
            {recents.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    const found = resources.find((x) => x.id === r.id);
                    if (found) setActiveResource(found);
                  }}
                  className="inline-flex items-center gap-2 rounded-md border border-border-default bg-surface px-2.5 py-1.5 text-xs hover:bg-surface-hover"
                >
                  <span aria-hidden>🕘</span>
                  <span className="max-w-[18ch] truncate font-medium text-primary">{r.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Today's timeline */}
      <Card>
        <CardHeader title={`Today in the office · ${day}`} subtitle="All org bookings from midnight to midnight (UTC)" />
        {orgToday.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-tertiary">No bookings scheduled today.</p>
        ) : (
          <ol className="divide-y divide-border-subtle">
            {orgToday.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <p className="font-medium text-primary">{b.resourceName}</p>
                  <p className="text-xs text-tertiary">{b.userName ?? "—"}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums text-secondary">{fmtTime(b.startsAt)} – {fmtTime(b.endsAt)}</span>
                  <Badge tone="brand">booked</Badge>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Resources */}
        <Card>
          <CardHeader
            title={`Resources (${resources.length})`}
            action={
              <select
                aria-label="Filter by kind"
                value={resourceFilter}
                onChange={(e) => setResourceFilter(e.target.value as typeof resourceFilter)}
                className={`${input} h-8 w-36`}
              >
                <option value="all">All kinds</option>
                <option value="room">Rooms</option>
                <option value="desk">Desks</option>
                <option value="resource">Other</option>
              </select>
            }
          />
          {filteredResources.length === 0 ? (
            <EmptyState title="No resources" hint={canManage ? "Add one below." : "Ask an admin to add resources."} />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {filteredResources.map((r) => {
                const isActive = activeResource?.id === r.id;
                const inUse = orgToday.some((b) => b.resourceId === r.id);
                return (
                  <li key={r.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => {
                            rememberResource(r);
                            setActiveResource(isActive ? null : r);
                          }}
                          className="text-left font-medium text-primary hover:underline"
                          aria-expanded={isActive}
                        >
                          {r.name}
                        </button>
                        <p className="text-xs text-tertiary">
                          {RESOURCE_KIND_LABEL[r.kind] ?? r.kind}
                          {r.location ? ` · ${r.location}` : ""}
                          {r.capacity ? ` · seats ${r.capacity}` : ""}
                          {r.features.length > 0 ? ` · ${r.features.join(", ")}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.status !== "active" ? <Badge tone="red">{r.status}</Badge>
                          : inUse ? <Badge tone="amber">busy now</Badge>
                          : <Badge tone="green">free now</Badge>}
                        {canBook && r.status === "active" && (
                          <button
                            type="button"
                            onClick={() => { rememberResource(r); setActiveResource(isActive ? null : r); }}
                            className={`${btn.secondary} ${btn.small}`}
                          >
                            {isActive ? "Hide" : "Book"}
                          </button>
                        )}
                      </div>
                    </div>
                    {isActive && r.status === "active" && canBook && (
                      <form onSubmit={(e) => bookResource(r, e)} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <label className="text-xs font-medium">
                          Date
                          <input type="date" name="date" defaultValue={day} required className={`${input} mt-1 h-8`} />
                        </label>
                        <label className="text-xs font-medium">
                          From
                          <input type="time" name="startTime" defaultValue="09:00" required className={`${input} mt-1 h-8`} />
                        </label>
                        <label className="text-xs font-medium">
                          To
                          <input type="time" name="endTime" defaultValue="10:00" required className={`${input} mt-1 h-8`} />
                        </label>
                        <button type="submit" disabled={busy} className={`${btn.primary} self-end`}>
                          {busy ? "Booking…" : "Book"}
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* My bookings */}
        <Card>
          <CardHeader title={`My bookings (${bookings.length})`} subtitle="Newest first; you can cancel any future one" />
          {bookings.length === 0 ? (
            <EmptyState title="No bookings yet" hint="Pick a resource on the left to book a slot." />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {bookings.map((b) => {
                const isPast = new Date(b.endsAt).getTime() < Date.now();
                return (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div>
                      <p className="font-medium text-primary">{b.resourceName}</p>
                      <p className="text-xs text-tertiary">{fmtDate(b.startsAt)} · {fmtTime(b.startsAt)} – {fmtTime(b.endsAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={b.status === "booked" ? (isPast ? "neutral" : "brand") : "neutral"}>{b.status}</Badge>
                      {b.status === "booked" && !isPast && (
                        <button
                          type="button"
                          onClick={() => cancelBooking(b.id)}
                          disabled={busy}
                          className={`${btn.danger} ${btn.small}`}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Visitors */}
      {canBook && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader title="Invite a visitor" />
            <form onSubmit={inviteVisitor} className="grid gap-3 px-5 py-4 sm:grid-cols-2">
              <label className="text-sm font-medium">
                Name
                <input name="name" required minLength={2} maxLength={120} className={`${input} mt-1`} />
              </label>
              <label className="text-sm font-medium">
                Email (optional)
                <input name="email" type="email" className={`${input} mt-1`} placeholder="guest@example.com" />
              </label>
              <label className="text-sm font-medium">
                Visit date
                <input name="visitDate" type="date" defaultValue={day} required className={`${input} mt-1`} />
              </label>
              <div className="flex items-end">
                <button type="submit" disabled={busy} className={btn.primary}>
                  {busy ? "Inviting…" : "Send invite"}
                </button>
              </div>
            </form>
          </Card>

          <Card>
            <CardHeader
              title="Visitors"
              action={
                <div className="flex items-center gap-1 rounded-md border border-border-default bg-surface p-0.5 text-xs">
                  {(["today", "upcoming", "all"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setVisitorTab(t)}
                      className={[
                        "rounded px-2 py-1",
                        visitorTab === t ? "bg-brand text-on-brand" : "text-secondary hover:bg-surface-hover",
                      ].join(" ")}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              }
            />
            {(() => {
              const list =
                visitorTab === "today" ? todaysVisitors
                : visitorTab === "upcoming" ? upcomingVisitors
                : visitors;
              if (list.length === 0) {
                return <EmptyState title="No visitors" hint={visitorTab === "today" ? "No visitors on the schedule today." : "No visitors to show."} />;
              }
              return (
                <ul className="divide-y divide-border-subtle">
                  {list.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                      <div>
                        <p className="font-medium text-primary">{v.name}</p>
                        <p className="text-xs text-tertiary">
                          {v.visitDate}
                          {v.email ? ` · ${v.email}` : ""}
                          {v.hostName ? ` · host ${v.hostName}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={VISITOR_TONES[v.status] ?? "neutral"}>{v.status}</Badge>
                        {v.status === "invited" && (
                          <button
                            type="button"
                            onClick={() => visitorAction(v.id, "checkin")}
                            disabled={busy}
                            className={`${btn.secondary} ${btn.small}`}
                          >
                            Check in
                          </button>
                        )}
                        {v.status === "checked_in" && (
                          <button
                            type="button"
                            onClick={() => visitorAction(v.id, "checkout")}
                            disabled={busy}
                            className={`${btn.secondary} ${btn.small}`}
                          >
                            Check out
                          </button>
                        )}
                        {v.status !== "cancelled" && v.status !== "checked_out" && canManage && (
                          <button
                            type="button"
                            onClick={() => visitorAction(v.id, "cancel")}
                            disabled={busy}
                            className={`${btn.danger} ${btn.small}`}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </Card>
        </div>
      )}
    </div>
  );
}
