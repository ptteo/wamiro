"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Briefcase,
  Calendar,
  ChevronLeft,
  Clock3,
  Inbox,
  ListTodo,
  Mail,
  MapPin,
  Pencil,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";

import { Avatar, Badge, EmptyState, StatusDot, statusTone } from "./ui";
import { cx } from "@/lib/cx";

interface ProfileData {
  userId: string;
  name: string;
  email: string;
  status: string;
  avatarUrl: string | null;
  jobTitle: string | null;
  departmentId: string | null;
  departmentName: string | null;
  managerId: string | null;
  managerName: string | null;
  hiredAt: string | null;
}

interface Report {
  userId: string;
  name: string;
  avatarUrl: string | null;
  jobTitle: string | null;
  departmentName: string | null;
}

interface TimelineEvent {
  at: Date | string | null;
  label: string;
  detail?: string | null;
}

interface Workspace {
  attendance: { clockIn: Date; clockOut: Date | null }[];
  leave: { typeName: string; startDate: string; endDate: string; status: string; days: string }[];
}

interface CustomFieldDef {
  id: string;
  fieldKey: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select";
  active: boolean;
  required?: boolean;
  options?: { value: string; label: string }[];
}

interface CustomValues {
  [k: string]: unknown;
}

const tabs = [
  { key: "overview", label: "Overview" },
  { key: "attendance", label: "Attendance" },
  { key: "leave", label: "Leave" },
] as const;
type TabKey = typeof tabs[number]["key"];

const tabHrefs = (id: string, k: TabKey) => `/people/${id}?tab=${k}`;

