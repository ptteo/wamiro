/**
 * R6 §33 — domain-event consumers. Imported once from the API layer so the
 * bus is always registered. Consumers stay decoupled from producers.
 */
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { onEvent } from "@/lib/events";
import { employees, users } from "@/db/schema";
import { notify } from "@/modules/notifications/service";

/** leave.requested → the requester's manager gets an actionable notification. */
onEvent("leave.requested", async (e) => {
  if (!e.actorUserId) return;
  const [emp] = await db
    .select({ managerId: employees.managerUserId })
    .from(employees)
    .where(and(eq(employees.userId, e.actorUserId), eq(employees.organizationId, e.organizationId)))
    .limit(1);
  const managerId = emp?.managerId;
  if (!managerId || managerId === e.actorUserId) return;
  const [requester] = await db.select({ name: users.name }).from(users).where(eq(users.id, e.actorUserId)).limit(1);
  await notify({
    organizationId: e.organizationId,
    userId: managerId,
    type: "leave",
    title: "Leave request awaiting your approval",
    body: `${requester?.name ?? "A team member"} requested ${e.payload?.days ?? "?"} day(s).`,
    link: "/approvals",
  });
});

/** request.created → same routing rule for generic requests. */
onEvent("request.created", async (e) => {
  if (!e.actorUserId) return;
  const [emp] = await db
    .select({ managerId: employees.managerUserId })
    .from(employees)
    .where(and(eq(employees.userId, e.actorUserId), eq(employees.organizationId, e.organizationId)))
    .limit(1);
  const managerId = emp?.managerId;
  if (!managerId || managerId === e.actorUserId) return;
  await notify({
    organizationId: e.organizationId,
    userId: managerId,
    type: "request",
    title: "New request awaiting approval",
    link: "/approvals",
  });
});
