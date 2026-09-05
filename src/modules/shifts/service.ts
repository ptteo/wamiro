import { and, eq, gte, lte, sql } from "drizzle-orm";

import { db, first } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import type { AuthContext } from "@/lib/session";
import { shiftAssignments, shiftTypes, users } from "@/db/schema";
import { can } from "@/modules/iam/engine";

// ---------- helpers ----------

export async function canManage(ctx: AuthContext): Promise<boolean> {
  return can(ctx.access, "shifts.manage");
}

async function ensureManage(ctx: AuthContext): Promise<void> {
  if (!can(ctx.access, "shifts.manage")) {
    throw ApiError.forbidden("Missing permission: shifts.manage");
  }
}

/** "HH:MM" (24h) for a minutes-from-midnight value. */
export function minutesToTime(minutes: number): string {
  const m = Math.max(0, Math.min(1439, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function timeToMinutes(t: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) throw ApiError.badRequest("Times must be HH:MM");
  const total = Number(m[1]) * 60 + Number(m[2]);
  if (total < 0 || total > 1439) throw ApiError.badRequest("Times must be within a day");
  return total;
}

// ---------- shift types (manage) ----------

export async function listShiftTypes(ctx: AuthContext) {
  await ensureManage(ctx);
  return db
    .select()
    .from(shiftTypes)
    .where(eq(shiftTypes.organizationId, ctx.user.organizationId))
    .orderBy(shiftTypes.startMinutes, shiftTypes.name);
}

export interface ShiftTypeInput {
  name: string;
  startMinutes: number;
  endMinutes: number;
  graceMinutes?: number;
  workingHours?: number;
  color?: string | null;
}

export async function createShiftType(ctx: AuthContext, input: ShiftTypeInput) {
  await ensureManage(ctx);
  const name = input.name.trim();
  if (!name) throw ApiError.badRequest("Name is required");
  if (input.endMinutes <= input.startMinutes) {
    throw ApiError.badRequest("End time must be after start time");
  }
  const row = first(
    await db
      .insert(shiftTypes)
      .values({
        organizationId: ctx.user.organizationId,
        name,
        startMinutes: input.startMinutes,
        endMinutes: input.endMinutes,
        graceMinutes: input.graceMinutes ?? 15,
        workingHours: String(input.workingHours ?? (input.endMinutes - input.startMinutes) / 60),
        color: input.color ?? null,
      })
      .returning(),
  );
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "SHIFT_TYPE_CREATED",
    entityType: "shift_type",
    entityId: row.id,
    newValue: input,
  });
  return row;
}

export async function updateShiftType(ctx: AuthContext, id: string, input: Partial<ShiftTypeInput>) {
  await ensureManage(ctx);
  const [existing] = await db
    .select({
      id: shiftTypes.id,
      organizationId: shiftTypes.organizationId,
      startMinutes: shiftTypes.startMinutes,
      endMinutes: shiftTypes.endMinutes,
    })
    .from(shiftTypes)
    .where(and(eq(shiftTypes.id, id), eq(shiftTypes.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!existing) throw ApiError.notFound("Shift type not found");

  const patch: Partial<typeof shiftTypes.$inferInsert> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.startMinutes !== undefined) patch.startMinutes = input.startMinutes;
  if (input.endMinutes !== undefined) patch.endMinutes = input.endMinutes;
  if (input.graceMinutes !== undefined) patch.graceMinutes = input.graceMinutes;
  if (input.workingHours !== undefined) patch.workingHours = String(input.workingHours);
  if (input.color !== undefined) patch.color = input.color;

  const start = input.startMinutes ?? existing.startMinutes;
  const end = input.endMinutes ?? existing.endMinutes;
  if (typeof start === "number" && typeof end === "number" && end <= start) {
    throw ApiError.badRequest("End time must be after start time");
  }
  const updated = first(
    await db
      .update(shiftTypes)
      .set(patch)
      .where(eq(shiftTypes.id, id))
      .returning(),
  );
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "SHIFT_TYPE_UPDATED",
    entityType: "shift_type",
    entityId: id,
    oldValue: existing,
    newValue: patch,
  });
  return updated;
}