export function ProfilePageClient({
  profile,
  reports,
  timeline,
  workspace,
  customDefs,
  customValues,
  canEditFields,
  canSeeExtras,
  canSendKudos,
  initialTab,
}: {
  profile: ProfileData;
  reports: Report[];
  timeline: { jobTitle: string | null; events: TimelineEvent[] };
  workspace: Workspace | null;
  customDefs: CustomFieldDef[];
  customValues: CustomValues;
  canEditFields: boolean;
  canSeeExtras: boolean;
  canSendKudos: boolean;
  initialTab: TabKey;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  const active = tabs.find((t) => t.key === initialTab)?.key ?? "overview";
  const tenure = tenureLabel(profile.hiredAt);

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-tertiary">
        <Link href="/people" className="inline-flex items-center gap-1 hover:text-primary">
          <ChevronLeft className="h-3 w-3" />
          People
        </Link>
        <span aria-hidden>/</span>
        <span className="font-medium text-primary">{profile.name}</span>
      </nav>

      {/* Hero — cover strip + avatar + identity + actions */}
      <section className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
        <div className="relative h-20 bg-gradient-to-r from-brand-subtle via-warning-subtle/30 to-surface" />
        <div className="px-6 pb-5">
          <div className="relative -mt-10 flex flex-wrap items-end gap-4">
            <div className="relative shrink-0">
              <span className="absolute inset-0 -m-0.5 rounded-full ring-4 ring-surface" aria-hidden />
              <Avatar
                name={profile.name}
                src={profile.avatarUrl ?? undefined}
                className="!h-20 !w-20 text-xl"
              />
              <span className="absolute -bottom-1 -right-1 inline-block">
                <StatusDot status={profile.status} className="ring-[3px] ring-surface" />
              </span>
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-primary">
                {profile.name}
              </h1>
              <p className="mt-0.5 text-sm text-secondary">
                {profile.jobTitle ?? "Team member"}
                {profile.departmentName ? ` · ${profile.departmentName}` : ""}
                {tenure ? ` · ${tenure}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <Badge tone={statusTone(profile.status)}>{profile.status}</Badge>
              <a
                href={`mailto:${profile.email}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border-default bg-surface px-3 py-1.5 text-xs font-medium text-secondary hover:border-border-default hover:text-primary"
              >
                <Mail className="h-3.5 w-3.5" />
                Email
              </a>
              <a
                href={`mailto:${profile.email}?subject=1:1%20%40%20Wamiro`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border-default bg-surface px-3 py-1.5 text-xs font-medium text-secondary hover:border-border-default hover:text-primary"
              >
                <Calendar className="h-3.5 w-3.5" />
                Schedule 1:1
              </a>
              {canSendKudos ? (
                <Link
                  href="/people/recognition"
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-hover"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Send kudos
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div role="tablist" aria-label="Profile sections" className="flex gap-1 border-b border-border-subtle">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={tabHrefs(profile.userId, t.key)}
            role="tab"
            aria-selected={active === t.key}
            className={cx(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition",
              active === t.key
                ? "border-brand text-primary"
                : "border-transparent text-secondary hover:text-primary",
            )}
          >
            {t.label}
            {t.key === "attendance" && workspace ? (
              <span className="ml-1.5 rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] tabular-nums text-tertiary">
                {workspace.attendance.length}
              </span>
            ) : null}
            {t.key === "leave" && workspace ? (
              <span className="ml-1.5 rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] tabular-nums text-tertiary">
                {workspace.leave.length}
              </span>
            ) : null}
          </Link>
        ))}
      </div>

      {active === "overview" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            {/* At-a-glance facts grid */}
            <section aria-label="At a glance" className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border-subtle bg-border-subtle sm:grid-cols-3">
              <FactCell icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={profile.email} />
              <FactCell
                icon={<Users className="h-3.5 w-3.5" />}
                label="Department"
                value={profile.departmentName ?? "—"}
              />
              <FactCell
                icon={<UserCheck className="h-3.5 w-3.5" />}
                label="Reports to"
                value={profile.managerName ?? "—"}
                href={profile.managerId ? `/people/${profile.managerId}` : undefined}
              />
              <FactCell
                icon={<Briefcase className="h-3.5 w-3.5" />}
                label="Title"
                value={profile.jobTitle ?? "—"}
              />
              <FactCell
                icon={<Clock3 className="h-3.5 w-3.5" />}
                label="Time at company"
                value={tenure ?? "—"}
              />
              <FactCell
                icon={<MapPin className="h-3.5 w-3.5" />}
                label="Status"
                value={profile.status}
                tone={profile.status === "active" ? "success" : profile.status === "suspended" ? "danger" : "warning"}
              />
            </section>

            {/* Custom fields */}
            {customDefs.length > 0 ? (
              <section
                aria-label="Profile details"
                className="rounded-lg border border-border-subtle bg-surface"
              >
                <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-tertiary">
                    Profile details
                  </h2>
                  {canEditFields ? (
                    <button
                      type="button"
                      onClick={() => setEditing((v) => !v)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-text hover:underline"
                    >
                      <Pencil className="h-3 w-3" />
                      {editing ? "Done" : "Edit"}
                    </button>
                  ) : null}
                </div>
                <CustomFieldsEditor
                  defs={customDefs}
                  values={customValues}
                  editing={editing}
                  canEdit={canEditFields}
                />
              </section>
            ) : null}

            {/* Direct reports */}
            {canSeeExtras && reports.length > 0 ? (
              <section
                aria-label="Direct reports"
                className="rounded-lg border border-border-subtle bg-surface"
              >
                <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-tertiary">
                    Direct reports
                  </h2>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
                    {reports.length}
                  </span>
                </div>
                <ul className="grid grid-cols-1 gap-px bg-border-subtle sm:grid-cols-2">
                  {reports.map((r) => (
                    <li key={r.userId} className="bg-surface">
                      <Link
                        href={`/people/${r.userId}`}
                        className="group flex items-center gap-3 px-4 py-2.5 transition hover:bg-surface-hover"
                      >
                        <Avatar name={r.name} src={r.avatarUrl ?? undefined} className="!h-8 !w-8 text-xs" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-primary">{r.name}</p>
                          <p className="truncate text-xs text-tertiary">
                            {r.jobTitle ?? "—"}
                            {r.departmentName ? ` · ${r.departmentName}` : ""}
                          </p>
                        </div>
                        <ChevronLeft
                          className="h-3.5 w-3.5 rotate-180 text-tertiary transition group-hover:translate-x-0.5 group-hover:text-primary"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* Lifecycle timeline */}
            {canSeeExtras && timeline.events.length > 0 ? (
              <section
                aria-label="Lifecycle timeline"
                className="rounded-lg border border-border-subtle bg-surface p-4"
              >
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-tertiary">
                  Lifecycle
                </h2>
                <LifecycleTimeline events={timeline.events} />
              </section>
            ) : null}
          </div>

          {/* Right rail — at-a-glance + quick links */}
          <aside className="space-y-4">
            <RightCard title="At a glance">
              <dl className="space-y-2 text-sm">
                <RightRow icon={<Mail className="h-3.5 w-3.5" />} label="Email">
                  <a
                    href={`mailto:${profile.email}`}
                    className="block truncate text-primary hover:underline"
                  >
                    {profile.email}
                  </a>
                </RightRow>
                <RightRow icon={<Users className="h-3.5 w-3.5" />} label="Department">
                  {profile.departmentName ?? "—"}
                </RightRow>
                <RightRow icon={<UserCheck className="h-3.5 w-3.5" />} label="Reports to">
                  {profile.managerName ? (
                    <Link href={`/people/${profile.managerId}`} className="text-primary hover:underline">
                      {profile.managerName}
                    </Link>
                  ) : (
                    "—"
                  )}
                </RightRow>
                <RightRow icon={<Clock3 className="h-3.5 w-3.5" />} label="Started">
                  {profile.hiredAt
                    ? new Date(profile.hiredAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : "—"}
                </RightRow>
                <RightRow icon={<Briefcase className="h-3.5 w-3.5" />} label="Title">
                  {profile.jobTitle ?? "—"}
                </RightRow>
              </dl>
            </RightCard>

            {canSeeExtras ? (
              <RightCard title="This person">
                <ul className="space-y-1.5 text-sm">
                  <li>
                    <Link
                      href="/approvals"
                      className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-surface-hover"
                    >
                      <span className="text-secondary">Approvals</span>
                      <ChevronLeft className="h-3.5 w-3.5 rotate-180 text-tertiary" aria-hidden />
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/attendance"
                      className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-surface-hover"
                    >
                      <span className="text-secondary">Attendance</span>
                      <ChevronLeft className="h-3.5 w-3.5 rotate-180 text-tertiary" aria-hidden />
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/leave"
                      className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-surface-hover"
                    >
                      <span className="text-secondary">Leave</span>
                      <ChevronLeft className="h-3.5 w-3.5 rotate-180 text-tertiary" aria-hidden />
                    </Link>
                  </li>
                </ul>
              </RightCard>
            ) : null}
          </aside>
        </div>
      )}

      {active === "attendance" && workspace && (
        <AttendanceSection items={workspace.attendance} />
      )}
      {active === "leave" && workspace && (
        <LeaveSection items={workspace.leave} />
      )}

      <p className="text-center text-[11px] text-tertiary">
        Sensitive details stay hidden until those modules ship, and only with explicit permissions.
      </p>
    </div>
  );
}

function FactCell({
  icon,
  label,
  value,
  href,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
  tone?: "success" | "warning" | "danger";
}) {
  const inner = (
    <div className="flex flex-col gap-1 bg-surface px-4 py-3">
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
        {icon}
        {label}
      </span>
      <span
        className={cx(
          "truncate text-sm font-medium",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-danger",
          !tone && "text-primary",
        )}
      >
        {value}
      </span>
    </div>
  );
  return href ? (
    <Link href={href} className="transition hover:bg-surface-hover">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function RightCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border-subtle bg-surface">
      <div className="border-b border-border-subtle px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-tertiary">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function RightRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-tertiary" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
          {label}
        </p>
        <p className="truncate">{children}</p>
      </div>
    </div>
  );
}

function LifecycleTimeline({ events }: { events: TimelineEvent[] }) {
  // Group by year for scannability.
  const byYear = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    const year = ev.at ? new Date(ev.at).getUTCFullYear().toString() : "—";
    const arr = byYear.get(year) ?? [];
    arr.push(ev);
    byYear.set(year, arr);
  }
  const years = Array.from(byYear.keys()).sort((a, b) => Number(b) - Number(a));
  return (
    <ol className="relative space-y-6 pl-6 before:absolute before:bottom-0 before:left-2 before:top-2 before:w-px before:bg-border-subtle">
      {years.map((y) => (
        <li key={y} className="relative">
          <p className="mb-2 -ml-6 inline-block rounded-r-md bg-surface pl-6 pr-2 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
            {y}
          </p>
          <ul className="space-y-2">
            {byYear.get(y)!.map((ev, i) => (
              <li key={`${y}:${i}`} className="relative pl-4">
                <span
                  className="absolute -left-0.5 top-1.5 inline-block h-2 w-2 rounded-full bg-brand ring-2 ring-surface"
                  aria-hidden
                />
                <p className="text-sm text-primary">
                  {ev.label}
                  {ev.detail ? (
                    <span className="text-tertiary"> · {ev.detail}</span>
                  ) : null}
                </p>
                <p className="text-[10px] tabular-nums text-tertiary">
                  {ev.at ? new Date(ev.at).toLocaleDateString() : ""}
                </p>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function AttendanceSection({ items }: { items: { clockIn: Date; clockOut: Date | null }[] }) {
  if (items.length === 0) {
    return (
      <EmptyState title="No attendance records" hint="Clock-in events for this person will appear here." />
    );
  }
  return (
    <ul className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
      {items.map((a, i) => {
        const inTime = new Date(a.clockIn);
        const outTime = a.clockOut ? new Date(a.clockOut) : null;
        const durationMs = outTime ? outTime.getTime() - inTime.getTime() : null;
        const hours = durationMs ? Math.round(durationMs / 3_600_000) : null;
        return (
          <li
            key={i}
            className={cx(
              "flex items-center justify-between gap-3 px-4 py-3 text-sm",
              i > 0 && "border-t border-border-subtle",
            )}
          >
            <div className="min-w-0">
              <p className="font-medium text-primary">
                {inTime.toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </p>
              <p className="text-xs text-tertiary tabular-nums">
                {inTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                {outTime
                  ? ` → ${outTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : " · open"}
              </p>
            </div>
            <div className="text-right">
              {hours != null ? (
                <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-xs font-medium tabular-nums text-primary">
                  {hours}h
                </span>
              ) : (
                <Badge tone="amber">open</Badge>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function LeaveSection({
  items,
}: {
  items: { typeName: string; startDate: string; endDate: string; status: string; days: string }[];
}) {
  if (items.length === 0) {
    return <EmptyState title="No leave requests" hint="When this person takes leave, it'll show up here." />;
  }
  return (
    <ul className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
      {items.map((l, i) => (
        <li
          key={i}
          className={cx(
            "flex items-center justify-between gap-3 px-4 py-3 text-sm",
            i > 0 && "border-t border-border-subtle",
          )}
        >
          <div className="min-w-0">
            <p className="font-medium text-primary">
              {l.typeName}
              <span className="ml-2 text-xs font-normal text-tertiary">{l.days}d</span>
            </p>
            <p className="text-xs text-tertiary tabular-nums">
              {l.startDate} → {l.endDate}
            </p>
          </div>
          <Badge
            tone={
              l.status === "approved"
                ? "green"
                : l.status === "rejected"
                  ? "red"
                  : l.status === "cancelled"
                    ? "neutral"
                    : "amber"
            }
          >
            {l.status}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function tenureLabel(hiredAt: string | null): string | null {
  if (!hiredAt) return null;
  const t = new Date(hiredAt).getTime();
  if (!Number.isFinite(t)) return null;
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days < 0) return null;
  if (days < 60) return `${days} day${days === 1 ? "" : "s"} at company`;
  if (days < 365 * 2) {
    const months = Math.floor(days / 30);
    return `${months} month${months === 1 ? "" : "s"} at company`;
  }
  const years = Math.floor(days / 365);
  const remMonths = Math.floor((days % 365) / 30);
  return `${years}y${remMonths > 0 ? ` ${remMonths}m` : ""} at company`;
}

// Inline custom-fields editor (display + edit) so the page stays
// self-contained.
function CustomFieldsEditor({
  defs,
  values,
  editing,
  canEdit,
}: {
  defs: CustomFieldDef[];
  values: CustomValues;
  editing: boolean;
  canEdit: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const [state, setState] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const d of defs) {
      const v = values[d.fieldKey];
      out[d.fieldKey] = v === null || v === undefined ? "" : String(v);
    }
    return out;
  });

  if (defs.length === 0) {
    return <p className="px-4 py-3 text-sm text-tertiary">No profile details yet.</p>;
  }

  async function save() {
    setBusy(true);
    try {
      const fd = new FormData();
      for (const d of defs) {
        if (state[d.fieldKey] !== undefined) {
          fd.set(d.fieldKey, state[d.fieldKey]!);
        }
      }
      const res = await fetch("/api/v1/people/custom-fields", {
        method: "POST",
        body: fd,
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (editing && canEdit) {
    return (
      <div className="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {defs.map((d) => (
            <label key={d.id} className="text-xs font-medium text-secondary">
              {d.label}
              {d.type === "textarea" ? (
                <textarea
                  className="mt-1 w-full rounded-md border border-border-default bg-surface px-2.5 py-1.5 text-sm"
                  value={state[d.fieldKey] ?? ""}
                  onChange={(e) =>
                    setState((s) => ({ ...s, [d.fieldKey]: e.target.value }))
                  }
                />
              ) : d.type === "select" ? (
                <select
                  className="mt-1 w-full rounded-md border border-border-default bg-surface px-2.5 py-1.5 text-sm"
                  value={state[d.fieldKey] ?? ""}
                  onChange={(e) =>
                    setState((s) => ({ ...s, [d.fieldKey]: e.target.value }))
                  }
                >
                  <option value="">—</option>
                  {(d.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={d.type === "date" ? "date" : d.type === "number" ? "number" : "text"}
                  className="mt-1 w-full rounded-md border border-border-default bg-surface px-2.5 py-1.5 text-sm"
                  value={state[d.fieldKey] ?? ""}
                  onChange={(e) =>
                    setState((s) => ({ ...s, [d.fieldKey]: e.target.value }))
                  }
                />
              )}
            </label>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand hover:bg-brand-hover disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border-subtle">
      {defs.map((d) => {
        const raw = state[d.fieldKey];
        const display =
          raw && d.type === "select" && d.options
            ? d.options.find((o) => o.value === raw)?.label ?? raw
            : raw;
        return (
          <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="text-tertiary">{d.label}</span>
            <span className="font-medium text-primary">
              {display ? display : <span className="text-tertiary">—</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
