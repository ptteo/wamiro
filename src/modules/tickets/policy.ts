/**
 * Phase 8 — ticket SLA depth: per-group SLA overrides, business-hours
 * calendars, and auto-close of stale resolved tickets.
 *
 * Design: SLA windows resolve per ticket group (`ticket_groups.sla_*` JSONB
 * keyed by priority) with the org-wide defaults as fallback. Business hours
 * roll the deadline forward to the next open instant instead of skipping
 * elapsed non-business time — simple, deterministic, and unit-testable.
 */
import { and, eq, isNotNull, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/modules/notifications/service";
import type { BusinessHours } from "@/db/schema";
import { SLA_FIRST_RESPONSE_HOURS, SLA_RESOLUTION_HOURS } from "@/modules/tickets/service";
import { ticketGroups, tickets } from "@/db/schema";

export interface SlaWindows {
  resolutionHours: number;
  firstResponseHours: number;
}

/** Per-group override → org defaults fallback. Invalid JSON shapes fall back. */
export function effectiveSlaWindows(
  priority: string,
  group: { slaResolutionHours: Record<string, number> | null; slaFirstResponseHours: Record<string, number> | null } | null,
): SlaWindows {
  const res = group?.slaResolutionHours?.[priority];
  const fir = group?.slaFirstResponseHours?.[priority];
  return {
    resolutionHours:
      typeof res === "number" && res > 0 && res <= 24 * 30 ? res : SLA_RESOLUTION_HOURS[priority] ?? 24,
    firstResponseHours:
      typeof fir === "number" && fir > 0 && fir <= 24 * 30 ? fir : SLA_FIRST_RESPONSE_HOURS[priority] ?? 8,
  };
}

function parseClock(v: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

export function validBusinessHours(v: unknown): v is BusinessHours {
  if (!v || typeof v !== "object") return false;
  const bh = v as Partial<BusinessHours>;
  if (!Array.isArray(bh.days) || bh.days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) return false;
  return !!parseClock(bh.start ?? "") && !!parseClock(bh.end ?? "");
}

/**
 * Roll `from + hours` forward to the group's business hours. 24×7 groups
 * (null or empty `days`) return the plain addition. Cross-week pushes land at
 * the next open day's start time. `tz` is accepted but v1 evaluates in the
 * server clock — documented limitation, same as the rest of the scheduler.
 */
export function slaDueAt(
  from: Date,
  hours: number,
  bh: BusinessHours | null | undefined,
): Date {
  const due = new Date(from.getTime() + hours * 3_600_000);
  if (!bh || !validBusinessHours(bh) || bh.days.length === 0) return due;
  const start = parseClock(bh.start)!;
  const end = parseClock(bh.end)!;
  const startMin = start.h * 60 + start.m;
  const endMin = end.h * 60 + end.m;
  // Degenerate window (start >= end) is treated as 24×7.
  if (endMin <= startMin) return due;

  let probe = new Date(due);
  for (let i = 0; i < 14; i++) {
    // ISO weekday: JS getDay() is 0=Sun…6=Sat; BusinessHours uses 1=Mon…7=Sun.
    const isoDay = probe.getDay() === 0 ? 7 : probe.getDay();
    const minutes = probe.getHours() * 60 + probe.getMinutes();
    if (bh.days.includes(isoDay)) {
      if (minutes < startMin) {
        probe.setHours(start.h, start.m, 0, 0);
        return probe;
      }
      if (minutes < endMin) return probe;
    }
    // next day at window start
    probe = new Date(probe);
    probe.setDate(probe.getDate() + 1);
    probe.setHours(start.h, start.m, 0, 0);
  }
  return due; // calendar has no open day in 2 weeks — fall back to plain time
}

export function autoCloseDueAt(resolvedAt: Date, days: number): Date {
  return new Date(resolvedAt.getTime() + Math.max(1, days) * 24 * 3_600_000);
}

/**
 * Recompute a ticket's SLA deadlines from its assigned group's windows and
 * business-hours calendar. Best-effort hook after creation/assignment — a
 * missing or broken group must never fail the ticket flow.
 */
export async function applyGroupSla(orgId: string, ticketId: string): Promise<void> {
  try {
    const [t] = await db
      .select({
        priority: tickets.priority,
        groupId: tickets.groupId,
        createdAt: tickets.createdAt,
        status: tickets.status,
      })
      .from(tickets)
      .where(and(eq(tickets.id, ticketId), eq(tickets.organizationId, orgId)))
      .limit(1);
    if (!t || t.status !== "new") return; // only tune freshly created tickets
    if (!t.groupId) return;
    const [group] = await db
      .select({
        slaResolutionHours: ticketGroups.slaResolutionHours,
        slaFirstResponseHours: ticketGroups.slaFirstResponseHours,
        businessHours: ticketGroups.businessHours,
      })
      .from(ticketGroups)
      .where(and(eq(ticketGroups.id, t.groupId), eq(ticketGroups.organizationId, orgId)))
      .limit(1);
    if (!group) return;
    const windows = effectiveSlaWindows(t.priority, group);
    const from = t.createdAt ?? new Date();
    await db
      .update(tickets)
      .set({
        slaDueDate: slaDueAt(from, windows.resolutionHours, group.businessHours),
        firstResponseDueAt: slaDueAt(from, windows.firstResponseHours, group.businessHours),
      })
      .where(and(eq(tickets.id, ticketId), eq(tickets.organizationId, orgId)));
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "group_sla_apply_failed", orgId, ticketId, err: String(e) }));
  }
}

