/**
 * G-18 — access-review cadence.
 *
 * The /admin/access-reviews page relied on admins remembering to visit. Now a
 * scheduled sweep (hourly tick) ensures every active tenant with at least one
 * admin has ONE open "Quarterly access review" obligation per quarter:
 *   - deduped by source_key (`access-review:<orgId>:<YYYY-Qn>`) — re-runs are
 *     idempotent and met reviews stay met;
 *   - due on the quarter's last day; the EXISTING governance escalation
 *     (escalateOverdueObligationsInOrg) notifies governance.manage holders
 *     when it goes overdue — no new notification path needed.
 */
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export function quarterKeyOf(now: Date): string {
  const y = now.getUTCFullYear();
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

/** Last day (ISO date) of the quarter containing `now`. */
export function quarterEndOf(now: Date): string {
  const q = Math.floor(now.getUTCMonth() / 3);
  const end = new Date(Date.UTC(now.getUTCFullYear(), q * 3 + 3, 0)); // day 0 of next quarter = last day of this one
  return end.toISOString().slice(0, 10);
}

/**
 * Create the current quarter's access-review obligation for every active
 * tenant with an admin. Returns rows created (0 on steady-state re-runs).
 * Never throws — scheduled-job safe.
 */
export async function ensureAccessReviewObligations(now: Date = new Date()): Promise<number> {
  try {
    const qk = quarterKeyOf(now);
    const due = quarterEndOf(now);
    const res = await db.execute(sql`
      INSERT INTO gov_obligations (organization_id, title, due_at, status, notes, source_key)
      SELECT o.id,
             'Quarterly access review',
             ${due}::date,
             'open',
             'Review roles, overrides and dormant accounts in Access Reviews. Mark the obligation met when done.',
             'access-review:' || o.id || ':' || ${qk}
      FROM organizations o
      WHERE o.status = 'active'
        AND o.slug <> '__platform'
        AND EXISTS (
          SELECT 1 FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE r.organization_id = o.id AND r.key = 'admin'
        )
        AND NOT EXISTS (
          SELECT 1 FROM gov_obligations g
          WHERE g.organization_id = o.id
            AND g.source_key = 'access-review:' || o.id || ':' || ${qk}
        )
    `);
    const created = Number(res.rowCount ?? 0);
    if (created > 0) {
      console.log(JSON.stringify({ level: "info", msg: "access_review_obligations_created", quarter: qk, created }));
    }
    return created;
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "access_review_cadence_failed", err: String(e).slice(0, 300) }));
    return 0;
  }
}
