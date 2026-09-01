#!/usr/bin/env node
/**
 * R12 — multi-tenant simulation harness.
 *
 * Provisions N isolated tenants through the PUBLIC API (register), then drives
 * a realistic per-tenant workload (identity + directory + search + notifications)
 * while collecting latency samples. Emits a p50/p95 summary and asserts the
 * core isolation invariant (tenant-scoped search) for every tenant.
 *
 * Usage: node scripts/simulate-tenants.mjs [--tenants 8] [--reqs-per-check 5]
 */
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    "base-url": { type: "string", default: process.env.SIM_BASE_URL ?? "http://127.0.0.1:3000" },
    tenants: { type: "string", default: "8" },
    "reqs-per-check": { type: "string", default: "4" },
  },
});
const BASE = values["base-url"].replace(/\/$/, "");
const N = Math.max(1, Math.min(parseInt(values.tenants, 10) || 8, 100));
const REPS = Math.max(1, Math.min(parseInt(values["reqs-per-check"], 10) || 4, 20));
const RUN = Date.now().toString(36);

class Client {
  constructor() { this.cookie = null; }
  async req(method, path, body) {
    const t0 = performance.now();
    const res = await fetch(BASE + path, {
      method,
      headers: {
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        origin: BASE,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    const ms = Math.round(performance.now() - t0);
    const sc = res.headers.getSetCookie?.() ?? [];
    if (sc.length) this.cookie = sc[0].split(";")[0];
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    return { status: res.status, body: json, ms };
  }
}

function pct(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
}
function summarize(label, arr) {
  console.log(`${label.padEnd(28)} n=${String(arr.length).padStart(4)}  p50=${pct(arr, 0.5)}ms  p95=${pct(arr, 0.95)}ms  max=${Math.max(...arr)}ms`);
}

console.log(`R12 simulation — ${N} tenants × ${REPS} checks · base=${BASE} run=${RUN}`);
const latencies = { register: [], me: [], search: [], notifications: [] };
let isolationFailures = 0;
let failures = 0;

for (let i = 0; i < N; i++) {
  const c = new Client();
  const email = `sim-${RUN}-${i}@t.test`;
  const r = await c.req("POST", "/api/v1/auth/register", {
    companyName: `Sim ${RUN} ${i}`, adminName: `Sim Admin ${i}`,
    email, password: "Sim-Passw0rd!x",
  });
  latencies.register.push(r.ms);
  if (r.status !== 201) { failures++; console.log(`tenant ${i}: register HTTP ${r.status}`); continue; }

  // tenant marker: department name unique to this tenant
  const marker = `MK-${RUN}-${i}`;
  const d = await c.req("POST", "/api/v1/departments", { name: marker });
  if (![200, 201].includes(d.status)) { failures++; console.log(`tenant ${i}: dept HTTP ${d.status}`); continue; }

  for (let k = 0; k < REPS; k++) {
    const me = await c.req("GET", "/api/v1/me");
    latencies.me.push(me.ms);
    const s = await c.req("GET", "/api/v1/search?q=MK-");
    latencies.search.push(s.ms);
    // isolation invariant: this tenant sees ONLY its own marker
    const leaked = (s.body?.results ?? []).some(
      (h) => !h.subtitle.includes(marker) && h.title.includes("MK-"),
    );
    if (leaked) { isolationFailures++; console.log(`tenant ${i}: CROSS-TENANT LEAK in search`); }
    const n = await c.req("GET", "/api/v1/notifications");
    latencies.notifications.push(n.ms);
  }
}

console.log("\n— latency summary —");
summarize("register tenant", latencies.register);
summarize("GET /me", latencies.me);
summarize("GET /search", latencies.search);
summarize("GET /notifications", latencies.notifications);
console.log(`\ntenants=${N} failures=${failures} isolationFailures=${isolationFailures}`);
process.exit(failures || isolationFailures ? 1 : 0);
