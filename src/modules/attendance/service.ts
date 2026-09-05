import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";

import { db, first } from "@/lib/db";
import type { AuthContext } from "@/lib/session";
import {
  attendanceRecords,
  holidays,
  shiftAssignments,
  shiftTypes,
  users,
} from "@/db/schema";
import { widestScope } from "@/modules/iam/engine";

export async function getOpenRecord(ctx: AuthContext) {
  const [row] = await db
    .select()
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.userId, ctx.user.id),
        eq(attendanceRecords.organizationId, ctx.user.organizationId),
        isNull(attendanceRecords.clockOut),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Toggle clock in/out for the current user. Clock-in attaches the shift
 * type the employee is rostered for today (if any) so reports can compare
 * planned vs actual hours.
 */
export async function clockToggle(ctx: AuthContext) {
  const orgId = ctx.user.organizationId;
  const open = await getOpenRecord(ctx);
  if (open) {
    const closed = first(
      await db
        .update(attendanceRecords)
        .set({ clockOut: new Date() })
        .where(and(eq(attendanceRecords.id, open.id), isNull(attendanceRecords.clockOut)))
        .returning(),
    );
    return { action: "clock_out" as const, record: closed };
  }
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const [assignment] = await db
    .select({ shiftTypeId: shiftAssignments.shiftTypeId })
    .from(shiftAssignments)
    .where(
      and(
        eq(shiftAssignments.organizationId, orgId),
        eq(shiftAssignments.employeeUserId, ctx.user.id),
        eq(shiftAssignments.date, todayIso),
      ),
    )
    .limit(1);
  const opened = first(
    await db
      .insert(attendanceRecords)
      .values({
        organizationId: orgId,
        userId: ctx.user.id,
        shiftTypeId: assignment?.shiftTypeId ?? null,
      })
      .returning(),
  );
  return { action: "clock_in" as const, record: opened };
}

export interface AttendanceRow {
  userId: string;
  userName: string;
  date: string;
  clockIn: Date;
  clockOut: Date | null;
  minutes: number | null;
}

/**
 * Recent records the viewer may see.
 * SELF → own rows; TEAM → direct reports + self; COMPANY → whole org.
 */
export async function listVisible(ctx: AuthContext, limit = 50): Promise<AttendanceRow[]> {
  const orgId = ctx.user.organizationId;
  const scope = widestScope(ctx.access, "attendance.view");

  const base = () =>
    db
      .select({
        userId: attendanceRecords.userId,
        userName: users.name,
        date: sql<string>`to_char(${attendanceRecords.clockIn}, 'YYYY-MM-DD')`,
        clockIn: attendanceRecords.clockIn,
        clockOut: attendanceRecords.clockOut,
        minutes: sql<
          number | null
        >`CASE WHEN ${attendanceRecords.clockOut} IS NULL THEN NULL ELSE EXTRACT(EPOCH FROM (${attendanceRecords.clockOut} - ${attendanceRecords.clockIn}))/60 END`,
      })
      .from(attendanceRecords)
      .innerJoin(users, eq(users.id, attendanceRecords.userId));

  if (!scope || scope === "SELF") {
    return base()
      .where(
        and(
          eq(attendanceRecords.organizationId, orgId),
          eq(attendanceRecords.userId, ctx.user.id),
        ),
      )
      .orderBy(desc(attendanceRecords.clockIn))
      .limit(limit);
  }

  if (scope === "TEAM") {
    // my reports + me
    const rows = await db.execute(sql`
      SELECT ar.user_id AS "userId", u.name AS "userName",
             to_char(ar.clock_in,'YYYY-MM-DD') AS date,
             ar.clock_in AS "clockIn", ar.clock_out AS "clockOut",
             CASE WHEN ar.clock_out IS NULL THEN NULL
                  ELSE EXTRACT(EPOCH FROM (ar.clock_out - ar.clock_in))/60 END AS minutes
      FROM attendance_records ar
      JOIN users u ON u.id = ar.user_id
      WHERE ar.organization_id = ${orgId}
        AND (ar.user_id = ${ctx.user.id}
             OR ar.user_id IN (SELECT user_id FROM employees WHERE manager_user_id = ${ctx.user.id}))
      ORDER BY ar.clock_in DESC
      LIMIT ${limit}
    `);
    return (rows.rows as unknown as AttendanceRow[]).map((r) => ({
      ...r,
      clockIn: new Date(r.clockIn),
      clockOut: r.clockOut ? new Date(r.clockOut) : null,
    }));
  }

  // COMPANY / DEPARTMENT / GLOBAL → org-wide (department subtree refinement comes with dept admin phase)
  return base()
    .where(eq(attendanceRecords.organizationId, orgId))
    .orderBy(desc(attendanceRecords.clockIn))
    .limit(limit);
}

