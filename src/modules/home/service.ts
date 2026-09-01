import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/session";
import {
  announcements,
  attendanceRecords,
  budgets,
  departments,
  employees,
  holidays,
  journeyItems,
  journeys,
  leaveRequests,
  purchaseRequests,
  recognitions,
  requestTypes,
  requests,
  sessions,
  tasks,
  users,
} from "@/db/schema";
import { can, widestScope } from "@/modules/iam/engine";

/** R4 §14: operating personas derived from EFFECTIVE permissions, not labels. */
export type Persona = "executive" | "hr" | "manager" | "admin" | "employee";

/**
 * A single thing the user should look at. The hero panel surfaces
 * the top 3 of these; the rest are hidden until the user expands
 * the panel.
 */
export interface AttentionItem {
  kind: "approval_leave" | "approval_request" | "my_pending" | "task_due" | "open_shift";
  label: string;
  detail: string;
  href: string;
  tone: "neutral" | "amber" | "red" | "green" | "brand";
  count?: number;
}

export interface DayCell {
  /** ISO YYYY-MM-DD */
  date: string;
  /** True for today (for highlighting) */
  isToday: boolean;
  /** Day-of-month 1-31 */
  day: number;
  /** Names of teammates out on this day */
  outNames: string[];
  /** True if the user themselves is out (leave or holiday) */
  userOut: boolean;
  /** True if this day is a company-wide holiday */
  isHoliday: boolean;
  /** Holiday name, if any */
  holidayName?: string;
}

export type ActivityKind =
  | "leave_submitted"
  | "leave_approved"
  | "leave_rejected"
  | "leave_canceled"
  | "request_submitted"
  | "request_approved"
  | "request_rejected"
  | "announcement"
  | "recognition_given"
  | "recognition_received";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  /** ISO timestamp */
  at: string;
  /** Primary actor's display name */
  actorName: string;
  /** Secondary text (the other person, the leave dates, the announcement title) */
  detail: string;
  href: string;
}

export interface HomeSummary {
  openShift: { id: string; clockIn: Date } | null;
  myPending: number;
  pendingApprovals: number;
  teamSize: number;
  clockedIn: number;
  recentActivity: { id: string; userName: string; status: string; startDate: string; createdAt: Date }[];
  recentAnnouncements: { id: string; title: string; publishedAt: Date }[];
  personas: Persona[];
  department?: string | null;
  jobTitle?: string | null;
  myTasks?: number;
  pendingLeave?: number;
  pendingRequests?: number;
  whoIsOutToday?: { userId: string; name: string }[];
  headcount?: number;
  openJourneys?: number;
  journeyItemsDue?: number;
  budgetWarnings?: { id: string; name: string; amountCents: number; spentCents: number; currency: string }[];
  openPurchases?: number;
  usersTotal?: number;
  liveSessions?: number;
  // m14+ new sections
  attention: AttentionItem[];
  week: DayCell[];
  activity: ActivityItem[];
  personalStatus: {
    hoursTodayMinutes: number;
    hoursTodayLabel: string;
    streakDays: number;
    nextHolidayName: string | null;
    nextHolidayIn: number | null;
    nextHolidayLabel: string;
  };
}

export function personasFor(ctx: AuthContext): Persona[] {
  const out: Persona[] = [];
  if (can(ctx.access, "analytics.view_company")) out.push("executive");
  if (can(ctx.access, "employees.edit") || can(ctx.access, "lifecycle.manage") || can(ctx.access, "recruitment.manage"))
    out.push("hr");
  if (can(ctx.access, "attendance.view_team") || can(ctx.access, "leave.view_team")) out.push("manager");
  if (can(ctx.access, "users.manage") || can(ctx.access, "roles.manage")) out.push("admin");
  out.push("employee");
  return [...new Set(out)];
}

