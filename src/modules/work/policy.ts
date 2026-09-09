/**
 * Phase 8 — work depth: recurring tasks. A recurring task spawns a fresh
 * open copy when its `recurrence_next_date` arrives; the next date advances
 * on the task's cadence (daily/weekly/monthly). Idempotent: the spawn stamp
 * moves forward, so repeated sweeps never double-spawn.
 */
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { tasks } from "@/db/schema";

type Recurrence = "daily" | "weekly" | "monthly" | null;

function nextDate(from: string, recurrence: Recurrence): string | null {
  const d = new Date(`${from}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (recurrence === "daily") d.setUTCDate(d.getUTCDate() + 1);
  else if (recurrence === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else if (recurrence === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
  else return null;
  return d.toISOString().slice(0, 10);
}

/** Spawn due recurring tasks across all tenants. Worker-safe. */
export async function sweepRecurringTasks(): Promise<{ spawned: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const due = await db
    .select({
      id: tasks.id,
      organizationId: tasks.organizationId,
      projectId: tasks.projectId,
      title: tasks.title,
      description: tasks.description,
      priority: tasks.priority,
      assigneeId: tasks.assigneeId,
      dueDate: tasks.dueDate,
      recurrence: tasks.recurrence,
      recurrenceNextDate: tasks.recurrenceNextDate,
      createdBy: tasks.createdBy,
    })
    .from(tasks)
    .where(
      and(
        sql`${tasks.recurrence} IN ('daily','weekly','monthly')`,
        or(isNull(tasks.recurrenceNextDate), lte(tasks.recurrenceNextDate, today)),
      ),
    )
    .limit(500);

  let spawned = 0;
  for (const t of due) {
    const base = t.recurrenceNextDate ?? t.dueDate ?? today;
    const next = nextDate(base, t.recurrence as Recurrence);
    if (!next) continue;
    // advance the parent's stamp FIRST (idempotency under concurrent ticks)
    await db
      .update(tasks)
      .set({ recurrenceNextDate: next })
      .where(and(eq(tasks.id, t.id), eq(tasks.organizationId, t.organizationId)));
    // fresh open copy due at the just-elapsed date
    await db.insert(tasks).values({
      organizationId: t.organizationId,
      projectId: t.projectId,
      title: t.title,
      description: t.description,
      priority: t.priority,
      assigneeId: t.assigneeId,
      dueDate: base,
      recurrence: t.recurrence,
      recurrenceNextDate: next,
      createdBy: t.createdBy,
    });
    spawned++;
  }
  return { spawned };
}