export async function countClockedInToday(ctx: AuthContext): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.organizationId, ctx.user.organizationId),
        isNull(attendanceRecords.clockOut),
        gte(attendanceRecords.clockIn, startOfDay),
      ),
    );
  return row?.count ?? 0;
}

// ── Aggregated "attendance dashboard" payload ─────────────────────
export interface MyAttendanceSummary {
  open: Awaited<ReturnType<typeof getOpenRecord>>;
  /** Minutes clocked today (includes the open shift up to "now"). */
  todayMinutes: number;
  /** Minutes clocked this calendar week (Mon-Sun in user's local TZ, computed server-side in UTC). */
  weekMinutes: number;
  /** Days worked this week (0..7). */
  daysWorkedThisWeek: number;
  /** 7-day cell array, oldest to newest. */
  week: {
    date: string;
    minutes: number;
    isToday: boolean;
    /** True when the person clocked in that day. */
    hasShift: boolean;
    /** Company holiday that day (no clock-in required). */
    isHoliday: boolean;
    holidayName: string | null;
    /** Rostered shift that day, if any. */
    scheduled: boolean;
    shiftLabel: string | null;
  }[];
  /** Most recent 20 records, ordered newest first. */
  history: AttendanceRow[];
  /** Direct reports currently clocked in (for managers). */
  teamNow: {
    userId: string;
    userName: string;
    clockIn: Date;
    minutes: number;
  }[];
  /** Org-wide count of people currently clocked in. */
  orgClockedInNow: number;
}

/**
 * One aggregated fetch for the entire attendance page. Avoids the
 * "5 separate queries" anti-pattern that was in the old page.
 */
