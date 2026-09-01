import { and, asc, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { holidays, leaveRequests, users } from "@/db/schema";
import { can, widestScope } from "@/modules/iam/engine";

export async function listHolidays(ctx: AuthContext) {
  return db
    .select({ id: holidays.id, name: holidays.name, date: holidays.date })
    .from(holidays)
    .where(eq(holidays.organizationId, ctx.user.organizationId))
    .orderBy(asc(holidays.date));
}

/** All holidays in a calendar year (1 Jan – 31 Dec), ordered chronologically. */
export async function listHolidaysInYear(ctx: AuthContext, year: number) {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  return db
    .select({ id: holidays.id, name: holidays.name, date: holidays.date })
    .from(holidays)
    .where(
      and(
        eq(holidays.organizationId, ctx.user.organizationId),
        gte(holidays.date, start),
        lte(holidays.date, end),
      ),
    )
    .orderBy(asc(holidays.date));
}

/** The viewer's own approved leave in [from, to]. No scope check — always visible to self. */
export async function viewerOwnLeave(
  ctx: AuthContext,
  fromIso: string,
  toIso: string,
): Promise<CalendarLeave[]> {
  const rows = await db
    .select({
      userName: users.name,
      userId: leaveRequests.userId,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(users.id, leaveRequests.userId))
    .where(
      and(
        eq(leaveRequests.organizationId, ctx.user.organizationId),
        eq(leaveRequests.userId, ctx.user.id),
        eq(leaveRequests.status, "approved"),
        lte(leaveRequests.startDate, toIso),
        gte(leaveRequests.endDate, fromIso),
      ),
    );
  return rows.map((r) => ({
    userName: r.userName,
    startDate: r.startDate,
    endDate: r.endDate,
    isSelf: true,
  }));
}

export async function addHoliday(ctx: AuthContext, input: { name: string; date: string }) {
  if (!can(ctx.access, "settings.manage")) {
    throw ApiError.forbidden("Missing permission: settings.manage");
  }
  const inserted = await db
    .insert(holidays)
    .values({
      organizationId: ctx.user.organizationId,
      name: input.name.trim().slice(0, 80),
      date: input.date,
    })
    .onConflictDoNothing()
    .returning({ id: holidays.id });
  const row = inserted[0];
  if (!row) throw ApiError.conflict("A holiday already exists on that date");

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "HOLIDAY_ADDED",
    entityType: "holiday",
    entityId: row.id,
    newValue: input,
  });
}

export async function removeHoliday(ctx: AuthContext, id: string) {
  if (!can(ctx.access, "settings.manage")) {
    throw ApiError.forbidden("Missing permission: settings.manage");
  }
  const deleted = await db
    .delete(holidays)
    .where(and(eq(holidays.id, id), eq(holidays.organizationId, ctx.user.organizationId)))
    .returning({ id: holidays.id });
  if (!deleted[0]) throw ApiError.notFound();

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "HOLIDAY_REMOVED",
    entityType: "holiday",
    entityId: id,
  });
}

export interface CalendarLeave {
  userName: string;
  startDate: string;
  endDate: string;
  isSelf: boolean;
}

/**
 * Approved leave overlapping [monthStart, monthEnd], filtered by the viewer's
 * leave visibility scope (SELF → own; TEAM/DEPARTMENT → reports + self;
 * COMPANY/GLOBAL → everyone). No scope at all → nothing.
 */
export async function visibleLeaveInMonth(
  ctx: AuthContext,
  monthStart: string,
  monthEnd: string,
): Promise<CalendarLeave[]> {
  const orgId = ctx.user.organizationId;
  const scope = widestScope(ctx.access, "leave.view");
  if (!scope) return [];

  const companyWide = scope === "COMPANY" || scope === "GLOBAL";

  const rows = await db
    .select({
      userName: users.name,
      userId: leaveRequests.userId,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(users.id, leaveRequests.userId))
    .where(
      and(
        eq(leaveRequests.organizationId, orgId),
        eq(leaveRequests.status, "approved"),
        lte(leaveRequests.startDate, monthEnd),
        gte(leaveRequests.endDate, monthStart),
        ...(companyWide
          ? []
          : [
              sql`(${leaveRequests.userId} = ${ctx.user.id} OR ${leaveRequests.userId} IN (
                SELECT user_id FROM employees WHERE manager_user_id = ${ctx.user.id}
              ))`,
            ]),
      ),
    );

  return rows.map((r) => ({
    userName: r.userName,
    startDate: r.startDate,
    endDate: r.endDate,
    isSelf: r.userId === ctx.user.id,
  }));
}
