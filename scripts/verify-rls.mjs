/**
 * Phase 4 — RLS verification (operator runbook).
 *
 * Confirms that row-level security is BOTH deployed and actually enforced by
 * the connected PostgreSQL instance:
 *   1. inventories migration-0057 tables: RLS enabled + FORCE + policy present
 *   2. probes real enforcement: a scratch table with a deny-all policy must
 *      return zero rows (a server that silently ignores RLS fails here —
 *      seen on RDS PostgreSQL 18.3, where catalog state is correct but
 *      enforcement never happens).
 *
 * Usage: node scripts/verify-rls.mjs
 * Exit 0 = enforced; 2 = deployed but NOT enforced; 1 = not deployed/error.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

function readEnv() {
  try {
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  } catch {
    /* .env optional */
  }
}
readEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not found (.env or environment)");
  process.exit(1);
}
const cleanUrl = url.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");
const client = new pg.Client({
  connectionString: cleanUrl,
  ...(/[?&]sslmode=require/.test(url) ? { ssl: { rejectUnauthorized: false } } : {}),
});

const EXPECTED = [
  "employees", "departments", "attendance_records", "leave_types",
  "leave_balances", "leave_requests", "requests", "request_types",
  "tickets", "notifications", "documents", "knowledge_articles",
  "projects", "tasks", "announcements",
];

try {
  await client.connect();
  const who = await client.query(
    "SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
  );
  console.log(`role: ${who.rows[0].current_user} superuser=${who.rows[0].rolsuper} bypassrls=${who.rows[0].rolbypassrls}`);
  console.log(`row_security: ${(await client.query("SHOW row_security")).rows[0].row_security}`);
  console.log(`session_replication_role: ${(await client.query("SHOW session_replication_role")).rows[0].session_replication_role}`);
  console.log(`in recovery: ${(await client.query("SELECT pg_is_in_recovery() AS r")).rows[0].r}`);

  // 1. catalog inventory
  let missing = 0;
  for (const t of EXPECTED) {
    const row = await client.query(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = $1`,
      [t],
    );
    const pol = await client.query(
      `SELECT count(*)::int AS n FROM pg_policy WHERE polrelid = $1::regclass`,
      [t],
    );
    const ok = row.rows[0]?.relrowsecurity && row.rows[0]?.relforcerowsecurity && pol.rows[0].n > 0;
    if (!ok) {
      missing += 1;
      console.log(`  MISSING ${t}: rls=${row.rows[0]?.relrowsecurity} force=${row.rows[0]?.relforcerowsecurity} policies=${pol.rows[0].n}`);
    }
  }
  if (missing > 0) {
    console.error(`RLS NOT DEPLOYED: ${missing} table(s) missing rls/force/policy — run npm run db:migrate:raw`);
    process.exit(1);
  }
  console.log(`deployed: RLS + FORCE + policy on all ${EXPECTED.length} tables ✓`);

  // 2. behavioral probe (the important part)
  const scratch = `rls_verify_${Date.now().toString(36)}`;
  await client.query(`DROP TABLE IF EXISTS ${scratch}`);
  await client.query(`CREATE TABLE ${scratch} (id int)`);
  await client.query(`ALTER TABLE ${scratch} ENABLE ROW LEVEL SECURITY`);
  await client.query(`ALTER TABLE ${scratch} FORCE ROW LEVEL SECURITY`);
  await client.query(`CREATE POLICY deny_all ON ${scratch} USING (false)`);
  await client.query(`INSERT INTO ${scratch} VALUES (1)`);
  const probe = await client.query(`SELECT count(*)::int AS n FROM ${scratch}`);
  await client.query(`DROP TABLE IF EXISTS ${scratch}`);

  if (probe.rows[0].n === 0) {
    console.log("enforcement: PROBE PASSED — a deny-all policy filtered every row ✓");
    console.log("VERDICT: row-level security is deployed AND enforced on this instance.");
    process.exit(0);
  }
  console.error("enforcement: PROBE FAILED — a deny-all policy still returned rows.");
  console.error("VERDICT: RLS is deployed but NOT enforced by this server. The policies are");
  console.error("catalog-correct, so this is a server/instance defect (seen on RDS PostgreSQL");
  console.error("18.3). The app's tenant isolation still rests on query discipline alone —");
  console.error("fix or replace the instance before relying on the second wall.");
  process.exit(2);
} catch (e) {
  console.error("verify-rls failed:", e.message);
  process.exit(1);
}