export async function deleteShiftType(ctx: AuthContext, id: string) {
  await ensureManage(ctx);
  const [existing] = await db
    .select({ id: shiftTypes.id })
    .from(shiftTypes)
    .where(and(eq(shiftTypes.id, id), eq(shiftTypes.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!existing) throw ApiError.notFound("Shift type not found");
  await db.delete(shiftTypes).where(eq(shiftTypes.id, id));
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "SHIFT_TYPE_DELETED",
    entityType: "shift_type",
    entityId: id,
  });
}

// ---------- my shifts (employee view) ----------

export interface MyShiftRow {
  id: string;
  date: string;
  name: string;
  startMinutes: number;
  endMinutes: number;
  graceMinutes: number;
  color: string | null;
}

/** The viewer's own assignments from `from` (default today) for `days`. */
export async function myShifts(ctx: AuthContext, days = 28): Promise<MyShiftRow[]> {
  const orgId = ctx.user.organizationId;
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setUTCDate(from.getUTCDate() + days);

  const rows = await db
    .select({
      id: shiftAssignments.id,
      date: shiftAssignments.date,
      name: shiftTypes.name,
      startMinutes: shiftTypes.startMinutes,
      endMinutes: shiftTypes.endMinutes,
      graceMinutes: shiftTypes.graceMinutes,
      color: shiftTypes.color,
    })
    .from(shiftAssignments)
    .innerJoin(shiftTypes, eq(shiftTypes.id, shiftAssignments.shiftTypeId))
    .where(
      and(
        eq(shiftAssignments.organizationId, orgId),
        eq(shiftAssignments.employeeUserId, ctx.user.id),
        gte(shiftAssignments.date, from.toISOString().slice(0, 10)),
        lte(shiftAssignments.date, to.toISOString().slice(0, 10)),
      ),
    )
    .orderBy(shiftAssignments.date);
  return rows;
}

/**
 * The shift assigned to `userId` on `date` (YYYY-MM-DD), if any.
 * Used by the attendance engine to attach a shift on clock-in and to
 * render planned windows in the weekly view.
 */
export async function assignedShiftFor(
  orgId: string,
  userId: string,
  dateIso: string,
): Promise<{ shiftTypeId: string; name: string; startMinutes: number; endMinutes: number; graceMinutes: number } | null> {
  const [row] = await db
    .select({
      shiftTypeId: shiftTypes.id,
      name: shiftTypes.name,
      startMinutes: shiftTypes.startMinutes,
      endMinutes: shiftTypes.endMinutes,
      graceMinutes: shiftTypes.graceMinutes,
    })
    .from(shiftAssignments)
    .innerJoin(shiftTypes, eq(shiftTypes.id, shiftAssignments.shiftTypeId))
    .where(
      and(
        eq(shiftAssignments.organizationId, orgId),
        eq(shiftAssignments.employeeUserId, userId),
        eq(shiftAssignments.date, dateIso),
      ),
    )
    .limit(1);
  return row ?? null;
}

// ---------- roster (manage) ----------

export interface RosterRow {
  assignmentId: string | null;
  date: string;
  userId: string;
  userName: string;
  shiftTypeId: string | null;
  shiftName: string | null;
  startMinutes: number | null;
  endMinutes: number | null;
}

