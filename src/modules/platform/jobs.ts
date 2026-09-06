/**
 * Phase F — background jobs registry + ledger (the "without fail" backbone).
 *
 * One long-lived worker process (`npm run jobs:worker`, systemd unit) ticks
 * every scheduled sweep against ALL tenants:
 *   - sla_sweep            ticket SLA recompute + one-time warn/breach notes
 *   - trial_sweep          trial expiry → past_due / starter downgrade
 *   - request_escalation   overdue request SLAs → escalate + notify
 *   - governance_sweep     overdue obligations → escalate + notify
 *   - mailbox_poll         IMAP → tickets (skips cleanly without imapflow)
 *   - email_digest         weekly unread notification email (honors emailPrefs)
 *
 * Every run is recorded in `platform_job_runs`; /api/v1/health reads that
 * table to report worker freshness, so a stalled scheduler is an alerting
 * condition, not a surprise. All sweeps are idempotent (notify-once stamps),
 * so overlapping ticks and retries are harmless.
 */
import { desc, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { platformJobRuns } from "@/db/schema";
import { sweepOrgSlaStates } from "@/modules/tickets/service";
import { escalateOverdueInOrg } from "@/modules/requests/service";
import { escalateOverdueObligationsInOrg } from "@/modules/governance/service";
import { sweepExpiredTrials } from "@/modules/billing/service";
import { pollAllMailboxes } from "@/modules/mailboxes/service";
import { sendWeeklyDigests } from "@/modules/notifications/service";

export type JobResult = { ok: boolean; detail: Record<string, unknown> };
type Job = () => Promise<JobResult>;

export const JOBS: Record<string, { run: Job; everyMs: number }> = {
  sla_sweep: { run: runPerOrgSlaSweep, everyMs: 5 * 60_000 },
  trial_sweep: { run: runTrialSweep, everyMs: 60 * 60_000 },
  request_escalation: { run: runPerOrgRequestEscalation, everyMs: 5 * 60_000 },
  governance_sweep: { run: runPerOrgGovernanceSweep, everyMs: 60 * 60_000 },
  mailbox_poll: { run: runMailboxPoll, everyMs: 60_000 },
  email_digest: { run: runEmailDigest, everyMs: 60 * 60_000 },
};

/** Tenant ids the per-org sweeps iterate (platform org excluded). */
async function tenantIds(): Promise<string[]> {
  const res = await db.execute(
    sql`SELECT id FROM organizations WHERE slug <> '__platform' AND status = 'active' ORDER BY id LIMIT 1000`,
  );
  return (res.rows as { id: string }[]).map((r) => r.id);
}

async function withLedger(job: string, fn: Job): Promise<JobResult> {
  const startedAt = new Date();
  let result: JobResult;
  try {
    result = await fn();
  } catch (e) {
    result = { ok: false, detail: { error: String(e).slice(0, 500) } };
  }
  try {
    await db
      .insert(platformJobRuns)
      .values({ job, startedAt, finishedAt: new Date(), ok: result.ok, detail: result.detail })
      .onConflictDoUpdate({
        target: platformJobRuns.job,
        set: { startedAt, finishedAt: new Date(), ok: result.ok, detail: result.detail },
      });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "job_ledger_write_failed", job, err: String(e) }));
  }
  console.log(JSON.stringify({ level: result.ok ? "info" : "error", msg: "job_finished", job, ...result.detail }));
  return result;
}

// ---------- jobs ----------

async function runPerOrgSlaSweep(): Promise<JobResult> {
  const orgs = await tenantIds();
  let checked = 0, warned = 0, breached = 0;
  const failures: string[] = [];
  for (const orgId of orgs) {
    try {
      const r = await sweepOrgSlaStates(orgId);
      checked += r.checked; warned += r.warned; breached += r.breached;
    } catch (e) {
      failures.push(`${orgId.slice(0, 8)}: ${String(e).slice(0, 120)}`);
    }
  }
  return { ok: failures.length === 0, detail: { orgs: orgs.length, checked, warned, breached, failures: failures.slice(0, 5) } };
}

async function runTrialSweep(): Promise<JobResult> {
  const changed = await sweepExpiredTrials();
  return { ok: true, detail: { downgradedOrDunned: changed } };
}

