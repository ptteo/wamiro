/**
 * Phase F — background jobs worker. Thin wrapper around the jobs registry in
 * src/modules/platform/jobs.ts; run under systemd like the app:
 *   npm run jobs:worker          (loop: tick every JOBS_TICK_SECONDS, default 60s)
 *   npm run jobs:once            (run every job once, exit — for cron/timers)
 */
import "../src/lib/env.ts"; // load .env for standalone execution
import "@/lib/event-consumers"; // register consumers so sweeps' events fan out

import { pool } from "@/lib/db";
import { tick } from "@/modules/platform/jobs";

await tick();
if (process.argv.includes("--once")) {
  await pool.end();
} else {
  console.log(JSON.stringify({ level: "info", msg: "jobs_worker_started", tickSeconds: Number(process.env.JOBS_TICK_SECONDS ?? 60) }));
  const intervalMs = Number(process.env.JOBS_TICK_SECONDS ?? 60) * 1000;
  setInterval(() => void tick().catch((e) => console.error(JSON.stringify({ level: "error", msg: "jobs_tick_failed", err: String(e) }))), intervalMs);
}