/** Aggregated home-page payload for the authenticated user. All scoped to org + permissions. */
export async function homeSummary(ctx: AuthContext): Promise<HomeSummary> {
  const orgId = ctx.user.organizationId;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [openShift] = await db
    .select({ id: attendanceRecords.id, clockIn: attendanceRecords.clockIn })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.userId, ctx.user.id),
        eq(attendanceRecords.organizationId, orgId),
        sql`${attendanceRecords.clockOut} IS NULL`,
      ),
    )
    .limit(1);

  const [myPending] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.organizationId, orgId),
        eq(leaveRequests.userId, ctx.user.id),
        eq(leaveRequests.status, "pending"),
      ),
    );

  let pendingApprovals = 0;
  if (can(ctx.access, "leave.approve")) {
    const scope = widestScope(ctx.access, "leave.approve");
    const companyWide = scope === "COMPANY" || scope === "GLOBAL";
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(leaveRequests)
      .where(
        companyWide
          ? and(eq(leaveRequests.organizationId, orgId), eq(leaveRequests.status, "pending"))
          : and(
              eq(leaveRequests.organizationId, orgId),
              eq(leaveRequests.status, "pending"),
              sql`${leaveRequests.userId} IN (SELECT user_id FROM employees WHERE manager_user_id = ${ctx.user.id})`,
            ),
      );
    pendingApprovals = row?.count ?? 0;
  }

  const [teamSize] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(employees)
    .where(eq(employees.managerUserId, ctx.user.id));

  const [clockedIn] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.organizationId, orgId),
        sql`${attendanceRecords.clockOut} IS NULL`,
        gte(attendanceRecords.clockIn, startOfDay),
      ),
    );

  const recentActivity = await db
    .select({
      id: leaveRequests.id,
      userName: users.name,
      status: leaveRequests.status,
      startDate: leaveRequests.startDate,
      createdAt: leaveRequests.createdAt,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(users.id, leaveRequests.userId))
    .where(
      and(
        eq(leaveRequests.organizationId, orgId),
        can(ctx.access, "leave.approve")
          ? sql`(${leaveRequests.userId} = ${ctx.user.id} OR ${leaveRequests.userId} IN (
              SELECT user_id FROM employees WHERE manager_user_id = ${ctx.user.id}
            ))`
          : eq(leaveRequests.userId, ctx.user.id),
      ),
    )
    .orderBy(desc(leaveRequests.createdAt))
    .limit(6);

  const recentAnnouncements = await db
    .select({
      id: announcements.id,
      title: announcements.title,
      publishedAt: announcements.publishedAt,
    })
    .from(announcements)
    .where(eq(announcements.organizationId, orgId))
    .orderBy(desc(announcements.publishedAt))
    .limit(3);

  // R4: department-scoped identity (§13) + role-materialized sections (§14)
  const [empRow] = await db
    .select({ dept: departments.name, jobTitle: employees.jobTitle })
    .from(employees)
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .where(and(eq(employees.userId, ctx.user.id), eq(employees.organizationId, orgId)))
    .limit(1);

  const personas = personasFor(ctx);
  const extra: Omit<Partial<HomeSummary>, "personas"> = {
    department: empRow?.dept ?? null,
    jobTitle: empRow?.jobTitle ?? null,
  };

  // BambooHR-style "who's out today": approved leave spanning today.
  const whoIsOutToday = await db
    .select({ userId: leaveRequests.userId, name: users.name })
    .from(leaveRequests)
    .innerJoin(users, eq(users.id, leaveRequests.userId))
    .where(
      and(
        eq(leaveRequests.organizationId, orgId),
        eq(leaveRequests.status, "approved"),
        sql`CURRENT_DATE BETWEEN ${leaveRequests.startDate} AND ${leaveRequests.endDate}`,
      ),
    )
    .limit(5);
  extra.whoIsOutToday = whoIsOutToday;

  if (personas.includes("manager")) {
    const [pl] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.organizationId, orgId),
          eq(leaveRequests.status, "pending"),
          sql`${leaveRequests.userId} IN (SELECT user_id FROM employees WHERE manager_user_id = ${ctx.user.id})`,
        ),
      );
    const [pr] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(requests)
      .where(
        and(
          eq(requests.organizationId, orgId),
          eq(requests.status, "pending"),
          sql`${requests.requesterId} IN (SELECT user_id FROM employees WHERE manager_user_id = ${ctx.user.id})`,
        ),
      );
    extra.pendingLeave = pl?.c ?? 0;
    extra.pendingRequests = pr?.c ?? 0;
  }

  const [myOpen] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(tasks)
    .where(
      and(
        eq(tasks.organizationId, orgId),
        eq(tasks.assigneeId, ctx.user.id),
        inArray(tasks.status, ["todo", "in_progress", "blocked"]),
      ),
    );
  extra.myTasks = myOpen?.c ?? 0;

  if (personas.includes("hr")) {
    const [hc] = await db.select({ c: sql<number>`count(*)::int` }).from(users).where(and(eq(users.organizationId, orgId), eq(users.status, "active")));
    const [oj] = await db.select({ c: sql<number>`count(*)::int` }).from(journeys).where(and(eq(journeys.organizationId, orgId), eq(journeys.status, "open")));
    const [ji] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(journeyItems)
      .innerJoin(journeys, eq(journeys.id, journeyItems.journeyId))
      .where(and(eq(journeys.organizationId, orgId), eq(journeys.status, "open"), eq(journeyItems.done, false)));
    extra.headcount = hc?.c ?? 0;
    extra.openJourneys = oj?.c ?? 0;
    extra.journeyItemsDue = ji?.c ?? 0;
  }

  if (personas.includes("executive")) {
    const hot = await db
      .select({ id: budgets.id, name: budgets.name, amountCents: budgets.amountCents, spentCents: budgets.spentCents, currency: budgets.currency })
      .from(budgets)
      .where(and(eq(budgets.organizationId, orgId), sql`${budgets.spentCents} >= ${budgets.amountCents} * 80 / 100`))
      .limit(4);
    const [po] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(purchaseRequests)
      .where(and(eq(purchaseRequests.organizationId, orgId), inArray(purchaseRequests.status, ["submitted", "approved", "ordered"])));
    extra.budgetWarnings = hot;
    extra.openPurchases = po?.c ?? 0;
  }

  if (personas.includes("admin")) {
    const [u] = await db.select({ c: sql<number>`count(*)::int` }).from(users).where(eq(users.organizationId, orgId));
    const [live] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(users.organizationId, orgId), sql`${sessions.expiresAt} > now()`));
    extra.usersTotal = u?.c ?? 0;
    extra.liveSessions = live?.c ?? 0;
  }

  // ────────────────────────────────────────────────────────────────────
  // m14 v2 — Personal status: hours worked today, current shift,
  // streak (consecutive days clocked in), next holiday.
  // Drives the hero identity card on the new home layout.
  // ────────────────────────────────────────────────────────────────────
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const [hoursTodayRow] = await db
    .select({
      minutes: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(${attendanceRecords.clockOut}, now()) - ${attendanceRecords.clockIn}))/60)::int, 0)`,
    })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.organizationId, orgId),
        eq(attendanceRecords.userId, ctx.user.id),
        gte(attendanceRecords.clockIn, todayStart),
      ),
    );
  const hoursTodayMinutes = Number(hoursTodayRow?.minutes ?? 0);
  const hoursTodayLabel =
    hoursTodayMinutes < 1
      ? "0h today"
      : `${Math.floor(hoursTodayMinutes / 60)}h ${hoursTodayMinutes % 60}m today`;

  // Streak: count consecutive days back from today with at least one
  // clock-in, stopping at the first gap.
  const streakDays = await computeStreak(orgId, ctx.user.id);

  // Next holiday: the soonest org holiday strictly after today.
  const todayIso = new Date().toISOString().slice(0, 10);
  const [nextHoliday] = await db
    .select({ name: holidays.name, date: holidays.date })
    .from(holidays)
    .where(and(eq(holidays.organizationId, orgId), sql`${holidays.date} > ${todayIso}`))
    .orderBy(asc(holidays.date))
    .limit(1);
  const nextHolidayDays = nextHoliday
    ? Math.max(0, Math.round((new Date(nextHoliday.date).getTime() - Date.now()) / 86400000))
    : null;
  const nextHolidayLabel = nextHoliday
    ? `${nextHoliday.name} in ${nextHolidayDays}d`
    : "No upcoming holidays";

  const personalStatus = {
    hoursTodayMinutes,
    hoursTodayLabel,
    streakDays,
    nextHolidayName: nextHoliday?.name ?? null,
    nextHolidayIn: nextHolidayDays,
    nextHolidayLabel,
  };

  // ────────────────────────────────────────────────────────────────────
  // m14 — "Needs your attention" panel.
  // Pulls the top 3 actionable items in priority order: open shift
  // first (you can't get a productive day in without clocking in),
  // then approvals waiting on you, then your own pending leave, then
  // tasks due today.
  // ────────────────────────────────────────────────────────────────────
  const attention: AttentionItem[] = [];

  if (openShift) {
    const since = Math.max(1, Math.floor((Date.now() - new Date(openShift.clockIn).getTime()) / 3_600_000));
    attention.push({
      kind: "open_shift",
      label: "You're clocked in",
      detail: `Open shift for ${since} hour${since === 1 ? "" : "s"} — don't forget to clock out`,
      href: "/attendance",
      tone: "amber",
    });
  }

  if (can(ctx.access, "leave.approve") && (extra.pendingLeave ?? 0) > 0) {
    attention.push({
      kind: "approval_leave",
      label: `${extra.pendingLeave} leave request${(extra.pendingLeave ?? 0) === 1 ? "" : "s"} to review`,
      detail: "From your direct reports",
      href: "/approvals",
      tone: "amber",
      count: extra.pendingLeave,
    });
  }
  if (can(ctx.access, "requests.approve") && (extra.pendingRequests ?? 0) > 0) {
    attention.push({
      kind: "approval_request",
      label: `${extra.pendingRequests} request${(extra.pendingRequests ?? 0) === 1 ? "" : "s"} to review`,
      detail: "From your direct reports",
      href: "/approvals",
      tone: "amber",
      count: extra.pendingRequests,
    });
  }

  if ((myPending?.count ?? 0) > 0) {
    attention.push({
      kind: "my_pending",
      label: `${myPending!.count} leave request${myPending!.count === 1 ? "" : "s"} pending`,
      detail: "Waiting for your manager",
      href: "/leave",
      tone: "neutral",
      count: myPending!.count,
    });
  }

  // Tasks due today (or overdue) — pulled only if the work module is on.
  if (isModuleEnabled(ctx.org.modules, "work")) {
    const todayIso = new Date().toISOString().slice(0, 10);
    const [dueToday] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, orgId),
          eq(tasks.assigneeId, ctx.user.id),
          inArray(tasks.status, ["todo", "in_progress"]),
          sql`(${tasks.dueDate} IS NOT NULL AND ${tasks.dueDate} <= ${todayIso})`,
        ),
      );
    if (dueToday && dueToday.c > 0) {
      attention.push({
        kind: "task_due",
        label: `${dueToday.c} task${dueToday.c === 1 ? "" : "s"} due today`,
        detail: "Open work waiting on you",
        href: "/my-work",
        tone: "red",
        count: dueToday.c,
      });
    }
  }

  // Top 3 only — keep the hero scannable.
  const attentionTop3 = attention.slice(0, 3);

  // ────────────────────────────────────────────────────────────────────
  // m14 — "This week" 5-day mini-calendar.
  // Shows the user's own leave, the team's OOO days, and any holidays
  // for the current week (Mon–Fri in the org's local timezone).
  // ────────────────────────────────────────────────────────────────────
  const week = await computeWeek(ctx);

  // ────────────────────────────────────────────────────────────────────
  // m14 — Multi-domain activity timeline. Replaces the leave-only
  // "Recent leave activity" with a unified feed of the last 8
  // events across leave, generic requests, announcements, and
  // recognitions.
  // ────────────────────────────────────────────────────────────────────
  const activity = await computeActivity(ctx);

  return {
    personas,
    openShift: openShift ?? null,
    myPending: myPending?.count ?? 0,
    pendingApprovals,
    teamSize: teamSize?.count ?? 0,
    clockedIn: clockedIn?.count ?? 0,
    recentActivity,
    recentAnnouncements,
    attention: attentionTop3,
    week,
    activity,
    personalStatus,
    ...extra,
  };
}

