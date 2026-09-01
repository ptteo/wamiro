/**
 * Migration runner.
 * Prefers the official `pg` driver when node_modules exists (battle-tested
 * SCRAM/TLS); falls back to the dependency-free pg-lite client otherwise.
 * Usage: npm run db:migrate:raw
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

function readEnv() {
  try {
    for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* .env optional */
  }
  return process.env.DATABASE_URL;
}

const url = readEnv();
if (!url) {
  console.error("DATABASE_URL not found (.env or environment)");
  process.exit(1);
}
const host = new URL(url).host;

// hard verdict within 120s no matter what
setTimeout(() => {
  console.error("WATCHDOG: migration did not finish in 120s — killing.");
  process.exit(1);
}, 120_000);

process.on("unhandledRejection", (e) => {
  console.error("UNHANDLED:", e?.message ?? e);
});

// Run every scripts/migration-*.sql in filename order (MIGRATION_FILE overrides).
const files = process.env.MIGRATION_FILE
  ? [process.env.MIGRATION_FILE]
  : readdirSync(here)
      .filter((f) => /^migration-\d+.*\.sql$/.test(f))
      .sort();

let statements = [];
for (const f of files) {
  const text = readFileSync(join(here, f), "utf8");
  const parts = text
    .split(/^--> statement-breakpoint.*$/m)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => ({ file: f, sql: s }));
  console.log(`loaded ${parts.length} statements from ${f}`);
  statements = statements.concat(parts);
}

/** @returns {[fn:(sql:string)=>Promise<any>, ()=>Promise<void>, string]} */
async function pickDriver() {
  try {
    const pg = await import("pg");
    const needsSsl = /[?&]sslmode=require/.test(url);
    // strip sslmode from the connstring: newer pg treats require as verify-full
    // and would override our explicit ssl option below.
    const cleanUrl = url.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");
    // eslint-disable-next-line import/namespace
    const Client = pg.Client ?? pg.default?.Client;
    if (!Client) throw new Error("pg.Client missing");
    const client = new Client({
      connectionString: cleanUrl,
      ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    console.log("driver: pg (official)");
    await client.connect();
    return [
      (sql) => client.query(sql),
      () => client.end(),
      "pg",
    ];
  } catch (e) {
    console.log(`driver: pg unavailable (${String(e).slice(0, 60)}), using pg-lite`);
    const { connect } = await import("./pg-lite.mjs");
    const db = await connect(url, (stage) => console.log(`  · ${stage}`));
    return [
      (sql) => db.query(sql),
      () => db.end(),
      "pg-lite",
    ];
  }
}

let exec, close, driverName;
try {
  console.log(`connecting to ${host} …`);
  [exec, close, driverName] = await pickDriver();

  let applied = 0;
  for (const [i, { file, sql: stmt }] of statements.entries()) {
    const label = `[${file}] ${stmt.replace(/\s+/g, " ").slice(0, 48)}`;
    try {
      await exec(stmt);
      applied++;
      console.log(`  ok   (${i + 1}/${statements.length}) ${label}`);
    } catch (e) {
      if (/already exists/i.test(e.message)) {
        console.log(`  skip (${i + 1}/${statements.length}) ${label} — exists`);
        continue;
      }
      throw e;
    }
  }
  console.log(`[${driverName}] migration complete: ${applied}/${statements.length} statements applied`);

  const check = await exec(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`,
  );
  const names = check.rows.map((r) => r.table_name ?? r[0]).join(", ");
  console.log("tables now present:", names);
  process.exit(0);
} catch (e) {
  console.error(`[${driverName ?? "?"}] MIGRATION FAILED:`, e.message);
  process.exit(1);
}
