#!/usr/bin/env node
// Browser-style UI smoke test for the Goals module.
// Uses the session cookie to GET the page HTML and the APIs that the page
// itself uses, then asserts on the rendered structure.
import { setTimeout as sleep } from "node:timers/promises";

const BASE = "http://127.0.0.1:3000";

function log(label, ok, extra) {
  const sym = ok ? "✅" : "❌";
  console.log(`${sym} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  // 1) Register a fresh company
  const ts = Date.now();
  const email = `goals-ui-${ts}@wamiro.test`;
  const company = `Goals UI ${ts}`;
  const password = "Sm0ke-Test-Pass!";

  const reg = await fetch(`${BASE}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, companyName: company, adminName: "UI Smoke" }),
  });
  log("register", reg.status === 201, `status=${reg.status}`);
  if (!reg.ok) {
    console.log(await reg.text());
    return;
  }
  const cookie = reg.headers.get("set-cookie")?.split(";")[0] ?? "";

  // 2) GET /goals HTML
  const pageRes = await fetch(`${BASE}/goals`, { headers: { cookie } });
  const html = await pageRes.text();
  log("/goals returns 200", pageRes.ok, `status=${pageRes.status}`);

  // Check for canonical page chrome
  log("page has 'Goals' header", /Goals<\/h1>/.test(html));
  log("page has 'No goals' empty state", /No goals yet/.test(html));
  log("page has 'New goal' button", /New goal/.test(html));
  log("page has 'Search goals' input", /Search goals/.test(html));
  log("page has 'All status' filter", /All status/.test(html));
  log("page has 'At risk' filter", /At risk/.test(html));
  log("page has 'Active' filter", />Active</.test(html));
  log("page has 'Completed' filter", />Completed</.test(html));

  // 3) Seed some goals: 1 due-today (at risk), 1 due-future, 1 done
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const past = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const mk = async (title, dueDate, progress) => {
    const r = await fetch(`${BASE}/api/v1/goals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title, dueDate }),
    });
    const b = await r.json();
    if (progress > 0 && progress < 100) {
      await fetch(`${BASE}/api/v1/goals/${b.id}/progress`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ progress }),
      });
    }
    if (progress === 100) {
      await fetch(`${BASE}/api/v1/goals/${b.id}/progress`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ progress: 100 }),
      });
    }
    return b.id;
  };

  const id1 = await mk("Reach 100 customers", future, 30);  // active, future
  const id2 = await mk("Onboard new hires", past, 60);       // active, overdue
  const id3 = await mk("Hire CEO", today, 100);              // done

  log("seeded 3 goals (active-future, active-overdue, done)", !!id1 && !!id2 && !!id3);

  // 4) Re-fetch /goals with the seed
  const page2 = await fetch(`${BASE}/goals`, { headers: { cookie } });
  const html2 = await page2.text();
  log("/goals shows 'Reach 100 customers'", /Reach 100 customers/.test(html2));
  log("/goals shows 'Onboard new hires'", /Onboard new hires/.test(html2));
  log("/goals hides done 'Hire CEO' by default (status=active filter on listGoals)", !/Hire CEO/.test(html2), "— listGoals default excludes done; client doesn't refetch done unless filtered. Hmm — needs includeDone=true on the page.");

  // 5) Filter via includeDone: since the page always calls includeDone=true, the client has all goals
  // Check the page already includes 'Hire CEO'
  log("page shows 'Hire CEO' (done goal included via includeDone=true)", /Hire CEO/.test(html2));

  // 6) Section titles present
  log("page has 'At risk' section", /At risk/.test(html2));
  log("page has 'Active' section", /Active/.test(html2));
  log("page has 'Completed' section", /Completed/.test(html2));

  // 7) Overdue badge present
  log("page marks 'Onboard new hires' as Overdue", /Onboard new hires[\s\S]{0,200}Overdue/.test(html2));

  // 8) Inline slider is present (input type=range)
  const sliderCount = (html2.match(/<input[^>]*type="range"/g) || []).length;
  log("page renders range sliders for editable goals", sliderCount >= 1, `count=${sliderCount}`);

  // 9) Owner avatar with name
  log("page shows owner name (UI Smoke)", /UI Smoke/.test(html2));

  // 10) Progress %
  log("page shows 30% for Reach 100 customers", /Reach 100 customers[\s\S]{0,500}>30%</.test(html2));
  log("page shows 60% for Onboard new hires", /Onboard new hires[\s\S]{0,500}>60%</.test(html2));
  log("page shows 100% for Hire CEO", /Hire CEO[\s\S]{0,500}>100%</.test(html2));

  // 11) Summary line
  log("page shows summary '3 goal'", /3 goal/.test(html2));
  log("page shows '2 active'", /2 active/.test(html2));
  log("page shows '1 done'", /1 done/.test(html2));
  log("page shows '1 at risk'", /1 at risk/.test(html2));
  log("page shows '3 owned by you'", /3 owned by you/.test(html2));

  // 12) "You" pill (since the admin owns everything)
  const youCount = (html2.match(/>You</g) || []).length;
  log("'You' pill shown for owned goals", youCount >= 3, `count=${youCount}`);

  // 13) New goal form
  log("'New goal' button is rendered", />New goal</.test(html2));
}

main().catch((e) => { console.error("ui smoke crashed:", e); process.exit(1); });
