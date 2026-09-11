/**
 * Admin panel — operator activity digest (fold-in #13) + weekly operator
 * digest (fold-in #2, "lands after D").
 *
 * fold-in #13: a MONTHLY self-audit of the platform team's own actions —
 * impersonations, plan changes, credits, manual invoices, entitlement flips,
 * ops exports — emailed to platform admins. The audit data already exists;
 * this just reads it back and makes the operator team honest with zero effort.
 *
 * fold-in #2: a MONDAY-MORNING weekly digest of what needs attention — new
 * open alerts, trials ending ≤7 d, at-risk MRR, stalled setups — so risks
 * surface in the inbox instead of waiting for someone to open the console.
 *
 * Both are best-effort email (sendEmail already no-ops without SMTP config)
 * and run from the jobs worker; failures land in the job ledger.
 */
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { renderBrandedEmail, sendEmail } from "@/lib/mailer";

/** Platform-team recipients: active operators with a non-viewer role. */
async function operatorEmails(): Promise<string[]> {
  const res = await db.execute(sql`
    SELECT DISTINCT u.email
    FROM users u
    JOIN platform.platform_operators po ON po.user_id = u.id
    WHERE u.status = 'active' AND po.role <> 'viewer'
    LIMIT 20
  `);
  return (res.rows as { email: string }[]).map((r) => r.email);
}

interface DigestSection {
  title: string;
  lines: string[];
}

function renderSections(sections: DigestSection[]): string {
  return sections
    .filter((s) => s.lines.length > 0)
    .map(
      (s) =>
        `<h3 style="margin:16px 0 4px;font-size:14px;">${s.title}</h3><ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7;">${s.lines
          .map((l) => `<li>${l.replace(/</g, "&lt;")}</li>`)
          .join("")}</ul>`,
    )
    .join("");
}

/**
 * Monthly operator self-audit (fold-in #13): the platform team's own actions
 * over the trailing month, straight from the platform-level audit log.
 */
export async function sendOperatorDigest(now: Date = new Date()): Promise<{ recipients: number; sections: number }> {
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const res = await db.execute(sql`
    SELECT a.action, count(*)::int AS n,
           COALESCE(string_agg(DISTINCT COALESCE(u.name, 'system'), ', '), '—') AS actors
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.actor_user_id
    WHERE a.organization_id IS NULL AND a.created_at >= ${since}::timestamptz
      AND (a.action LIKE 'PLATFORM_%' OR a.action IN ('ORG_PLAN_CHANGED','ORG_SUSPENDED','ORG_REACTIVATED','IMPERSONATION_STARTED'))
      AND a.action NOT IN ('PLATFORM_ALERT_FIRED')
    GROUP BY a.action
    ORDER BY n DESC
    LIMIT 20
  `);
  const rows = res.rows as { action: string; n: number; actors: string }[];

  const recipients = await operatorEmails();
  if (recipients.length === 0) return { recipients: 0, sections: 0 };

  const sections: DigestSection[] = [
    {
      title: "Platform team activity — last 30 days",
      lines: rows.map((r) => `${r.action}: ${r.n}× (by ${r.actors})`),
    },
  ];
  if (sections.every((s) => s.lines.length === 0)) return { recipients: recipients.length, sections: 0 };

  const subject = "Wamiro panel: monthly operator activity digest";
  const html = renderBrandedEmail({
    title: subject,
    body:
      `Self-audit of the platform team's own actions (impersonations, plan changes, credits, exports). ` +
      `Full trail: audit_logs, organization_id IS NULL.` +
      renderSections(sections),
  });
  let sent = 0;
  for (const to of recipients) {
    if (await sendEmail(to, subject, html)) sent += 1;
  }
  return { recipients: sent, sections: sections.filter((s) => s.lines.length > 0).length };
}

/**
 * Monday-morning weekly digest (fold-in #2): open alerts, trials ending
 * ≤7 d, at-risk MRR, and dormant tenants — the "open the panel for me" email.
 */
export async function sendWeeklyOperatorDigest(): Promise<{ recipients: number; sections: number }> {
  const res = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM platform.alert_instances WHERE state = 'open') AS "openAlerts",
      (SELECT count(*)::int FROM organizations
        WHERE slug <> '__platform' AND status = 'active' AND billing_status = 'trial'
          AND trial_ends_at BETWEEN now() AND (now() + interval '7 days')) AS "trialsEnding",
      (SELECT count(*)::int FROM organizations
        WHERE slug <> '__platform' AND status = 'active' AND billing_status = 'active'
          AND created_at >= now() - interval '30 days'
          AND (SELECT COALESCE(sum(active_users), 0) FROM platform.tenant_usage_daily d
               WHERE d.org_id = organizations.id AND d.day >= (current_date - 7)) < 3) AS "stalledSetups",
      (SELECT count(*)::int FROM platform.tenant_health_scores h
        WHERE h.day = (SELECT max(day) FROM platform.tenant_health_scores) AND h.grade IN ('yellow','red')) AS "atRiskTenants",
      (SELECT count(*)::int FROM platform.destructive_ops WHERE status = 'pending') AS "pendingOps"
  `);
  const k = (res.rows[0] ?? {}) as Record<string, number>;

  const recipients = await operatorEmails();
  if (recipients.length === 0) return { recipients: 0, sections: 0 };

  const sections: DigestSection[] = [
    { title: "Needs a decision", lines: [] },
    { title: "Watch list", lines: [] },
  ];
  if (Number(k.pendingOps ?? 0) > 0) {
    sections[0]!.lines.push(`**${k.pendingOps} pending destructive-op approval${k.pendingOps === 1 ? "" : "s"}** — two-person rule waiting on a second operator.`);
  }
  if (Number(k.openAlerts ?? 0) > 0) sections[0]!.lines.push(`${k.openAlerts} open alert${k.openAlerts === 1 ? "" : "s"} in the panel inbox.`);
  if (Number(k.trialsEnding ?? 0) > 0) sections[1]!.lines.push(`${k.trialsEnding} trial${k.trialsEnding === 1 ? "" : "s"} end within 7 days.`);
  if (Number(k.atRiskTenants ?? 0) > 0) sections[1]!.lines.push(`${k.atRiskTenants} tenant${k.atRiskTenants === 1 ? "" : "s"} yellow/red on health.`);
  if (Number(k.stalledSetups ?? 0) > 0) sections[1]!.lines.push(`${k.stalledSetups} recent setup${k.stalledSetups === 1 ? "" : "s"} with <3 active people this week.`);

  const hasContent = sections.some((s) => s.lines.length > 0);
  if (!hasContent) return { recipients: recipients.length, sections: 0 };

  const subject = "Wamiro panel: weekly tenant digest";
  const html = renderBrandedEmail({
    title: subject,
    body: "What needs attention this week." + renderSections(sections),
  });
  let sent = 0;
  for (const to of recipients) {
    if (await sendEmail(to, subject, html)) sent += 1;
  }
  return { recipients: sent, sections: sections.filter((s) => s.lines.length > 0).length };
}
