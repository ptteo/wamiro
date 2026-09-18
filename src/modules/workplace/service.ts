/**
 * D14 — Workplace: bookable resources (rooms/desks/equipment) with
 * conflict-checked bookings. §8/§9: overlap returns a human-readable 409.
 */
import { and, asc, desc, eq, gt, lt } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertTimestampRangeInBounds } from "@/lib/date-bounds";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { users, workplaceBookings, workplaceResources, workplaceVisitors } from "@/db/schema";
import { can } from "@/modules/iam/engine";

export async function listResources(ctx: AuthContext) {
  return db
    .select({
      id: workplaceResources.id,
      kind: workplaceResources.kind,
      name: workplaceResources.name,
      location: workplaceResources.location,
      capacity: workplaceResources.capacity,
      features: workplaceResources.features,
      status: workplaceResources.status,
    })
    .from(workplaceResources)
    .where(eq(workplaceResources.organizationId, ctx.user.organizationId))
    .orderBy(asc(workplaceResources.name))
    .limit(200);
}

export async function createResource(
  ctx: AuthContext,
  input: { name: string; kind?: string; location?: string; capacity?: number; features?: string[] },
) {
  if (!can(ctx.access, "workplace.manage")) throw ApiError.forbidden("Missing permission: workplace.manage");
  const [row] = await db
    .insert(workplaceResources)
    .values({
      organizationId: ctx.user.organizationId,
      name: input.name.trim().slice(0, 120),
      kind: ["room", "desk", "resource"].includes(input.kind ?? "") ? input.kind! : "room",
      location: input.location ?? null,
      capacity: input.capacity != null ? Math.min(Math.max(input.capacity, 1), 500) : null,
      features: (input.features ?? []).slice(0, 10),
      createdBy: ctx.user.id,
    })
    .returning({ id: workplaceResources.id });
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "WORKPLACE_RESOURCE_CREATED",
    entityType: "workplace_resource",
    entityId: row!.id,
  });
  return row!.id;
}

/** §9 conflict check: overlap against active bookings on the same resource. */
export async function book(
  ctx: AuthContext,
  input: { resourceId: string; startsAt: string; endsAt: string },
) {
  if (!can(ctx.access, "workplace.book")) throw ApiError.forbidden("Missing permission: workplace.book");
  const start = new Date(input.startsAt);
  const end = new Date(input.endsAt);
  if (!(start < end)) throw ApiError.badRequest("Booking must end after it starts");
  // G-30 — reject dates in the far past/future and unparseable timestamps.
  assertTimestampRangeInBounds(start, end, "booking window");

  const [res] = await db
    .select({ id: workplaceResources.id, name: workplaceResources.name, status: workplaceResources.status })
    .from(workplaceResources)
    .where(and(eq(workplaceResources.id, input.resourceId), eq(workplaceResources.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!res) throw ApiError.notFound();
  if (res.status !== "active") throw ApiError.conflict("This room is no longer available. Try another time or room.");

  const [conflict] = await db
    .select({ id: workplaceBookings.id })
    .from(workplaceBookings)
    .where(
      and(
        eq(workplaceBookings.resourceId, input.resourceId),
        eq(workplaceBookings.status, "booked"),
        lt(workplaceBookings.startsAt, end),
        gt(workplaceBookings.endsAt, start),
      ),
    )
    .limit(1);
  if (conflict) throw ApiError.conflict("This room is no longer available. Try another time or room.");

  const [row] = await db
    .insert(workplaceBookings)
    .values({
      organizationId: ctx.user.organizationId,
      resourceId: input.resourceId,
      userId: ctx.user.id,
      startsAt: start,
      endsAt: end,
    })
    .returning({ id: workplaceBookings.id });
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "WORKPLACE_BOOKED",
    entityType: "workplace_booking",
    entityId: row!.id,
    newValue: { resourceId: input.resourceId },
  });
  return row!.id;
}

export async function myBookings(ctx: AuthContext) {
  return db
    .select({
      id: workplaceBookings.id,
      resourceId: workplaceBookings.resourceId,
      resourceName: workplaceResources.name,
      startsAt: workplaceBookings.startsAt,
      endsAt: workplaceBookings.endsAt,
      status: workplaceBookings.status,
    })
    .from(workplaceBookings)
    .innerJoin(workplaceResources, eq(workplaceResources.id, workplaceBookings.resourceId))
    .where(and(eq(workplaceBookings.userId, ctx.user.id), eq(workplaceBookings.organizationId, ctx.user.organizationId)))
    .orderBy(asc(workplaceBookings.startsAt))
    .limit(100);
}

