/**
 * Admin panel Phase A — historical usage backfill.
 * Bulk-rolls up the last N days (default 90) into platform.tenant_usage_daily.
 * Idempotent: ON CONFLICT (org_id, day) DO NOTHING (never clobbers live rollups).
 *
 *   node --import tsx scripts/backfill-usage.mts [--days 90] [--org <uuid>]
 *
 * Snapshots (seats/docs/storage) are computed as "state as of that day" via
 * created_at <= day-end; plan/price use the org's CURRENT plan (documented
 * limitation: plan history before Phase A is unknowable). mutations = 0 for
 * days older than the rate_limit_hits 48h retention.
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const { Client } = await import("pg");
const { actionToArea } = await import("../src/modules/platform/usage.ts");

const rawUrl = process.env.DATABASE_URL ?? "";
const url = rawUrl.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");
const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
const origQuery = client.query.bind(client);
client.query = ((text: unknown, params?: unknown[]) => {
  const label = typeof text === "string" ? text.slice(0, 60).replace(/\s+/g, " ") : "(object)";
  return (origQuery as (t: unknown, p?: unknown[]) => Promise<unknown>)(text, params).catch((e: Error) => {
    console.error(JSON.stringify({ queryFailed: label, message: e.message }));
    throw e;
  });
}) as typeof client.query;

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? Number(process.argv[i + 1]) : fallback;
};
const DAYS = Math.min(Math.max(arg("days", 90), 1), 730);
const orgFilter = process.argv.includes("--org") ? process.argv[process.argv.indexOf("--org") + 1] : null;

// plan price snapshot (current plan per org)
const planRows = (await client.query(`SELECT id, name, slug, plan FROM organizations WHERE slug <> '__platform' ${orgFilter ? "AND id = $1" : ""}`,
  orgFilter ? [orgFilter] : [])).rows as { id: string; name: string; slug: string; plan: string }[];
const priceOf = (plan: string): number => (plan === "growth" ? 400 : plan === "scale" ? 700 : 0);

const { rows: covered } = await client.query(
  `SELECT min(created_at) AS first FROM audit_logs ${orgFilter ? "WHERE organization_id = $1" : ""}`,
  orgFilter ? [orgFilter] : [],
);
const firstDay = covered[0]?.first ? new Date(covered[0].first) : new Date(Date.now() - DAYS * 86_400_000);
const since = new Date(Math.max(firstDay.getTime(), Date.now() - DAYS * 86_400_000));
since.setUTCHours(0, 0, 0, 0);

let upserted = 0;
let skippedEmpty = 0;

for (let d = new Date(since); d <= new Date(); d = new Date(d.getTime() + 86_400_000)) {
  const day = d.toISOString().slice(0, 10);
  const start = `${day}T00:00:00.000Z`;
  const end = `${day}T23:59:59.999Z`;
  const dayEnd = `${day} 23:59:59.999+00`;

  const act = (await client.query(
    `SELECT organization_id AS org,
            count(*)::int AS actions,
            count(DISTINCT actor_user_id)::int AS actors,
            count(*) FILTER (WHERE action = 'USER_LOGIN')::int AS logins,
            count(*) FILTER (WHERE action = 'TICKET_CREATED')::int AS tickets,
            count(*) FILTER (WHERE action LIKE 'LEAVE\\_%' AND action NOT IN ('LEAVE_APPROVED','LEAVE_REJECTED'))::int AS leave_requests
     FROM audit_logs
     WHERE created_at >= $1 AND created_at <= $2 ${orgFilter ? "AND organization_id = $3" : ""}
     GROUP BY organization_id`,
    orgFilter ? [start, end, orgFilter] : [start, end],
  )).rows as { org: string; actions: number; actors: number; logins: number; tickets: number; leave_requests: number }[];

  const modRows = (await client.query(
    `SELECT organization_id AS org, action, count(*)::int AS n
     FROM audit_logs
     WHERE created_at >= $1 AND created_at <= $2 ${orgFilter ? "AND organization_id = $3" : ""}
     GROUP BY organization_id, action`,
    orgFilter ? [start, end, orgFilter] : [start, end],
  )).rows as { org: string; action: string; n: number }[];
  const byModule = new Map<string, Record<string, number>>();
  for (const r of modRows) {
    const m = byModule.get(r.org) ?? {};
    const area = actionToArea(r.action);
    m[area] = (m[area] ?? 0) + r.n;
    byModule.set(r.org, m);
  }

  const seats = (await client.query(
    `SELECT organization_id AS org, count(*)::int AS n FROM organization_memberships
     WHERE status = 'active' AND joined_at <= $1 ${orgFilter ? "AND organization_id = $2" : ""}
     GROUP BY organization_id`,
    orgFilter ? [dayEnd, orgFilter] : [dayEnd],
  )).rows as { org: string; n: number }[];

  const files = (await client.query(
    `SELECT org, sum(docs)::int AS docs, sum(bytes)::bigint AS bytes FROM (
       SELECT organization_id AS org, count(*) AS docs, COALESCE(sum(size_bytes),0) AS bytes FROM documents WHERE created_at <= $1 ${orgFilter ? "AND organization_id = $2" : ""} GROUP BY 1
       UNION ALL
       SELECT organization_id, count(*), COALESCE(sum(size_bytes),0) FROM ticket_attachments WHERE created_at <= $1 ${orgFilter ? "AND organization_id = $2" : ""} GROUP BY 1
       UNION ALL
       SELECT organization_id, count(*), COALESCE(sum(size_bytes),0) FROM employee_documents WHERE created_at <= $1 ${orgFilter ? "AND organization_id = $2" : ""} GROUP BY 1
     ) f GROUP BY org`,
    orgFilter ? [dayEnd, orgFilter] : [dayEnd],
  )).rows as { org: string; docs: number; bytes: string }[];
  const fileMap = new Map(files.map((f) => [f.org, f]));
  const seatMap = new Map(seats.map((s) => [s.org, s.n]));

  const values: unknown[] = [];
  const tuples: string[] = [];
  let p = 1;
  for (const a of act) {
    const org = planRows.find((o) => o.id === a.org);
    if (!org) continue;
    const price = priceOf(org.plan);
    values.push(
      a.org, org.name, org.slug, day, org.plan, price,
      a.actors, a.logins, a.actions, JSON.stringify(byModule.get(a.org) ?? {}),
      a.tickets, a.leave_requests,
      fileMap.get(a.org)?.docs ?? 0, Number(fileMap.get(a.org)?.bytes ?? 0),
      0, seatMap.get(a.org) ?? 0,
    );
    const base = p;
    tuples.push(`($${base},$${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9}::jsonb,$${base+10},$${base+11},$${base+12},$${base+13},$${base+14},$${base+15})`);
    p += 16;
  }
  if (tuples.length === 0) {
    skippedEmpty++;
    continue;
  }
  const chunk = 500;
  for (let i = 0; i < tuples.length; i += Math.floor(chunk / 16)) {
    const sliceT = tuples.slice(i, i + Math.floor(chunk / 16));
    const sliceV = values.slice(i * 16, (i + Math.floor(chunk / 16)) * 16);
    await client.query(
      `INSERT INTO platform.tenant_usage_daily
        (org_id, org_name, org_slug, day, plan, seat_price_cents, active_users, logins, actions, by_module, tickets_created, leave_requests, documents_stored, storage_bytes, mutations, seats_active)
       VALUES ${sliceT.join(",")}
       ON CONFLICT (org_id, day) DO NOTHING`,
      sliceV,
    );
    upserted += sliceT.length;
  }
  console.log(JSON.stringify({ day, rows: tuples.length }));
}

console.log(JSON.stringify({ done: true, upserted, skippedEmptyDays: skippedEmpty, days: DAYS }));
await client.end();
