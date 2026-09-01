#!/usr/bin/env node
// Dump the rendered /goals page HTML for inspection.
const BASE = "http://127.0.0.1:3000";
const ts = Date.now();
const email = `goals-dump-${ts}@wamiro.test`;
const password = "Sm0ke-Test-Pass!";

const reg = await fetch(`${BASE}/api/v1/auth/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password, companyName: `Dump ${ts}`, adminName: "Dump" }),
});
const cookie = reg.headers.get("set-cookie")?.split(";")[0] ?? "";

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
  if (progress > 0) {
    await fetch(`${BASE}/api/v1/goals/${b.id}/progress`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ progress }),
    });
  }
  return b.id;
};

await mk("Reach 100 customers", future, 30);
await mk("Onboard new hires", past, 60);
await mk("Hire CEO", today, 100);

const page = await fetch(`${BASE}/goals`, { headers: { cookie } });
const html = await page.text();
console.log(html);