/** Tiny module-enabled check, duplicated locally to avoid a circular import. */
function isModuleEnabled(orgModules: unknown, key: string): boolean {
  if (!orgModules || typeof orgModules !== "object") return false;
  const m = (orgModules as Record<string, unknown>)[key];
  return m === true || m === "true" || m === 1 || m === "1";
}

/** Consecutive days with at least one attendance row, ending today. */
async function computeStreak(orgId: string, userId: string): Promise<number> {
  // Fetch the last 30 days of distinct clock-in dates for the user.
  // Walk back from today; stop at the first gap.
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);
  const sinceIso = since.toISOString().slice(0, 10);
  const rows = await db
    .select({ d: sql<string>`to_char(${attendanceRecords.clockIn}::date, 'YYYY-MM-DD')` })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.organizationId, orgId),
        eq(attendanceRecords.userId, userId),
        sql`${attendanceRecords.clockIn}::date >= ${sinceIso}::date`,
      ),
    )
    .groupBy(sql`${attendanceRecords.clockIn}::date`);
  const days = new Set((rows as unknown as { d: string }[]).map((r) => r.d));
  let streak = 0;
  const cursor = new Date();
  for (;;) {
    const iso = cursor.toISOString().slice(0, 10);
    if (days.has(iso)) {
      streak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    } else {
      // Allow today to be missing (user hasn't clocked in yet) — start
      // counting from yesterday in that case.
      if (streak === 0 && iso === new Date().toISOString().slice(0, 10)) {
        cursor.setUTCDate(cursor.getUTCDate() - 1);
        const yIso = cursor.toISOString().slice(0, 10);
        if (days.has(yIso)) {
          streak += 1;
          cursor.setUTCDate(cursor.getUTCDate() - 1);
          continue;
        }
      }
      break;
    }
  }
  return streak;
}

