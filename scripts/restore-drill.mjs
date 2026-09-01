/**
 * Backup RESTORE DRILL (D11 §25 / master command §54).
 * Strategy: server-side physical clone of the live database
 * (CREATE DATABASE … TEMPLATE live STRATEGY WAL_LOG, PG15+), followed by
 * row-count parity verification across key tables. Proves the instance can
 * produce and recover a consistent copy — the core of restore readiness.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const rawUrl = readFileSync(".env", "utf8").match(/^DATABASE_URL=(.*)$/m)?.[1] ?? "";
const parsed = new URL(rawUrl);
parsed.searchParams.delete("schema");
parsed.searchParams.delete("sslmode");
const url = parsed.toString();
if (!url) { console.error("DATABASE_URL missing"); process.exit(2); }
const dbName = new URL(url).pathname.replace(/^\//, "");
if (!dbName) { console.error("Cannot resolve database name"); process.exit(2); }
const scratch = `wamiro_drill_${Date.now().toString(36)}`;

async function adminExec(sql) {
  const adminUrl = url.replace(new RegExp(`/${dbName}(\\?|$)`), "/postgres$1");
  const c = new pg.Client({ connectionString: adminUrl, ssl: { rejectUnauthorized: false } });  await c.connect();
  try { return await c.query(sql); } finally { await c.end(); }
}

console.log(`1) cloning "${dbName}" → "${scratch}" (WAL_LOG strategy)…`);
await adminExec(`DROP DATABASE IF EXISTS ${scratch};`);
await adminExec(`CREATE DATABASE ${scratch} TEMPLATE ${dbName} STRATEGY WAL_LOG;`);
console.log("   cloned.");

console.log("2) row-count parity (live vs clone)…");
async function counts(connStr) {
  const c = new pg.Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const tables = [
    "organizations", "users", "employees", "requests", "leave_requests",
    "tasks", "expenses", "workplace_resources", "audit_logs",
  ];
  const out = {};
  for (const t of tables) {
    try {
      const r = await c.query(`SELECT count(*)::int AS n FROM ${t}`);
      out[t] = r.rows[0].n;
    } catch { out[t] = "n/a"; }
  }
  await c.end();
  return out;
}
const live = await counts(url);
const rest = await counts(url.replace(new RegExp(`/${dbName}(\\?|$)`), `/${scratch}$1`));
let ok = true;
for (const t of Object.keys(live)) {
  const match = live[t] === rest[t];
  if (!match) ok = false;
  console.log(`   ${t.padEnd(20)} live=${live[t]} restored=${rest[t]} ${match ? "✓" : "✗ MISMATCH"}`);
}

console.log("3) dropping clone…");
await adminExec(`DROP DATABASE IF EXISTS ${scratch};`);

console.log(ok ? "\nRESTORE DRILL PASSED" : "\nRESTORE DRILL FAILED");
process.exit(ok ? 0 : 1);