export async function myAttendanceSummary(ctx: AuthContext, historyLimit = 20): Promise<MyAttendanceSummary> {
  const orgId = ctx.user.organizationId;
  const me = ctx.user.id;
  const now = new Date();

  // Week boundary (UTC) — Monday 00:00 to Sunday 23:59:59
  const dow = now.getUTCDay(); // 0=Sun, 1=Mon, ... 6=Sat
  const offsetToMonday = (dow + 6) % 7;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - offsetToMonday);
  monday.setUTCHours(0, 0, 0, 0);
  const sundayEnd = new Date(monday);
  sundayEnd.setUTCDate(monday.getUTCDate() + 7);

  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);

  // 1. My open record
  const open = await getOpenRecord(ctx);

  // 2. My recent history (all-time, but capped)
  const history = await db
    .select({
      userId: attendanceRecords.userId,
      userName: users.name,
      date: sql<string>`to_char(${attendanceRecords.clockIn}, 'YYYY-MM-DD')`,
      clockIn: attendanceRecords.clockIn,
      clockOut: attendanceRecords.clockOut,
      minutes: sql<
        number | null
      >`CASE WHEN ${attendanceRecords.clockOut} IS NULL THEN NULL ELSE EXTRACT(EPOCH FROM (${attendanceRecords.clockOut} - ${attendanceRecords.clockIn}))/60 END`,
    })
    .from(attendanceRecords)
    .innerJoin(users, eq(users.id, attendanceRecords.userId))
    .where(
      and(
        eq(attendanceRecords.organizationId, orgId),
        eq(attendanceRecords.userId, me),
      ),
    )
    .orderBy(desc(attendanceRecords.clockIn))
    .limit(historyLimit);

  // 3. My week cells: aggregate minutes per day for the current week.
  // We use a single SQL pass with a date_trunc.
  const weekRows = await db.execute(sql`
    SELECT
      to_char(date_trunc('day', clock_in), 'YYYY-MM-DD') AS d,
      SUM(EXTRACT(EPOCH FROM (COALESCE(clock_out, now()) - clock_in))/60)::int AS minutes
    FROM attendance_records
    WHERE organization_id = ${orgId}
      AND user_id = ${me}
      AND clock_in >= ${monday.toISOString()}
      AND clock_in < ${sundayEnd.toISOString()}
    GROUP BY 1
  `);
  const weekMap = new Map<string, number>();
  for (const r of weekRows.rows as unknown as { d: string; minutes: number }[]) {
    weekMap.set(r.d, Number(r.minutes));
  }
  const todayIso = startOfDay.toISOString().slice(0, 10);

  // Holidays + rostered shifts inside the week (for the same person)
  const [holidayRows, shiftRows] = await Promise.all([
    db
      .select({ name: holidays.name, date: holidays.date })
      .from(holidays)
      .where(
        and(
          eq(holidays.organizationId, orgId),
          gte(holidays.date, monday.toISOString().slice(0, 10)),
          sql`${holidays.date} <= ${sundayEnd.toISOString().slice(0, 10)}`,
        ),
      ),
    db
      .select({
        date: shiftAssignments.date,
        name: shiftTypes.name,
        startMinutes: shiftTypes.startMinutes,
        endMinutes: shiftTypes.endMinutes,
      })
      .from(shiftAssignments)
      .innerJoin(shiftTypes, eq(shiftTypes.id, shiftAssignments.shiftTypeId))
      .where(
        and(
          eq(shiftAssignments.organizationId, orgId),
          eq(shiftAssignments.employeeUserId, me),
          gte(shiftAssignments.date, monday.toISOString().slice(0, 10)),
          lte(shiftAssignments.date, sundayEnd.toISOString().slice(0, 10)),
        ),
      ),
  ]);
  const holidayMap = new Map(holidayRows.map((h) => [String(h.date), h.name]));
  const shiftMap = new Map(shiftRows.map((s) => [String(s.date), s]));

  const week: MyAttendanceSummary["week"] = [];
  let weekMinutes = 0;
  let daysWorkedThisWeek = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const mins = weekMap.get(iso) ?? 0;
    const holidayName = holidayMap.get(iso) ?? null;
    const isHoliday = holidayName !== null;
    const shift = shiftMap.get(iso);
    // A company holiday is not a working day; only non-holiday days count.
    if (mins > 0 && !isHoliday) daysWorkedThisWeek += 1;
    weekMinutes += mins;
    week.push({
      date: iso,
      minutes: mins,
      isToday: iso === todayIso,
      hasShift: mins > 0,
      isHoliday,
      holidayName,
      scheduled: shift !== undefined,
      shiftLabel: shift
        ? `${shift.name} ${fmtMinutes(shift.startMinutes)}–${fmtMinutes(shift.endMinutes)}`
        : null,
    });
  }

  // 4. Today minutes = today's cell (already computed)
  const todayMinutes = weekMap.get(todayIso) ?? 0;

  // 5. Direct reports currently clocked in
  const scope = widestScope(ctx.access, "attendance.view");
  let teamNow: MyAttendanceSummary["teamNow"] = [];
  if (scope === "TEAM") {
    const teamRows = await db.execute(sql`
      SELECT u.id AS "userId", u.name AS "userName", ar.clock_in AS "clockIn",
             EXTRACT(EPOCH FROM (now() - ar.clock_in))/60::int AS minutes
      FROM attendance_records ar
      JOIN users u ON u.id = ar.user_id
      WHERE ar.organization_id = ${orgId}
        AND ar.clock_out IS NULL
        AND ar.user_id IN (SELECT user_id FROM employees WHERE manager_user_id = ${me})
      ORDER BY ar.clock_in
    `);
    teamNow = (teamRows.rows as unknown as { userId: string; userName: string; clockIn: string; minutes: number }[]).map(
      (r) => ({
        userId: r.userId,
        userName: r.userName,
        clockIn: new Date(r.clockIn),
        minutes: Number(r.minutes),
      }),
    );
  } else {
    // Org-wide count for SELF: still show how many colleagues are clocked in (morale)
    // (TEAM and COMPANY: caller can extend in a follow-up)
  }

  // 6. Org-wide count of clocked-in
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.organizationId, orgId),
        isNull(attendanceRecords.clockOut),
      ),
    );

  return {
    open,
    todayMinutes,
    weekMinutes,
    daysWorkedThisWeek,
    week,
    history: history.map((r) => ({
      ...r,
      clockIn: new Date(r.clockIn),
      clockOut: r.clockOut ? new Date(r.clockOut) : null,
    })) as AttendanceRow[],
    teamNow,
    orgClockedInNow: Number(row?.c ?? 0),
  };
}

function fmtMinutes(minutes: number): string {
  const m = Math.max(0, Math.min(1439, minutes));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** 0..1 — fraction of the way through the typical 8-hour workday. */
export function progressOfToday(todayMinutes: number): number {
  return Math.min(1, todayMinutes / (8 * 60));
}