/** Build the Mon–Fri calendar strip for the current week, in UTC. */
async function computeWeek(ctx: AuthContext): Promise<DayCell[]> {
  const orgId = ctx.user.organizationId;
  const now = new Date();
  // Anchor on Monday of the current week (UTC). `getUTCDay()` returns
  // 0 (Sun) - 6 (Sat); we want Mon as the start.
  const dow = now.getUTCDay();
  const offsetToMonday = (dow + 6) % 7;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - offsetToMonday);
  monday.setUTCHours(0, 0, 0, 0);
  const friday = new Date(monday);
  friday.setUTCDate(monday.getUTCDate() + 4);
  friday.setUTCHours(23, 59, 59, 999);

  const dayIso = (d: Date) => d.toISOString().slice(0, 10);

  const [ownLeave, teamLeave, orgHolidays] = await Promise.all([
    // User's own approved leave overlapping the week
    db
      .select({ startDate: leaveRequests.startDate, endDate: leaveRequests.endDate })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.organizationId, orgId),
          eq(leaveRequests.userId, ctx.user.id),
          eq(leaveRequests.status, "approved"),
          sql`${leaveRequests.startDate} <= ${dayIso(friday)}`,
          sql`${leaveRequests.endDate} >= ${dayIso(monday)}`,
        ),
      ),
    // Other people's approved leave overlapping the week (so we can
    // show who is out on each day)
    db
      .select({
        userId: leaveRequests.userId,
        name: users.name,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
      })
      .from(leaveRequests)
      .innerJoin(users, eq(users.id, leaveRequests.userId))
      .where(
        and(
          eq(leaveRequests.organizationId, orgId),
          eq(leaveRequests.status, "approved"),
          sql`${leaveRequests.userId} != ${ctx.user.id}`,
          sql`${leaveRequests.startDate} <= ${dayIso(friday)}`,
          sql`${leaveRequests.endDate} >= ${dayIso(monday)}`,
        ),
      )
      .limit(100),
    // Company-wide holidays
    db
      .select({ name: holidays.name, date: holidays.date })
      .from(holidays)
      .where(
        and(
          eq(holidays.organizationId, orgId),
          sql`${holidays.date} >= ${dayIso(monday)}`,
          sql`${holidays.date} <= ${dayIso(friday)}`,
        ),
      ),
  ]);

  const days: DayCell[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    const iso = dayIso(d);
    const holiday = orgHolidays.find((h) => h.date === iso);
    const outNames = teamLeave
      .filter((l) => l.startDate <= iso && l.endDate >= iso)
      .map((l) => l.name)
      .slice(0, 3);
    const userOut = ownLeave.some((l) => l.startDate <= iso && l.endDate >= iso);
    days.push({
      date: iso,
      isToday: iso === dayIso(now),
      day: d.getUTCDate(),
      outNames,
      userOut,
      isHoliday: !!holiday,
      holidayName: holiday?.name,
    });
  }
  return days;
}

