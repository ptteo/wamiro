import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Flame,
  Inbox,
  ListTodo,
  PlaneTakeoff,
  Plane,
  Receipt,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import { Avatar, Badge, Card, CardHeader, EmptyState, Stat } from "@/components/ui";
import { ClockInButton } from "@/components/clock-button";
import { RoleChecklistCard } from "@/components/role-checklist-card";
import { requireAuthPage } from "@/lib/page-auth";
import { homeSummary } from "@/modules/home/service";
import { setupChecklist, type SetupStep } from "@/modules/org/service";
import { syncOnboardingState } from "@/modules/org/policies";
import { roleChecklists } from "@/modules/onboarding/checklists";
import { getMergedPreferences } from "@/modules/prefs/service";
import { can } from "@/modules/iam/engine";
import { seatOverageNotice } from "@/modules/billing/service";
import type {
  ActivityItem,
  ActivityKind,
  AttentionItem,
  DayCell,
  Persona,
} from "@/modules/home/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home" };

// ── pre-computed helpers (server-side, no client leakage) ────────────
function greetingFor(hour: number): string {
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 14) return "Lunch break";
  if (hour < 17) return "Good afternoon";
  if (hour < 19) return "Wrapping up";
  if (hour < 22) return "Good evening";
  return "Late night";
}

function toneFor(value: number, warn: number, danger: number): "neutral" | "amber" | "red" {
  if (value >= danger) return "red";
  if (value >= warn) return "amber";
  return "neutral";
}

// Compact relative time — used everywhere on the page so the format
// is consistent. Caps at "Nd ago" for > 30 days, then switches to a
// locale date so old entries don't read like "47d ago".
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

const ATTN_ICON: Record<AttentionItem["kind"], React.ReactNode> = {
  approval_leave: <ListTodo className="h-3.5 w-3.5" />,
  approval_request: <Receipt className="h-3.5 w-3.5" />,
  my_pending: <Clock3 className="h-3.5 w-3.5" />,
  task_due: <Check className="h-3.5 w-3.5" />,
  open_shift: <Plane className="h-3.5 w-3.5" />,
};

const ATTN_TONE_BG: Record<AttentionItem["tone"], string> = {
  neutral: "bg-surface-subtle text-secondary",
  brand: "bg-brand text-on-brand",
  amber: "bg-warning-subtle text-warning",
  red: "bg-danger-subtle text-danger",
  green: "bg-success-subtle text-success",
};

const ACT_ICON: Record<ActivityKind, React.ReactNode> = {
  leave_submitted: <CalendarDays className="h-3.5 w-3.5" />,
  leave_approved: <Check className="h-3.5 w-3.5" />,
  leave_rejected: <CircleAlert className="h-3.5 w-3.5" />,
  leave_canceled: <Clock3 className="h-3.5 w-3.5" />,
  request_submitted: <Receipt className="h-3.5 w-3.5" />,
  request_approved: <Check className="h-3.5 w-3.5" />,
  request_rejected: <CircleAlert className="h-3.5 w-3.5" />,
  announcement: <Bell className="h-3.5 w-3.5" />,
  recognition_given: <Sparkles className="h-3.5 w-3.5" />,
  recognition_received: <Sparkles className="h-3.5 w-3.5" />,
};

const ACT_DOT: Record<ActivityKind, string> = {
  leave_submitted: "bg-brand",
  leave_approved: "bg-success",
  leave_rejected: "bg-danger",
  leave_canceled: "bg-tertiary",
  request_submitted: "bg-brand",
  request_approved: "bg-success",
  request_rejected: "bg-danger",
  announcement: "bg-warning",
  recognition_given: "bg-warning",
  recognition_received: "bg-warning",
};

const ACT_VERB: Record<ActivityKind, string> = {
  leave_submitted: "submitted leave",
  leave_approved: "leave approved",
  leave_rejected: "leave rejected",
  leave_canceled: "leave canceled",
  request_submitted: "submitted a request",
  request_approved: "request approved",
  request_rejected: "request rejected",
  announcement: "posted an announcement",
  recognition_given: "sent recognition to",
  recognition_received: "received recognition from",
};

