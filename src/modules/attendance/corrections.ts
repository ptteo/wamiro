import { and, desc, eq, inArray, or, sql } from "drizzle-orm";

import { db, first } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import type { AuthContext } from "@/lib/session";
import { notify } from "@/modules/notifications/service";
import { resolveApprovalActors } from "@/modules/approvals/delegation";
import {
  attendanceCorrections,
  attendanceRecords,
  employees,
  users,
} from "@/db/schema";
import { can, widestScope } from "@/modules/iam/engine";

/**
 * F3.2 — Attendance corrections.
 *
 * Mirrors the leave request/approve workflow: an employee asks to fix a
 * missed/wrong clock event; their manager (or HR, company-wide) approves;
 * approval writes the corrected times onto the attendance record for that
 * date. Every mutation is audited.
 */

export type CorrectionType = "clock_in" | "clock_out" | "missing";

export interface CorrectionInput {
  recordDate: string; // YYYY-MM-DD
  type: CorrectionType;
  requestedInAt?: string | null; // ISO
  requestedOutAt?: string | null; // ISO
  reason: string;
}

function dayRange(dateIso: string): { start: Date; end: Date } {
  const start = new Date(`${dateIso}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function validateType(input: CorrectionInput): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.recordDate)) {
    throw ApiError.badRequest("recordDate must be YYYY-MM-DD");
  }
  if (input.recordDate > new Date().toISOString().slice(0, 10)) {
    throw ApiError.badRequest("Cannot correct a future date");
  }
  if (!input.reason?.trim()) throw ApiError.badRequest("A reason is required");
  if (input.reason.length > 1000) throw ApiError.badRequest("Reason too long");

  const inAt = input.requestedInAt ? new Date(input.requestedInAt) : null;
  const outAt = input.requestedOutAt ? new Date(input.requestedOutAt) : null;
  if (inAt && Number.isNaN(+inAt)) throw ApiError.badRequest("Invalid clock-in time");
  if (outAt && Number.isNaN(+outAt)) throw ApiError.badRequest("Invalid clock-out time");
  if (inAt && outAt && +outAt <= +inAt) {
    throw ApiError.badRequest("Clock-out must be after clock-in");
  }
  if (input.type === "clock_in" && !inAt) throw ApiError.badRequest("Clock-in time is required");
  if (input.type === "clock_out" && !outAt) throw ApiError.badRequest("Clock-out time is required");
  if (input.type === "missing" && (!inAt || !outAt)) {
    throw ApiError.badRequest("Both clock-in and clock-out are required for a missed day");
  }
}

export async function requestCorrection(ctx: AuthContext, input: CorrectionInput) {
  if (!can(ctx.access, "attendance.view_self")) {
    throw ApiError.forbidden("Missing permission: attendance.view_self");
  }
  validateType(input);
  const orgId = ctx.user.organizationId;

  // One open correction per employee + day (avoid duplicate approvals)
  const [dup] = await db
    .select({ id: attendanceCorrections.id })
    .from(attendanceCorrections)
    .where(
      and(
        eq(attendanceCorrections.organizationId, orgId),
        eq(attendanceCorrections.employeeUserId, ctx.user.id),
        eq(attendanceCorrections.recordDate, input.recordDate),
        eq(attendanceCorrections.status, "pending"),
      ),
    )
    .limit(1);
  if (dup) throw ApiError.conflict("You already have a pending correction for that day");

  const row = first(
    await db
      .insert(attendanceCorrections)
      .values({
        organizationId: orgId,
        employeeUserId: ctx.user.id,
        recordDate: input.recordDate,
        type: input.type,
        requestedInAt: input.requestedInAt ? new Date(input.requestedInAt) : null,
        requestedOutAt: input.requestedOutAt ? new Date(input.requestedOutAt) : null,
        reason: input.reason.trim(),
      })
      .returning(),
  );

  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: "ATTENDANCE_CORRECTION_REQUESTED",
    entityType: "attendance_correction",
    entityId: row.id,
    newValue: { ...input, reason: input.reason.trim() },
  });

  const [mgr] = await db
    .select({ managerUserId: employees.managerUserId })
    .from(employees)
    .where(and(eq(employees.userId, ctx.user.id), eq(employees.organizationId, orgId)))
    .limit(1);
  if (mgr?.managerUserId) {
    await notify({
      organizationId: orgId,
      userId: mgr.managerUserId,
      type: "attendance.correction",
      title: `${ctx.user.name} requested an attendance correction`,
      body: `${input.type.replace("_", " ")} on ${input.recordDate}: ${input.reason}`,
      link: "/attendance/corrections",
    });
  }
  return row;
}

export interface CorrectionRow {
  id: string;
  userName: string;
  recordDate: string;
  type: CorrectionType;
  requestedInAt: Date | null;
  requestedOutAt: Date | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  decidedNote: string | null;
  createdAt: Date;
}

/** Corrections the viewer may see: their own always; reports' when they may approve. */
export async function listCorrections(ctx: AuthContext): Promise<CorrectionRow[]> {
  const orgId = ctx.user.organizationId;
  const scope = widestScope(ctx.access, "attendance.correct");
  const base = db
    .select({
      id: attendanceCorrections.id,
      userName: users.name,
      recordDate: attendanceCorrections.recordDate,
      type: attendanceCorrections.type,
      requestedInAt: attendanceCorrections.requestedInAt,
      requestedOutAt: attendanceCorrections.requestedOutAt,
      reason: attendanceCorrections.reason,
      status: attendanceCorrections.status,
      decidedNote: attendanceCorrections.decidedNote,
      createdAt: attendanceCorrections.createdAt,
    })
    .from(attendanceCorrections)
    .innerJoin(users, eq(users.id, attendanceCorrections.employeeUserId));

  // Manager with TEAM scope → own reports + self. Company scope → everyone.
  if (!scope || scope === "SELF") {
    return base
      .where(
        and(
          eq(attendanceCorrections.organizationId, orgId),
          eq(attendanceCorrections.employeeUserId, ctx.user.id),
        ),
      )
      .orderBy(desc(attendanceCorrections.createdAt))
      .limit(100);
  }
  if (scope === "TEAM") {
    return base
      .where(
        and(
          eq(attendanceCorrections.organizationId, orgId),
          sql`${attendanceCorrections.employeeUserId} IN (
            SELECT user_id FROM employees WHERE manager_user_id = ${ctx.user.id}
            UNION SELECT ${ctx.user.id}
          )`,
        ),
      )
      .orderBy(desc(attendanceCorrections.createdAt))
      .limit(200);
  }
  return base
    .where(eq(attendanceCorrections.organizationId, orgId))
    .orderBy(desc(attendanceCorrections.createdAt))
    .limit(200);
}

/** Pending items in the viewer's approval scope (manager queue + HR). */
export async function pendingCorrections(ctx: AuthContext): Promise<CorrectionRow[]> {
  const orgId = ctx.user.organizationId;
  const scope = widestScope(ctx.access, "attendance.correct");
  if (!scope) return [];

  const base = db
    .select({
      id: attendanceCorrections.id,
      userName: users.name,
      recordDate: attendanceCorrections.recordDate,
      type: attendanceCorrections.type,
      requestedInAt: attendanceCorrections.requestedInAt,
      requestedOutAt: attendanceCorrections.requestedOutAt,
      reason: attendanceCorrections.reason,
      status: attendanceCorrections.status,
      decidedNote: attendanceCorrections.decidedNote,
      createdAt: attendanceCorrections.createdAt,
    })
    .from(attendanceCorrections)
    .innerJoin(users, eq(users.id, attendanceCorrections.employeeUserId));

  if (scope === "TEAM") {
    const actorIds = [ctx.user.id, ...(await resolveApprovalActors(ctx))];
    const filter =
      actorIds.length > 1
        ? or(inArray(employees.managerUserId, actorIds), eq(employees.managerUserId, ctx.user.id))
        : eq(employees.managerUserId, ctx.user.id);
    const reports = db
      .select({ userId: employees.userId })
      .from(employees)
      .where(filter);
    return base
      .where(
        and(
          eq(attendanceCorrections.organizationId, orgId),
          eq(attendanceCorrections.status, "pending"),
          sql`${attendanceCorrections.employeeUserId} IN (${reports})`,
        ),
      )
      .orderBy(desc(attendanceCorrections.createdAt))
      .limit(200);
  }
  return base
    .where(
      and(
        eq(attendanceCorrections.organizationId, orgId),
        eq(attendanceCorrections.status, "pending"),
      ),
    )
    .orderBy(desc(attendanceCorrections.createdAt))
    .limit(200);
}

/**
 * Approve/reject a correction. On approval the attendance record for the
 * date is created or updated with the corrected times and stamped with a
 * note pointing at the correction for auditability.
 */
export async function reviewCorrection(
  ctx: AuthContext,
  correctionId: string,
  decision: "approved" | "rejected",
  note?: string,
) {
  const orgId = ctx.user.organizationId;
  const scope = widestScope(ctx.access, "attendance.correct");
  if (!scope || !can(ctx.access, "attendance.correct")) {
    throw ApiError.forbidden("Missing permission: attendance.correct");
  }

  const [row] = await db
    .select({
      id: attendanceCorrections.id,
      employeeUserId: attendanceCorrections.employeeUserId,
      recordDate: attendanceCorrections.recordDate,
      type: attendanceCorrections.type,
      requestedInAt: attendanceCorrections.requestedInAt,
      requestedOutAt: attendanceCorrections.requestedOutAt,
      reason: attendanceCorrections.reason,
      status: attendanceCorrections.status,
    })
    .from(attendanceCorrections)
    .where(and(eq(attendanceCorrections.id, correctionId), eq(attendanceCorrections.organizationId, orgId)))
    .limit(1);
  if (!row) throw ApiError.notFound();
  if (row.status !== "pending") throw ApiError.conflict("Already decided");

  const companyWide = scope === "COMPANY" || scope === "GLOBAL";
  if (row.employeeUserId === ctx.user.id && !companyWide) {
    throw ApiError.forbidden("You cannot approve your own correction");
  }
  if (!companyWide) {
    const actorIds = [ctx.user.id, ...(await resolveApprovalActors(ctx))];
    const filter =
      actorIds.length > 1
        ? or(inArray(employees.managerUserId, actorIds), eq(employees.managerUserId, ctx.user.id))
        : eq(employees.managerUserId, ctx.user.id);
    const [report] = await db
      .select({ userId: employees.userId })
      .from(employees)
      .where(and(eq(employees.userId, row.employeeUserId), filter))
      .limit(1);
    if (!report) throw ApiError.forbidden("Not your direct report");
  }

  const updated = first(
    await db
      .update(attendanceCorrections)
      .set({
        status: decision,
        decidedBy: ctx.user.id,
        decidedAt: new Date(),
        decidedNote: note?.trim() ?? null,
      })
      .where(and(eq(attendanceCorrections.id, correctionId), eq(attendanceCorrections.status, "pending")))
      .returning(),
  );
  if (!updated) throw ApiError.conflict("Already decided");

  if (decision === "approved") {
    await applyCorrectionToAttendance(ctx, row);
  }

  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: decision === "approved" ? "ATTENDANCE_CORRECTION_APPROVED" : "ATTENDANCE_CORRECTION_REJECTED",
    entityType: "attendance_correction",
    entityId: correctionId,
    metadata: { note },
  });

  await notify({
    organizationId: orgId,
    userId: row.employeeUserId,
    type: "attendance.correction",
    title:
      decision === "approved"
        ? `Your attendance correction was approved by ${ctx.user.name}`
        : `Your attendance correction was rejected by ${ctx.user.name}`,
    body: note ?? `Correction for ${String(row.recordDate)} (${row.type})`,
    link: "/attendance/corrections",
  });
  return updated;
}

/** Upsert the attendance record for the corrected day with approved times. */
async function applyCorrectionToAttendance(
  ctx: AuthContext,
  row: { employeeUserId: string; recordDate: string; type: CorrectionType; requestedInAt: Date | null; requestedOutAt: Date | null },
): Promise<void> {
  const orgId = ctx.user.organizationId;
  const { start, end } = dayRange(String(row.recordDate));

  const existing = await db
    .select({ id: attendanceRecords.id, note: attendanceRecords.note })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.organizationId, orgId),
        eq(attendanceRecords.userId, row.employeeUserId),
        sql`${attendanceRecords.clockIn} >= ${start.toISOString()}`,
        sql`${attendanceRecords.clockIn} < ${end.toISOString()}`,
      ),
    )
    .orderBy(attendanceRecords.clockIn)
    .limit(1);

  const stamp = `corrected:${row.type === "missing" ? "added" : "fixed"}`;

  if (existing[0]) {
    const patch: Partial<typeof attendanceRecords.$inferInsert> = {};
    if (row.type === "clock_in" || row.type === "missing") {
      if (row.requestedInAt) patch.clockIn = row.requestedInAt;
    }
    if (row.type === "clock_out" || row.type === "missing") {
      if (row.requestedOutAt) patch.clockOut = row.requestedOutAt;
    }
    // keep an existing open record open if the correction only adjusts the in time
    patch.note = existing[0].note ? `${existing[0].note}; ${stamp}` : stamp;
    await db.update(attendanceRecords).set(patch).where(eq(attendanceRecords.id, existing[0].id));
  } else {
    // no record that day: create one from the correction
    const clockIn = row.requestedInAt ?? new Date(`${String(row.recordDate)}T09:00:00.000Z`);
    const clockOut = row.requestedOutAt ?? (row.type === "clock_out" ? new Date(Date.now()) : null);
    await db.insert(attendanceRecords).values({
      organizationId: orgId,
      userId: row.employeeUserId,
      clockIn,
      clockOut,
      source: "correction",
      note: stamp,
    });
  }
  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: "ATTENDANCE_CORRECTION_APPLIED",
    entityType: "attendance_record",
    entityId: existing[0]?.id ?? `${row.employeeUserId}:${String(row.recordDate)}`,
    newValue: { recordDate: String(row.recordDate), type: row.type },
  });
}