/** Last 8 events across leave, requests, announcements, recognitions. */
async function computeActivity(ctx: AuthContext): Promise<ActivityItem[]> {
  const orgId = ctx.user.organizationId;

  // Pull a small batch from each domain. The cap is 4 per source so
  // 4 sources × 4 = 16 candidates, then we trim to 8 newest.
  const [leave, reqs, ann, recs] = await Promise.all([
    db
      .select({
        id: leaveRequests.id,
        status: leaveRequests.status,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
        createdAt: leaveRequests.createdAt,
        userName: users.name,
      })
      .from(leaveRequests)
      .innerJoin(users, eq(users.id, leaveRequests.userId))
      .where(
        and(
          eq(leaveRequests.organizationId, orgId),
          // only the user's own activity (so we don't leak
          // "Alice submitted leave" to Bob, who shouldn't see that)
          eq(leaveRequests.userId, ctx.user.id),
        ),
      )
      .orderBy(desc(leaveRequests.createdAt))
      .limit(4),
    db
      .select({
        id: requests.id,
        status: requests.status,
        typeName: requestTypes.name,
        createdAt: requests.createdAt,
        userName: users.name,
      })
      .from(requests)
      .innerJoin(users, eq(users.id, requests.requesterId))
      .leftJoin(requestTypes, eq(requestTypes.id, requests.typeId))
      .where(
        and(
          eq(requests.organizationId, orgId),
          eq(requests.requesterId, ctx.user.id),
        ),
      )
      .orderBy(desc(requests.createdAt))
      .limit(4),
    db
      .select({
        id: announcements.id,
        title: announcements.title,
        publishedAt: announcements.publishedAt,
        userName: sql<string>`NULL`.as("user_name"),
      })
      .from(announcements)
      .where(eq(announcements.organizationId, orgId))
      .orderBy(desc(announcements.publishedAt))
      .limit(4),
    db
      .select({
        id: recognitions.id,
        fromUserId: recognitions.fromUserId,
        toUserId: recognitions.toUserId,
        message: recognitions.message,
        createdAt: recognitions.createdAt,
        fromName: users.name,
        toName: sql<string>`(SELECT name FROM users WHERE id = ${recognitions.toUserId})`.as("to_name"),
      })
      .from(recognitions)
      .innerJoin(users, eq(users.id, recognitions.fromUserId))
      .where(
        and(
          eq(recognitions.organizationId, orgId),
          sql`(${recognitions.fromUserId} = ${ctx.user.id} OR ${recognitions.toUserId} = ${ctx.user.id})`,
        ),
      )
      .orderBy(desc(recognitions.createdAt))
      .limit(4),
  ]);

  const items: ActivityItem[] = [];

  for (const l of leave) {
    const kind: ActivityKind =
      l.status === "approved" ? "leave_approved"
      : l.status === "rejected" ? "leave_rejected"
      : l.status === "cancelled" ? "leave_canceled"
      : "leave_submitted";
    items.push({
      id: `leave:${l.id}`,
      kind,
      at: l.createdAt.toISOString(),
      actorName: l.userName,
      detail: `${l.startDate} → ${l.endDate}`,
      href: "/leave",
    });
  }
  for (const r of reqs) {
    const kind: ActivityKind =
      r.status === "approved" ? "request_approved"
      : r.status === "rejected" ? "request_rejected"
      : r.status === "cancelled" ? "request_submitted" // no specific kind for cancelled; fall back
      : "request_submitted";
    items.push({
      id: `req:${r.id}`,
      kind,
      at: r.createdAt.toISOString(),
      actorName: r.userName,
      detail: r.typeName ?? "Request",
      href: "/requests",
    });
  }
  for (const a of ann) {
    items.push({
      id: `ann:${a.id}`,
      kind: "announcement",
      at: a.publishedAt.toISOString(),
      actorName: a.userName ?? "Company",
      detail: a.title,
      href: "/announcements",
    });
  }
  for (const r of recs) {
    const isGiven = r.fromUserId === ctx.user.id;
    items.push({
      id: `rec:${r.id}`,
      kind: isGiven ? "recognition_given" : "recognition_received",
      at: r.createdAt.toISOString(),
      actorName: isGiven ? `You → ${r.toName ?? "teammate"}` : r.fromName,
      detail: r.message.slice(0, 100),
      href: "/people/recognition",
    });
  }

  // Sort newest first, then trim to 8.
  items.sort((a, b) => b.at.localeCompare(a.at));
  return items.slice(0, 8);
}

/** Total items waiting on this user across all approvable domains. */
export async function approvalCount(ctx: AuthContext): Promise<number> {
  const orgId = ctx.user.organizationId;
  const scope = widestScope(ctx.access, "leave.approve");
  const companyWide = scope === "COMPANY" || scope === "GLOBAL";

  const [leave] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.organizationId, orgId),
        eq(leaveRequests.status, "pending"),
        ...(companyWide
          ? []
          : [sql`${leaveRequests.userId} IN (
              SELECT user_id FROM employees WHERE manager_user_id = ${ctx.user.id}
            )`]),
      ),
    );

  const reqScope = widestScope(ctx.access, "requests.approve");
  const reqWide = reqScope === "COMPANY" || reqScope === "GLOBAL";
  const [generic] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(requests)
    .where(
      and(
        eq(requests.organizationId, orgId),
        eq(requests.status, "pending"),
        ...(reqWide
          ? []
          : [sql`${requests.requesterId} IN (
              SELECT user_id FROM employees WHERE manager_user_id = ${ctx.user.id}
            )`]),
      ),
    );

  return (leave?.count ?? 0) + (generic?.count ?? 0);
}