// ── company setup card ────────────────────────────────────────────
function SetupChecklistCard({
  steps,
  done,
  total,
}: {
  steps: SetupStep[];
  done: number;
  total: number;
}) {
  const pct = Math.round((done / total) * 100);
  return (
    <section className="rounded-xl border border-border-default bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Sparkles className="h-4 w-4 text-brand" strokeWidth={1.75} />
            Set up {""}
            <span className="font-medium text-tertiary">· {done} of {total} done</span>
          </h2>
          <p className="mt-0.5 text-xs text-tertiary">
            Finish these steps to get your company workspace ready for everyone.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden h-1.5 w-36 overflow-hidden rounded-full bg-border-subtle sm:block" aria-hidden>
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.max(6, pct)}%` }} />
          </div>
          <Link
            href="/setup"
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand px-3 text-xs font-semibold text-on-brand transition hover:opacity-90"
          >
            Continue setup
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
        </div>
      </div>
      <ol className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {steps.map((step) => (
          <li key={step.key}>
            <Link
              href={step.href}
              className="flex items-center gap-2.5 rounded-lg border border-border-subtle px-3 py-2 text-sm transition hover:border-brand/40 hover:bg-surface-hover"
            >
              <span
                className={[
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                  step.done ? "bg-success-subtle text-success" : "bg-surface-subtle text-tertiary",
                ].join(" ")}
                aria-hidden
              >
                {step.done ? <Check className="h-3 w-3" strokeWidth={2.5} /> : null}
              </span>
              <span className={step.done ? "text-tertiary line-through" : "text-primary"}>{step.label}</span>
              <ChevronRight className="ml-auto h-3.5 w-3.5 text-tertiary" strokeWidth={1.75} />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── page ───────────────────────────────────────────────────────────
export default async function HomePage() {
  const ctx = await requireAuthPage();
  const s = await homeSummary(ctx);
  const personas: Persona[] = s.personas;
  const canSee = (p: string) => can(ctx.access, p);
  const isSetupAdmin = can(ctx.access, "settings.manage") || can(ctx.access, "users.manage");
  if (isSetupAdmin) await syncOnboardingState(ctx);
  const setup = isSetupAdmin ? await setupChecklist(ctx) : null;
  const prefs = await getMergedPreferences(ctx.user.id, ctx.user.organizationId);
  const dismissed = (prefs.roleChecklist as { dismissed?: Record<string, string> } | undefined)?.dismissed ?? {};
  const checklists = (await roleChecklists(ctx)).filter((c) => !dismissed[c.role] && c.done < c.total);
  const overage =
    can(ctx.access, "settings.manage") ? await seatOverageNotice(ctx.user.organizationId) : null;

  const firstName = ctx.user.name.split(/\s+/)[0] ?? ctx.user.name;
  const now = new Date();
  const greeting = greetingFor(now.getHours());
  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // Build the right-canvas data: this week, activity, announcements.
  // All rendered as dense native lists, no card chrome.
  const todayIso = now.toISOString().slice(0, 10);
  const todayCell = s.week.find((d) => d.date === todayIso);
  const holidayThisWeek = s.week.find((d) => d.isHoliday);
  const announcements = (s.recentAnnouncements ?? []).slice(0, 3);

  // Build the rail data: pulse metrics per persona + quick actions.
  const quickActions = [
    { href: "/leave", label: "Leave" },
    { href: "/finance/expenses", label: "Expense" },
    { href: "/workplace", label: "Room" },
    { href: "/tickets", label: "Help" },
    { href: "/tasks", label: "Task" },
  ].filter((a) => {
    if (a.href === "/leave") return canSee("leave.apply");
    if (a.href === "/finance/expenses") return canSee("finance.submit");
    if (a.href === "/workplace") return canSee("workplace.book");
    if (a.href === "/tickets") return canSee("tickets.create");
    if (a.href === "/tasks") return canSee("tasks.create");
    return false;
  });

  // Pulse: a single self tab + any persona tabs the user holds.
  const pulseTabs: Array<{ id: Persona; label: string; metrics: PulseMetric[]; href: string | null }> = [
    {
      id: "employee",
      label: "You",
      metrics: [
        { label: "Open tasks", value: s.myTasks ?? 0, href: "/my-work" },
        { label: "Pending", value: s.myPending, href: "/requests" },
        { label: "Team", value: s.teamSize, href: "/people" },
      ],
      href: null,
    },
  ];
  if (personas.includes("manager")) {
    pulseTabs.push({
      id: "manager",
      label: "Team",
      metrics: [
        { label: "Leave to review", value: s.pendingLeave ?? 0, tone: toneFor(s.pendingLeave ?? 0, 1, 3), href: "/approvals" },
        { label: "Requests to review", value: s.pendingRequests ?? 0, tone: toneFor(s.pendingRequests ?? 0, 1, 3), href: "/approvals" },
        { label: "Team size", value: s.teamSize, href: "/people" },
      ],
      href: "/approvals",
    });
  }
  if (personas.includes("hr")) {
    pulseTabs.push({
      id: "hr",
      label: "HR",
      metrics: [
        { label: "Active", value: s.headcount ?? 0, href: "/people" },
        { label: "Journeys", value: s.openJourneys ?? 0, hint: `${s.journeyItemsDue ?? 0} due`, href: "/people/lifecycle" },
        { label: "Approvals", value: s.pendingApprovals, tone: toneFor(s.pendingApprovals, 1, 3), href: "/approvals" },
      ],
      href: "/people",
    });
  }
  if (personas.includes("executive")) {
    pulseTabs.push({
      id: "executive",
      label: "Company",
      metrics: [
        { label: "Workforce", value: s.headcount ?? 0, href: "/people" },
        { label: "Open POs", value: s.openPurchases ?? 0, href: "/finance/purchases" },
        { label: "Hot budgets", value: (s.budgetWarnings ?? []).length, tone: (s.budgetWarnings ?? []).length > 0 ? "amber" : "neutral", href: "/finance/budgets" },
      ],
      href: "/analytics",
    });
  }
  if (personas.includes("admin")) {
    pulseTabs.push({
      id: "admin",
      label: "Admin",
      metrics: [
        { label: "Users", value: s.usersTotal ?? 0, href: "/admin/users" },
        { label: "Sessions", value: s.liveSessions ?? 0, href: "/admin/security" },
        { label: "Approvals", value: s.pendingApprovals, tone: toneFor(s.pendingApprovals, 1, 3), href: "/approvals" },
      ],
      href: "/admin",
    });
  }

  // Status pill content
  const ps = s.personalStatus;
  const statusPillParts: string[] = [];
  if (ps.hoursTodayMinutes > 0) statusPillParts.push(ps.hoursTodayLabel);
  if (ps.streakDays > 0) statusPillParts.push(`${ps.streakDays}-day streak`);
  if (ps.nextHolidayName) statusPillParts.push(`${ps.nextHolidayName} in ${ps.nextHolidayIn}d`);
  const statusPill = statusPillParts.join(" · ");

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-8">
      {overage ? (
        <div className="rounded-lg border border-amber/40 bg-amber-subtle px-4 py-3 text-sm text-amber">
          This workspace has {overage.activeSeats} people on a plan that includes {overage.seatLimit}. Extra seats
          will appear on the next invoice.{" "}
          <Link href="/settings/billing" className="font-medium underline-offset-2 hover:underline">
            Review Plan & Billing
          </Link>
        </div>
      ) : null}
      {/* ── Company setup checklist (admins only, until complete) ─────── */}
      {setup && setup.done < setup.total ? (
        <SetupChecklistCard steps={setup.steps} done={setup.done} total={setup.total} />
      ) : null}
      {checklists.length > 0 ? <RoleChecklistCard checklists={checklists} /> : <div data-tour="home-next" className="sr-only" />}
      {/* ── Greeting row ───────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center gap-4" data-tour="home-greeting">
        <Avatar name={ctx.user.name} className="!h-11 !w-11 text-sm" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold leading-tight tracking-tight text-primary">
            {greeting}, {firstName}
          </h1>
          <p className="mt-0.5 text-xs text-tertiary">
            {dateLabel}
            {s.jobTitle ? ` · ${s.jobTitle}` : ""}
            {s.department ? ` · ${s.department}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {statusPill ? (
            <span className="hidden items-center gap-1.5 rounded-full border border-border-subtle bg-surface px-3 py-1.5 text-xs text-secondary sm:inline-flex">
              <Flame className="h-3.5 w-3.5 text-warning" aria-hidden />
              {statusPill}
            </span>
          ) : null}
          <ClockInButton openShift={s.openShift} tour="home-clock" />
        </div>
      </header>

      {/* ── Attention (only when there's something to do) ───────── */}
      {s.attention.length > 0 ? (
        <AttentionSection items={s.attention} />
      ) : (
        <p className="flex items-center gap-2 text-sm text-tertiary">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-success-subtle text-success">
            <Check className="h-3 w-3" />
          </span>
          You are all set — nothing to action right now.
        </p>
      )}

      {/* ── Two-column main layout: sticky rail + canvas ─────────── */}
      <div className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* RAIL */}
        <aside className="space-y-6 lg:sticky lg:top-4 lg:self-start">
          <PulseTabs tabs={pulseTabs} />
          {quickActions.length > 0 ? <QuickActionsPills actions={quickActions} /> : null}
          {holidayThisWeek ? <HolidayNote cell={holidayThisWeek} /> : null}
        </aside>

        {/* CANVAS */}
        <div className="min-w-0 space-y-8">
          <SectionHeader
            title="This week"
            right={
              todayCell?.outNames.length ? (
                <span className="text-xs text-tertiary">
                  {todayCell.outNames.length} out today
                </span>
              ) : null
            }
          />
          <WeekStrip days={s.week} />

          <SectionHeader
            title="Activity"
            right={
              s.activity.length > 0 ? (
                <Link href="/notifications" className="text-xs text-tertiary hover:text-primary">
                  All activity →
                </Link>
              ) : null
            }
          />
          <ActivityList items={s.activity} />

          <SectionHeader
            title="Announcements"
            right={
              announcements.length > 0 ? (
                <Link href="/announcements" className="text-xs text-tertiary hover:text-primary">
                  All →
                </Link>
              ) : null
            }
          />
          <AnnouncementsList items={announcements} />
        </div>
      </div>

      {/* ── Mobile bottom action bar (fixed, visible < md so it never covers the sidebar) ──── */}
      {quickActions.length > 0 ? (
        <MobileActionBar actions={quickActions} />
      ) : null}
    </div>
  );
}

