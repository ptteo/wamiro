#!/usr/bin/env node
// Smoke-test the goals module against a running prod server.
// Usage: node scripts/smoke-goals.mjs
import { setTimeout as sleep } from "node:timers/promises";

const BASE = "http://127.0.0.1:3000";

function log(label, ok, extra) {
  const sym = ok ? "✅" : "❌";
  console.log(`${sym} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  // 1) register a fresh company so we have a clean state
  const ts = Date.now();
  const email = `goals-smoke-${ts}@wamiro.test`;
  const company = `Goals Smoke ${ts}`;
  const password = "Sm0ke-Test-Pass!";

  const reg = await fetch(`${BASE}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, companyName: company, adminName: "Smoke Tester" }),
  });
  log("register company", reg.status === 201 || reg.status === 200, `status=${reg.status}`);
  if (!reg.ok) {
    console.log(await reg.text());
    return;
  }
  const regBody = await reg.json();
  const cookie = reg.headers.get("set-cookie")?.split(";")[0] ?? "";
  log("got session cookie", !!cookie);

  // 2) GET goals (should be empty list)
  const list0 = await fetch(`${BASE}/api/v1/goals`, { headers: { cookie } });
  const list0Body = await list0.json();
  log("GET /api/v1/goals (empty)", list0.ok && Array.isArray(list0Body.goals) && list0Body.goals.length === 0, `count=${list0Body.goals?.length}`);

  // 3) POST a goal
  const create = await fetch(`${BASE}/api/v1/goals`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      title: "Ship v1 to 100 customers",
      description: "Get 100 paying customers by end of Q4",
      dueDate: "2099-12-31",
    }),
  });
  const createBody = await create.json();
  log("POST /api/v1/goals", create.ok && !!createBody.id, `id=${createBody.id} status=${create.status}`);
  const goalId = createBody.id;

  // 4) GET goals (should now have 1)
  const list1 = await fetch(`${BASE}/api/v1/goals`, { headers: { cookie } });
  const list1Body = await list1.json();
  log("GET /api/v1/goals (1 active)", list1.ok && list1Body.goals.length === 1, `count=${list1Body.goals.length}`);

  // 5) PATCH progress to 25
  const p25 = await fetch(`${BASE}/api/v1/goals/${goalId}/progress`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ progress: 25 }),
  });
  log("PATCH progress=25", p25.ok, `status=${p25.status}`);

  // 6) GET again, verify 25
  const list2 = await fetch(`${BASE}/api/v1/goals`, { headers: { cookie } });
  const list2Body = await list2.json();
  const g = list2Body.goals.find((x) => x.id === goalId);
  log("progress=25 reflected in list", g?.progress === 25, `progress=${g?.progress} status=${g?.status}`);

  // 7) PATCH progress to 100 -> should auto-complete
  const p100 = await fetch(`${BASE}/api/v1/goals/${goalId}/progress`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ progress: 100 }),
  });
  log("PATCH progress=100", p100.ok, `status=${p100.status}`);

  // 8) Default list (includeDone=false) should not include the done one
  const list3 = await fetch(`${BASE}/api/v1/goals`, { headers: { cookie } });
  const list3Body = await list3.json();
  log("done goal hidden from default list", list3.ok && list3Body.goals.length === 0, `count=${list3Body.goals.length}`);

  // 9) create another (no due date, no description) and exercise validation
  const createNoFields = await fetch(`${BASE}/api/v1/goals`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Empty fields OK" }),
  });
  log("POST minimal goal", createNoFields.ok, `status=${createNoFields.status}`);

  // 10) create with missing title -> should 400
  const createBad = await fetch(`${BASE}/api/v1/goals`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ description: "no title" }),
  });
  log("POST missing title -> 400", createBad.status === 400, `status=${createBad.status}`);

  // 11) PATCH on non-existent goal -> should 404
  const patch404 = await fetch(`${BASE}/api/v1/goals/00000000-0000-0000-0000-000000000000/progress`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ progress: 50 }),
  });
  log("PATCH non-existent -> 404", patch404.status === 404, `status=${patch404.status}`);

  // 12) PATCH progress > 100 -> 400
  const patchBad = await fetch(`${BASE}/api/v1/goals/${goalId}/progress`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ progress: 150 }),
  });
  log("PATCH progress=150 -> 400", patchBad.status === 400, `status=${patchBad.status}`);

  // 13) Unauthenticated GET -> 401
  const list401 = await fetch(`${BASE}/api/v1/goals`);
  log("GET unauthenticated -> 401", list401.status === 401, `status=${list401.status}`);
}

main().catch((e) => { console.error("smoke crashed:", e); process.exit(1); });