/**
 * Auto-close sweep for one org: (1) backfills `auto_close_at` on resolved
 * tickets missing it (legacy rows), (2) closes tickets whose auto-close time
 * has passed. Notify-once semantics via status transition — closing is
 * idempotent because the target set is recomputed each run.
 */
export async function sweepAutoClose(orgId: string): Promise<{ closed: number; scheduled: number }> {
  const [org] = await db
    .select({ days: sql<number | null>`(SELECT auto_close_resolved_days FROM organizations WHERE id = ${orgId})` })
    .from(ticketGroups)
    .limit(1);
  const days = org?.days ?? null;
  if (!days) return { closed: 0, scheduled: 0 };

  const now = new Date();

  // Backfill: resolved without a scheduled close time.
  const backfilled = await db
    .update(tickets)
    .set({ autoCloseAt: sql`${tickets.resolvedAt} + make_interval(days => ${days})` })
    .where(
      and(
        eq(tickets.organizationId, orgId),
        eq(tickets.status, "resolved"),
        isNotNull(tickets.resolvedAt),
        sql`${tickets.autoCloseAt} IS NULL`,
      ),
    )
    .returning({ id: tickets.id });
  const scheduled = backfilled.length;

  // Close: past the scheduled time, still resolved.
  const due = await db
    .select({ id: tickets.id, title: tickets.title, requesterId: tickets.requesterId })
    .from(tickets)
    .where(
      and(
        eq(tickets.organizationId, orgId),
        eq(tickets.status, "resolved"),
        isNotNull(tickets.autoCloseAt),
        lt(tickets.autoCloseAt, now),
      ),
    )
    .limit(500);
  let closed = 0;
  for (const t of due) {
    await db
      .update(tickets)
      .set({ status: "closed", autoCloseAt: null })
      .where(and(eq(tickets.id, t.id), eq(tickets.organizationId, orgId)));
    closed++;
    if (t.requesterId) {
      await notify({
        organizationId: orgId,
        userId: t.requesterId,
        type: "ticket",
        title: `Ticket auto-closed: ${t.title}`,
        body: "Resolved tickets close automatically after the configured window. Reply to reopen if it is not solved.",
        link: "/tickets",
      });
    }
    await audit({
      organizationId: orgId,
      actorUserId: null,
      action: "TICKET_AUTO_CLOSED",
      entityType: "ticket",
      entityId: t.id,
    });
  }
  return { closed, scheduled };
}