// ── subcomponents ─────────────────────────────────────────────────────

interface PulseMetric {
  label: string;
  value: number;
  hint?: string;
  tone?: "neutral" | "amber" | "red";
  href: string;
}

function PulseTabs({ tabs }: { tabs: Array<{ id: Persona; label: string; metrics: PulseMetric[]; href: string | null }> }) {
  // Default to the first tab (always "You") — keep this server-rendered,
  // no client state.
  const first = tabs[0];
  const rest = tabs.slice(1);
  if (!first) return null;
  return (
    <Card>
      <CardHeader title="Pulse" subtitle="What needs you right now" />
      <div className="grid grid-cols-3 gap-px bg-border-subtle">
        {first.metrics.map((m, i) => (
          <PulseTile key={`${first.id}:${i}`} m={m} />
        ))}
      </div>
      {rest.length > 0 ? (
        <details className="border-t border-border-subtle text-sm">
          <summary className="cursor-pointer list-none px-4 py-2.5 text-xs font-medium text-tertiary hover:text-primary">
            More views ({rest.length})
          </summary>
          <div className="space-y-4 border-t border-border-subtle p-4">
            {rest.map((t) => (
              <div key={t.id}>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
                  {t.label}
                </p>
                <div className="grid grid-cols-3 gap-px bg-border-subtle">
                  {t.metrics.map((m, i) => (
                    <PulseTile key={`${t.id}:${i}`} m={m} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </Card>
  );
}

function PulseTile({ m }: { m: PulseMetric }) {
  const tone = m.tone ?? "neutral";
  return (
    <Link
      href={m.href}
      className="flex flex-col gap-1 bg-surface px-3 py-3 transition hover:bg-surface-hover"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
        {m.label}
      </span>
      <span
        className={[
          "text-xl font-semibold tabular-nums",
          tone === "red" && "text-danger",
          tone === "amber" && "text-warning",
          tone === "neutral" && "text-primary",
        ].join(" ")}
      >
        {m.value}
      </span>
      {m.hint ? <span className="text-[10px] text-tertiary">{m.hint}</span> : null}
    </Link>
  );
}

function QuickActionsPills({ actions }: { actions: { href: string; label: string }[] }) {
  return (
    <Card>
      <CardHeader title="Quick actions" />
      <div className="flex flex-wrap gap-2 p-4">
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="rounded-full border border-border-subtle bg-surface px-3 py-1.5 text-xs font-medium text-secondary transition hover:border-border-default hover:text-primary"
          >
            {a.label}
          </Link>
        ))}
      </div>
    </Card>
  );
}

function HolidayNote({ cell }: { cell: DayCell }) {
  return (
    <div className="rounded-lg border border-warning/20 bg-warning-subtle px-4 py-3 text-xs text-warning">
      <div className="flex items-center gap-2 font-semibold">
        <PlaneTakeoff className="h-3.5 w-3.5" />
        {cell.holidayName}
      </div>
      <p className="mt-1 text-warning/80">
        {cell.date} · this week
      </p>
    </div>
  );
}

function SectionHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between border-b border-border-subtle pb-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-tertiary">{title}</h2>
      {right}
    </div>
  );
}

function AttentionSection({ items }: { items: AttentionItem[] }) {
  return (
    <section aria-label="Needs your attention">
      <SectionHeader title="Needs your attention" />
      <ul className="mt-3 space-y-2">
        {items.map((a, i) => (
          <li key={`${a.kind}:${i}`}>
            <Link
              href={a.href}
              className="group flex items-center gap-3 rounded-md border border-border-subtle bg-surface px-4 py-3 transition hover:border-border-default hover:shadow-[0_1px_3px_rgba(16,24,40,0.06)]"
            >
              <span
                className={[
                  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                  ATTN_TONE_BG[a.tone],
                ].join(" ")}
              >
                {ATTN_ICON[a.kind]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-primary">{a.label}</p>
                <p className="truncate text-xs text-tertiary">{a.detail}</p>
              </div>
              {typeof a.count === "number" && a.count > 1 ? (
                <Badge tone={a.tone === "red" ? "red" : a.tone === "amber" ? "amber" : "neutral"}>
                  {a.count}
                </Badge>
              ) : null}
              <ChevronRight className="h-4 w-4 shrink-0 text-tertiary transition group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function WeekStrip({ days }: { days: DayCell[] }) {
  if (days.length === 0) return null;
  const todayIso = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid grid-cols-5 gap-2">
      {days.map((d, i) => {
        const dow = ["Mon", "Tue", "Wed", "Thu", "Fri"][i] ?? "";
        const isToday = d.date === todayIso;
        const outInitials = d.outNames.slice(0, 3).map((n) =>
          n.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join(""),
        );
        return (
          <div
            key={d.date}
            className={[
              "rounded-md border px-2.5 py-2.5 transition",
              isToday ? "border-brand/40 bg-brand-subtle" : "border-border-subtle bg-surface",
              d.isHoliday ? "border-warning/30 bg-warning-subtle" : "",
            ].filter(Boolean).join(" ")}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
              {dow}
            </p>
            <p className={[
              "mt-0.5 text-lg font-semibold tabular-nums",
              isToday ? "text-brand-text" : "text-primary",
            ].join(" ")}>
              {d.day}
            </p>
            {d.isHoliday ? (
              <p className="mt-1 truncate text-[10px] font-medium text-warning" title="Company holiday">
                {d.holidayName}
              </p>
            ) : d.userOut ? (
              <p className="mt-1 text-[10px] font-medium text-brand-text">You</p>
            ) : outInitials.length > 0 ? (
              <ul className="mt-1.5 flex -space-x-1">
                {outInitials.map((ini, j) => (
                  <li
                    key={j}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-surface bg-surface-subtle text-[9px] font-semibold text-secondary"
                    title={d.outNames[j]}
                  >
                    {ini}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[10px] text-tertiary/60">·</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ActivityList({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-tertiary">
        No activity yet. Submissions, approvals and announcements will appear here.
      </p>
    );
  }
  return (
    <ol className="relative space-y-3 pl-5 before:absolute before:bottom-2 before:left-1.5 before:top-2 before:w-px before:bg-border-subtle">
      {items.map((a) => (
        <li key={a.id} className="relative">
          <span
            className={[
              "absolute -left-0.5 top-1 inline-block h-2.5 w-2.5 rounded-full ring-2 ring-surface",
              ACT_DOT[a.kind],
            ].join(" ")}
            aria-hidden
          />
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-sm text-primary">
              <span className="font-medium">{a.actorName}</span>
              <span className="text-tertiary"> {ACT_VERB[a.kind]} </span>
              <span className="text-secondary">{a.detail}</span>
            </p>
            <span className="shrink-0 text-xs tabular-nums text-tertiary" title={new Date(a.at).toLocaleString()}>
              {relTime(a.at)}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function AnnouncementsList({ items }: { items: { id: string; title: string; publishedAt: Date }[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-tertiary">
        No announcements yet — when the company posts an update, it shows up here.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border-subtle border-t border-border-subtle">
      {items.map((a) => (
        <li key={a.id} className="flex items-baseline gap-3 py-2.5 text-sm">
          <Bell className="h-3.5 w-3.5 shrink-0 text-tertiary" aria-hidden />
          <p className="min-w-0 flex-1 truncate text-primary">{a.title}</p>
          <span className="shrink-0 text-xs tabular-nums text-tertiary">
            {new Date(a.publishedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MobileActionBar({ actions }: { actions: { href: string; label: string }[] }) {
  return (
    <nav
      aria-label="Quick actions"
      className="fixed inset-x-0 bottom-0 z-[var(--z-sticky)] flex justify-around border-t border-border-subtle bg-surface/95 px-2 py-2 backdrop-blur md:hidden"
    >
      {actions.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="flex flex-col items-center gap-0.5 rounded-md px-3 py-1 text-[10px] font-medium text-secondary hover:text-primary"
        >
          <span aria-hidden>·</span>
          {a.label}
        </Link>
      ))}
    </nav>
  );
}
