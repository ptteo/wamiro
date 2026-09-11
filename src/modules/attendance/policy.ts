/**
 * Phase 8 — attendance policy sweeps: auto-clockout, overtime, and
 * regularization reminders. Org-agnostic functions used by the jobs worker;
 * all sweeps are idempotent (notify-once stamps / state transitions).
 */
import { and, eq, isNull, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { attendanceRecords, organizations } from "@/db/schema";
import { notify } from "@/modules/notifications/service";

/**
 * Auto-clockout: every org with `auto_clockout_hours` set gets its stale
 * open shifts (clock_in older than the window) closed with an auto stamp.
 * Returns per-org totals for the ledger.
 */
export async function sweepAutoClockout(): Promise<{ orgs: number; closed: number }> {
  const orgs = await db
    .select({ id: organizations.id, hours: organizations.autoClockoutHours })
    .from(organizations)
    .where(sql`auto_clockout_hours IS NOT NULL AND auto_clockout_hours > 0`);
  let closed = 0;
  for (const org of orgs) {
    const cutoff = new Date(Date.now() - (org.hours ?? 0) * 3_600_000);
    const rows = await db
      .update(attendanceRecords)
      .set({ clockOut: new Date(), autoClosed: true })
      .where(
        and(
          eq(attendanceRecords.organizationId, org.id),
          isNull(attendanceRecords.clockOut),
          lt(attendanceRecords.clockIn, cutoff),
        ),
      )
      .returning({ id: attendanceRecords.id, userId: attendanceRecords.userId });
    closed += rows.length;
    // notify once per affected shift
    for (const r of rows) {
      await notify({
        organizationId: org.id,
        userId: r.userId,
        type: "attendance.autoclosed",
        title: "Your open shift was closed automatically",
        body: "Your attendance record passed the auto-clockout window. Request a correction if the hours are wrong.",
        link: "/attendance/corrections",
      }).catch(() => {});
    }
  }
  return { orgs: orgs.length, closed };
}

export interface OvertimeRow {
  userId: string;
  date: string;
  minutes: number;
  overtimeMinutes: number;
}

/**
 * Overtime minutes for a user-day: minutes worked beyond the org's daily
 * threshold. Pure computation used by attendance reports; null policy = 0.
 */
export function overtimeMinutes(
  workedMinutes: number,
  thresholdMinutes: number | null,
): number {
  if (thresholdMinutes === null || thresholdMinutes <= 0) return 0;
  return Math.max(0, workedMinutes - thresholdMinutes);
}

/**
 * Regularization reminders: users whose last clock-in is older than N days
 * (default 3 workdays) but who should be working. Notify-once per user per
 * day — guarded by checking for an existing reminder today.
 */
export async function sweepRegularizationReminders(): Promise<{ reminded: number }> {
  // Orgs must have attendance enabled implicitly (records exist); remind
  // users with NO clock-in in the last 3 days.
  const res = await db.execute(sql`
    SELECT DISTINCT u.id AS user_id, u.organization_id
    FROM users u
    WHERE u.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM attendance_records a
        WHERE a.user_id = u.id
          AND a.clock_in >= now() - interval '3 days'
      )
      AND NOT EXISTS (
        -- one reminder per user per day
        SELECT 1 FROM notifications n
        WHERE n.user_id = u.id
          AND n.type = 'attendance.regularize'
          AND n.created_at >= now() - interval '24 hours'
      )
    LIMIT 500
  `);
  const rows = res.rows as unknown as { user_id: string; organization_id: string }[];
  for (const r of rows) {
    await notify({
      organizationId: r.organization_id,
      userId: r.user_id,
      type: "attendance.regularize",
      title: "No attendance recorded in 3 days",
      body: "Clock in from Home, or request a correction if a record is missing.",
      link: "/attendance",
    }).catch(() => {});
  }
  return { reminded: rows.length };
}

/** Aggregated overtime per user for a date range (report payload). */
export async function overtimeReport(
  orgId: string,
  startIso: string,
  endIso: string,
  thresholdMinutes: number | null,
): Promise<OvertimeRow[]> {
  if (thresholdMinutes === null || thresholdMinutes <= 0) return [];
  const res = await db.execute(sql`
    SELECT a.user_id,
           to_char(a.clock_in, 'YYYY-MM-DD') AS date,
           SUM(EXTRACT(EPOCH FROM (a.clock_out - a.clock_in))/60)::int AS minutes
    FROM attendance_records a
    WHERE a.organization_id = ${orgId}
      AND a.clock_out IS NOT NULL
      AND a.clock_in::date BETWEEN ${startIso}::date AND ${endIso}::date
    GROUP BY a.user_id, to_char(a.clock_in, 'YYYY-MM-DD')
    HAVING SUM(EXTRACT(EPOCH FROM (a.clock_out - a.clock_in))/60) > ${thresholdMinutes}
  `);
  return (
    res.rows as unknown as { user_id: string; date: string; minutes: number }[]
  ).map((r) => ({
    userId: r.user_id,
    date: r.date,
    minutes: Number(r.minutes),
    overtimeMinutes: overtimeMinutes(Number(r.minutes), thresholdMinutes),
  }));
}