/** Full-org roster for a date range: every member × every date, with shift. */
export async function roster(ctx: AuthContext, fromIso: string, toIso: string) {
  await ensureManage(ctx);
  const orgId = ctx.user.organizationId;
  const assignments = await db
    .select({
      assignmentId: shiftAssignments.id,
      date: shiftAssignments.date,
      userId: shiftAssignments.employeeUserId,
      userName: users.name,
      shiftTypeId: shiftAssignments.shiftTypeId,
      shiftName: shiftTypes.name,
      startMinutes: shiftTypes.startMinutes,
      endMinutes: shiftTypes.endMinutes,
    })
    .from(shiftAssignments)
    .innerJoin(users, eq(users.id, shiftAssignments.employeeUserId))
    .leftJoin(shiftTypes, eq(shiftTypes.id, shiftAssignments.shiftTypeId))
    .where(
      and(
        eq(shiftAssignments.organizationId, orgId),
        gte(shiftAssignments.date, fromIso),
        lte(shiftAssignments.date, toIso),
      ),
    )
    .orderBy(shiftAssignments.date, users.name);
  return assignments as unknown as RosterRow[];
}

/** Assign a shift to one employee on a set of dates (upserts per date). */
export async function assignShifts(
  ctx: AuthContext,
  input: { employeeUserId: string; shiftTypeId: string; dates: string[] },
) {
  await ensureManage(ctx);
  const orgId = ctx.user.organizationId;
  const { employeeUserId, shiftTypeId, dates } = input;
  if (!employeeUserId || !shiftTypeId || !dates?.length) {
    throw ApiError.badRequest("employeeUserId, shiftTypeId and dates are required");
  }
  if (dates.length > 366) throw ApiError.badRequest("Too many dates in one assignment");

  const [typeOk] = await db
    .select({ id: shiftTypes.id })
    .from(shiftTypes)
    .where(and(eq(shiftTypes.id, shiftTypeId), eq(shiftTypes.organizationId, orgId)))
    .limit(1);
  if (!typeOk) throw ApiError.notFound("Shift type not found");

  // the person being rostered must belong to this tenant — never let a
  // cross-tenant id slip through to the assignments table
  const [member] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.organizationId, orgId), eq(users.id, employeeUserId)))
    .limit(1);
  if (!member) throw ApiError.notFound("Employee not found in this organization");

  const values = dates.map((date) => ({
    organizationId: orgId,
    employeeUserId,
    shiftTypeId,
    date,
    createdBy: ctx.user.id,
    recurrence: null,
  }));

  await db
    .insert(shiftAssignments)
    .values(values)
    .onConflictDoUpdate({
      target: [shiftAssignments.organizationId, shiftAssignments.employeeUserId, shiftAssignments.date],
      set: { shiftTypeId, createdBy: ctx.user.id, recurrence: null },
    });

  await audit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: "SHIFT_ASSIGNED",
    entityType: "shift_assignment",
    entityId: `${employeeUserId}:${dates[0]}`,
    newValue: { employeeUserId, shiftTypeId, dates },
  });
  return { ok: true, count: values.length };
}

export async function removeAssignment(ctx: AuthContext, assignmentId: string) {
  await ensureManage(ctx);
  const [row] = await db
    .select({ id: shiftAssignments.id, organizationId: shiftAssignments.organizationId })
    .from(shiftAssignments)
    .where(
      and(
        eq(shiftAssignments.id, assignmentId),
        eq(shiftAssignments.organizationId, ctx.user.organizationId),
      ),
    )
    .limit(1);
  if (!row) throw ApiError.notFound("Assignment not found");
  await db.delete(shiftAssignments).where(eq(shiftAssignments.id, assignmentId));
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "SHIFT_ASSIGNMENT_REMOVED",
    entityType: "shift_assignment",
    entityId: assignmentId,
  });
}

/** Members who could be rostered (org members). Used by the roster UI. */
export async function listMembers(ctx: AuthContext) {
  await ensureManage(ctx);
  const rows = await db.execute(sql`
    SELECT u.id AS "id", u.name AS "name"
    FROM organization_memberships om
    JOIN users u ON u.id = om.user_id
    WHERE om.organization_id = ${ctx.user.organizationId}
    ORDER BY u.name
  `);
  return rows.rows as unknown as { id: string; name: string }[];
}

/** Upcoming shift (today+) for the header strip, used by /shifts. */
export async function nextShift(ctx: AuthContext): Promise<MyShiftRow | null> {
  const list = await myShifts(ctx, 14);
  return list[0] ?? null;
}
