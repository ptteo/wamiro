/**
 * Phase 8 — announcements depth: scheduling + department audience targeting.
 * A scheduled announcement (future `scheduled_for`) stays hidden until the
 * publish sweep stamps `published_at`; audience 'department' rows are shown
 * only to members of that department.
 */
import { and, eq, gt, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { announcements, employees } from "@/db/schema";
import { notify } from "@/modules/notifications/service";

/** Publish due scheduled announcements and notify the audience. */
export async function sweepScheduledAnnouncements(): Promise<{ published: number }> {
  const now = new Date();
  const due = await db
    .select({
      id: announcements.id,
      organizationId: announcements.organizationId,
      authorUserId: announcements.authorUserId,
      title: announcements.title,
      body: announcements.body,
      audience: announcements.audience,
      departmentId: announcements.departmentId,
      scheduledFor: announcements.scheduledFor,
    })
    .from(announcements)
    .where(
      and(
        gt(announcements.scheduledFor, new Date(0)),
        lte(announcements.scheduledFor, now),
        gt(announcements.publishedAt, now), // still hidden (published_at in future)
      ),
    )
    .limit(200);

  let published = 0;
  for (const a of due) {
    const stamp = a.scheduledFor ?? now;
    await db
      .update(announcements)
      .set({ publishedAt: stamp })
      .where(and(eq(announcements.id, a.id), gt(announcements.publishedAt, now)));
    published++;

    // notify the audience: everyone for 'company', department members otherwise
    if (a.audience === "department" && a.departmentId) {
      const members = await db
        .select({ userId: employees.userId })
        .from(employees)
        .where(and(eq(employees.organizationId, a.organizationId), eq(employees.departmentId, a.departmentId)));
      for (const m of members) {
        await notify({
          organizationId: a.organizationId,
          userId: m.userId,
          type: "announcement",
          title: a.title,
          body: a.body.slice(0, 200),
          link: "/announcements",
        }).catch(() => {});
      }
    }
  }
  void sql; // keep import symmetry with other policy modules
  return { published };
}