/** Bookings the org has on a given calendar day (for the timeline view). */
export async function orgBookingsOn(ctx: AuthContext, day: string) {
  // day is YYYY-MM-DD. Window: day 00:00 → next day 00:00 in UTC.
  const start = new Date(`${day}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 86_400_000);
  return db
    .select({
      id: workplaceBookings.id,
      resourceId: workplaceBookings.resourceId,
      resourceName: workplaceResources.name,
      userName: users.name,
      startsAt: workplaceBookings.startsAt,
      endsAt: workplaceBookings.endsAt,
      status: workplaceBookings.status,
    })
    .from(workplaceBookings)
    .innerJoin(workplaceResources, eq(workplaceResources.id, workplaceBookings.resourceId))
    .leftJoin(users, eq(users.id, workplaceBookings.userId))
    .where(
      and(
        eq(workplaceBookings.organizationId, ctx.user.organizationId),
        lt(workplaceBookings.startsAt, end),
        gt(workplaceBookings.endsAt, start),
        eq(workplaceBookings.status, "booked"),
      ),
    )
    .orderBy(asc(workplaceBookings.startsAt))
    .limit(200);
}

export async function cancelBooking(ctx: AuthContext, bookingId: string) {
  const updated = await db
    .update(workplaceBookings)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(workplaceBookings.id, bookingId),
        // owner cancels own booking; workplace.manage may cancel any in-tenant
        can(ctx.access, "workplace.manage")
          ? eq(workplaceBookings.organizationId, ctx.user.organizationId)
          : and(eq(workplaceBookings.organizationId, ctx.user.organizationId), eq(workplaceBookings.userId, ctx.user.id)),
      ),
    )
    .returning({ id: workplaceBookings.id });
  if (!updated[0]) throw ApiError.notFound();
}
void users;

// ---------- D14 §19-23: visitors ----------
export async function inviteVisitor(
  ctx: AuthContext,
  input: { name: string; email?: string; visitDate: string },
) {
  if (!can(ctx.access, "workplace.book")) throw ApiError.forbidden("Missing permission: workplace.book");
  const [row] = await db
    .insert(workplaceVisitors)
    .values({
      organizationId: ctx.user.organizationId,
      name: input.name.trim().slice(0, 120),
      email: input.email ?? null,
      hostUserId: ctx.user.id,
      visitDate: input.visitDate,
    })
    .returning({ id: workplaceVisitors.id });
  return row!.id;
}

export async function myVisitors(ctx: AuthContext) {
  return db
    .select({
      id: workplaceVisitors.id,
      name: workplaceVisitors.name,
      email: workplaceVisitors.email,
      visitDate: workplaceVisitors.visitDate,
      status: workplaceVisitors.status,
      hostUserId: workplaceVisitors.hostUserId,
      hostName: users.name,
      checkedInAt: workplaceVisitors.checkedInAt,
      checkedOutAt: workplaceVisitors.checkedOutAt,
      createdAt: workplaceVisitors.createdAt,
    })
    .from(workplaceVisitors)
    .leftJoin(users, eq(users.id, workplaceVisitors.hostUserId))
    .where(
      can(ctx.access, "workplace.manage")
        ? eq(workplaceVisitors.organizationId, ctx.user.organizationId)
        : and(eq(workplaceVisitors.organizationId, ctx.user.organizationId), eq(workplaceVisitors.hostUserId, ctx.user.id)),
    )
    .orderBy(desc(workplaceVisitors.createdAt))
    .limit(100);
}

export async function visitorCheck(ctx: AuthContext, id: string, action: "checkin" | "checkout" | "cancel") {
  const statusMap = { checkin: "checked_in", checkout: "checked_out", cancel: "cancelled" } as const;
  const patch: Record<string, unknown> = { status: statusMap[action] };
  if (action === "checkin") patch.checkedInAt = new Date();
  if (action === "checkout") patch.checkedOutAt = new Date();
  if (action === "cancel" && !can(ctx.access, "workplace.manage")) throw ApiError.forbidden();
  const scope = can(ctx.access, "workplace.manage")
    ? eq(workplaceVisitors.organizationId, ctx.user.organizationId)
    : and(eq(workplaceVisitors.organizationId, ctx.user.organizationId), eq(workplaceVisitors.hostUserId, ctx.user.id))!;
  // host may check in/out their own visitor; only manage may cancel
  if (action !== "cancel") {
    const [v] = await db
      .select({ host: workplaceVisitors.hostUserId })
      .from(workplaceVisitors)
      .where(and(eq(workplaceVisitors.id, id), eq(workplaceVisitors.organizationId, ctx.user.organizationId)))
      .limit(1);
    if (!v) throw ApiError.notFound();
    if (v.host !== ctx.user.id && !can(ctx.access, "workplace.manage")) throw ApiError.forbidden();
  }
  const updated = await db.update(workplaceVisitors).set(patch).where(and(eq(workplaceVisitors.id, id), scope)).returning({ id: workplaceVisitors.id });
  if (!updated[0]) throw ApiError.notFound();
}