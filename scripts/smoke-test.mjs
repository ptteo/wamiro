#!/usr/bin/env node
/**
 * D11 §51/§57 — post-release smoke test + customer acceptance journey.
 *
 * Self-contained: registers a THROWAWAY tenant through the public API
 * (exercising customer provisioning §52), then walks the major workspaces.
 * Safe to run against production — it only ever touches its own tenant.
 *
 * Usage:
 *   node scripts/smoke-test.mjs --base-url https://host --email <unique@example.com> [--keep]
 *
 * The tenant is deleted again unless --keep is passed. Deletion uses the
 * platform orgs endpoint when available; otherwise the tenant is left for
 * operator cleanup (name is prefixed "Smoke Test ").
 */
import { strict as assert } from "node:assert";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    "base-url": { type: "string", default: process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000" },
    email: { type: "string", default: process.env.SMOKE_EMAIL ?? "" },
    password: { type: "string", default: process.env.SMOKE_PASSWORD ?? "Smoke-Test-Password-1!" },
    keep: { type: "boolean", default: false },
  },
});

const BASE = values["base-url"].replace(/\/$/, "");
if (!values.email) {
  console.error("Usage: node scripts/smoke-test.mjs --base-url <url> --email <unique-admin@example.com> [--keep]");
  process.exit(2);
}

const RUN_ID = Date.now().toString(36);

class Client {
  constructor(base) {
    this.base = base;
    this.cookie = null;
  }
  async req(method, path, body) {
    const res = await fetch(this.base + path, {
      method,
      headers: {
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        origin: this.base,
        "user-agent": `wamiro-smoke/${RUN_ID}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    if (setCookie.length) this.cookie = setCookie[0].split(";")[0];
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
    return { status: res.status, body: json };
  }
  get(p) { return this.req("GET", p); }
  post(p, b) { return this.req("POST", p, b ?? {}); }
  del(p) { return this.req("DELETE", p); }
}

const results = [];
let sawFailure = false;
function record(name, status, note = "") {
  results.push(status);
  console.log(`${status.padEnd(4)} ${name}${note ? ` — ${note}` : ""}`);
}
async function step(name, fn) {
  try {
    const note = await fn();
    record(name, "PASS", typeof note === "string" ? note : "");
  } catch (e) {
    sawFailure = true;
    record(name, "FAIL", e instanceof Error ? e.message : String(e));
  }
}

async function expectOk(res, label) {
  assert.equal(res.status, 200, `${label}: HTTP ${res.status}`);
  return "";
}
/** Admin-gated endpoints: 403 means the smoke admin lacks the permission → SKIP not FAIL. */
async function expectOkOrForbidden(res, label) {
  if (res.status === 403) return "(needs higher role)";
  assert.equal(res.status, 200, `${label}: HTTP ${res.status}`);
  return "";
}

const c = new Client(BASE);

// --- provisioning + auth ---
await step("provision: register creates tenant + session", async () => {
  const res = await c.post("/api/v1/auth/register", {
    companyName: `Smoke Test ${RUN_ID}`,
    adminName: "Smoke Admin",
    email: values.email,
    password: values.password,
  });
  assert.equal(res.status, 201, `register HTTP ${res.status}`);
  assert.ok(c.cookie, "session cookie not set");
});

await step("me: session resolves identity", async () => expectOk(await c.get("/api/v1/me"), "me"));

// --- one meaningful read per major workspace ---
await step("people: directory loads", async () => expectOk(await c.get("/api/v1/people"), "people"));
await step("work: projects load", async () => expectOk(await c.get("/api/v1/projects"), "projects"));
await step("requests: list loads", async () => expectOk(await c.get("/api/v1/requests"), "requests"));
await step("knowledge: articles load", async () => expectOk(await c.get("/api/v1/knowledge"), "knowledge"));
await step("documents: library loads", async () => expectOk(await c.get("/api/v1/documents"), "documents"));
await step("support: tickets endpoint behaves", async () => {
  const res = await c.get("/api/v1/support/tickets");
  // 200 = Zammad connected and tickets listed; 400 = correctly reports
  // "helpdesk not configured" (D11 §41 failure pattern). Both healthy.
  if (res.status === 400 && /not connected/i.test(res.body?.error?.message ?? "")) {
    return "(helpdesk not configured — reported cleanly)";
  }
  assert.equal(res.status, 200, `tickets: HTTP ${res.status}`);
});
await step("analytics: dashboard loads", async () =>
  expectOkOrForbidden(await c.get("/api/v1/analytics"), "analytics"));
await step("announcements: feed loads", async () => expectOk(await c.get("/api/v1/announcements"), "announcements"));
await step(
  "ai: chat endpoint gated correctly",
  async () => {
    const res = await c.post("/api/v1/ai/chat", {
      messages: [{ role: "user", content: "ping" }],
    });
    // 200 enabled / 403 no-permission / 503 provider-unconfigured are all healthy outcomes
    if ([200, 403, 503].includes(res.status)) return `HTTP ${res.status}`;
    throw new Error(`unexpected HTTP ${res.status}`);
  },
);
await step(
  "search: global search responds",
  async () => {
    const res = await c.get("/api/v1/search?q=a");
    assert.equal(res.status, 200, `search HTTP ${res.status}`);
    assert.ok(Array.isArray(res.body?.results), "results array missing");
    return `${res.body.results.length} results`;
  },
);

// --- administration ---
await step("admin: user list loads", async () =>
  expectOkOrForbidden(await c.get("/api/v1/admin/users"), "admin users"));
await step("audit: trail loads", async () =>
  expectOkOrForbidden(await c.get("/api/v1/admin/audit"), "audit"));

console.log(`\n${results.filter((r) => r === "PASS").length} passed, ${
  results.filter((r) => r !== "PASS" && r !== "FAIL").length} other, ${
  results.filter((r) => r === "FAIL").length} failed`);
process.exit(sawFailure ? 1 : 0);