async function runPerOrgRequestEscalation(): Promise<JobResult> {
  const orgs = await tenantIds();
  let escalated = 0;
  const failures: string[] = [];
  for (const orgId of orgs) {
    try {
      escalated += await escalateOverdueInOrg(orgId);
    } catch (e) {
      failures.push(`${orgId.slice(0, 8)}: ${String(e).slice(0, 120)}`);
    }
  }
  return { ok: failures.length === 0, detail: { orgs: orgs.length, escalated, failures: failures.slice(0, 5) } };
}

async function runPerOrgGovernanceSweep(): Promise<JobResult> {
  const orgs = await tenantIds();
  let escalated = 0;
  const failures: string[] = [];
  for (const orgId of orgs) {
    try {
      escalated += await escalateOverdueObligationsInOrg(orgId);
    } catch (e) {
      failures.push(`${orgId.slice(0, 8)}: ${String(e).slice(0, 120)}`);
    }
  }
  return { ok: failures.length === 0, detail: { orgs: orgs.length, escalated, failures: failures.slice(0, 5) } };
}

async function runEmailDigest(): Promise<JobResult> {
  try {
    const r = await sendWeeklyDigests();
    return { ok: true, detail: r };
  } catch (e) {
    return { ok: false, detail: { error: String(e).slice(0, 300) } };
  }
}

async function runMailboxPoll(): Promise<JobResult> {
  try {
    const results = await pollAllMailboxes();
    return { ok: true, detail: { mailboxes: results.length } };
  } catch (e) {
    // imapflow not installed / network down — record, never crash the worker
    return { ok: false, detail: { error: String(e).slice(0, 300) } };
  }
}

// ---------- scheduler ----------

const lastRun = new Map<string, number>();

/** One scheduler tick: run every job whose interval has elapsed. */
export async function tick(): Promise<void> {
  const now = Date.now();
  for (const [job, def] of Object.entries(JOBS)) {
    const due = (lastRun.get(job) ?? 0) + def.everyMs <= now;
    if (!due) continue;
    lastRun.set(job, now);
    // sequential on purpose: one DB pool, keep pressure predictable
    await withLedger(job, def.run);
  }
}

/** Force-run a single job (ops/debug: `npm run jobs:once` runs all). */
export async function runJob(job: string): Promise<JobResult> {
  const def = JOBS[job];
  if (!def) throw new Error(`Unknown job: ${job}`);
  return withLedger(job, def.run);
}

// ---------- health ----------

export interface JobHealth {
  job: string;
  lastOkAt: string | null;
  lastStartedAt: string | null;
  /** fresh = last successful run within 2× the job's interval */
  fresh: boolean;
  everRan: boolean;
}

/**
 * Worker freshness for /api/v1/health. A job is stale when its last row is
 * older than 2× its interval or its last run failed. Never-run jobs report
 * everRan=false so deploys without the worker yet stay "unknown", not down
 * (set JOBS_HEALTH_REQUIRED=1 to make a missing worker fail readiness).
 */
export async function jobHealth(): Promise<{ jobs: JobHealth[]; stale: boolean; seen: boolean }> {
  const rows = await db
    .select()
    .from(platformJobRuns)
    .orderBy(desc(platformJobRuns.startedAt))
    .limit(50);
  const byJob = new Map(rows.map((r) => [r.job, r]));
  const now = Date.now();
  const jobs: JobHealth[] = Object.entries(JOBS).map(([job, def]) => {
    const r = byJob.get(job);
    if (!r) return { job, lastOkAt: null, lastStartedAt: null, fresh: false, everRan: false };
    const fresh = r.ok === true && !!r.finishedAt && now - r.finishedAt.getTime() <= 2 * def.everyMs;
    return {
      job,
      lastOkAt: r.ok && r.finishedAt ? r.finishedAt.toISOString() : null,
      lastStartedAt: r.startedAt.toISOString(),
      fresh,
      everRan: true,
    };
  });
  const seen = rows.length > 0;
  const stale = seen && jobs.some((j) => !j.fresh);
  return { jobs, stale, seen };
}
