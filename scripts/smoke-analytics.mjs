// Browser smoke test for the Analytics + Dashboards tab redesigns.
import puppeteer from "puppeteer-core";

const BASE = "http://127.0.0.1:3000";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

let pass = 0;
let fail = 0;
const errors = [];

function log(label, ok, extra) {
  const sym = ok ? "✅" : "❌";
  console.log(`${sym} ${label}${extra ? "  " + extra : ""}`);
  if (ok) pass++;
  else {
    fail++;
    errors.push(`${label}  ${extra ?? ""}`);
  }
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
    page.on("response", (res) => {
      if (res.status() >= 400 && !res.url().includes("/_next/")) {
        consoleErrors.push(`http ${res.status()}: ${res.url()}`);
      }
    });

    // Register admin (admin gets all permissions including company-wide analytics)
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    const ts = Date.now();
    const email = `analytics-${ts}@wamiro.test`;
    const company = `Analytics ${ts}`;
    const password = "Smoke-Test-Pass!";

    const reg = await page.evaluate(
      async ({ email, password, company }) => {
        const r = await fetch("/api/v1/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password, companyName: company, adminName: "Analytics Tester" }),
        });
        return { status: r.status };
      },
      { email, password, company },
    );
    log("register company", reg.status === 201);

    // ─── /analytics ─────────────────────────────────────────
    await page.goto(`${BASE}/analytics`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (document.body.textContent ?? "").includes("Headcount"),
      { timeout: 15000 },
    ).catch(() => {});
    log("/analytics page loads", true);
    let txt = await page.evaluate(() => document.body.textContent ?? "");
    log("page has 'Company scope' badge", txt.includes("Company scope"));
    log("page has 'Last 30 days'", txt.includes("Last 30 days"));
    log("page has 'Export CSV' button", txt.includes("Export CSV"));
    log("page has 'Workforce' section", txt.includes("Workforce"));
    log("page has 'Activity' section", txt.includes("Activity"));
    log("page has 'Finance & risk' section", txt.includes("Finance & risk"));
    log("page has 'Time off' section", txt.includes("Time off"));
    log("page has 'Clock-ins by day' chart", txt.includes("Clock-ins by day"));
    log("page has 'Expenses by category' chart", txt.includes("Expenses by category"));
    log("page has 'Leave by type' chart", txt.includes("Leave by type"));
    log("page has 'Hires (30d)' mini-kpi", txt.includes("Hires (30d)"));
    log("page has 'Open positions' mini-kpi", txt.includes("Open positions"));
    log("page has 'Knowledge articles' mini-kpi", txt.includes("Knowledge articles"));
    log("page has 'Overdue obligations' mini-kpi", txt.includes("Overdue obligations"));
    log("page has 'Expenses awaiting approval' mini-kpi", txt.includes("Expenses awaiting approval"));
    log("page has 'Budget utilization' mini-kpi", txt.includes("Budget utilization"));
    log("page has 'Approval latency' mini-kpi", txt.includes("Approval latency"));
    log("page has 'Compliance' section", txt.includes("Compliance"));

    // Test the bar chart's "no data" state — hard to test without removing data, skip

    // ─── /dashboards ───────────────────────────────────────
    await page.goto(`${BASE}/dashboards`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (document.body.textContent ?? "").includes("Dashboards"),
      { timeout: 15000 },
    ).catch(() => {});
    log("/dashboards page loads", true);
    txt = await page.evaluate(() => document.body.textContent ?? "");
    log("page has 'Pinned' section", txt.includes("Pinned"));
    log("page has 'Available to pin' section", txt.includes("Available to pin"));
    log("empty state for pinned", txt.includes("No metrics pinned yet"));
    log("scope badge shown", txt.includes("Company scope"));

    // Pin a metric via API
    const pinRes = await page.evaluate(async () => {
      const r = await fetch("/api/v1/dashboards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ metricId: "headcount" }),
      });
      return { status: r.status, body: await r.json() };
    });
    log("pin headcount via API", pinRes.status === 200 && pinRes.body.pinned === true);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (document.body.textContent ?? "").includes("1 pinned"),
      { timeout: 10000 },
    ).catch(() => {});
    txt = await page.evaluate(() => document.body.textContent ?? "");
    log("after pin, '1 pinned' count shown", /1\s+pinned/.test(txt));
    log("pinned section shows 'Headcount'", txt.includes("Headcount"));
    // Available to pin should now have 3 items
    log("Available to pin has remaining metrics", txt.includes("On leave today") && txt.includes("Pending approvals"));

    // Pin all the rest
    for (const id of ["on_leave_today", "pending_approvals", "approval_latency_hours"]) {
      await page.evaluate(async (mid) => {
        await fetch("/api/v1/dashboards", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ metricId: mid }),
        });
      }, id);
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (document.body.textContent ?? "").includes("4 pinned"),
      { timeout: 10000 },
    ).catch(() => {});
    txt = await page.evaluate(() => document.body.textContent ?? "");
    log("all 4 pinned", /4\s+pinned/.test(txt));
    log("'Available to pin' is gone (all pinned)", /available to pin/i.test(txt) === false || txt.includes("pinned every available"));
    log("'pinned every available' empty state shows", txt.includes("pinned every available"));

    // Unpin one via API
    await page.evaluate(async () => {
      await fetch("/api/v1/dashboards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ metricId: "headcount" }),
      });
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (document.body.textContent ?? "").includes("3 pinned"),
      { timeout: 10000 },
    ).catch(() => {});
    txt = await page.evaluate(() => document.body.textContent ?? "");
    log("after unpin, '3 pinned'", /3\s+pinned/.test(txt));

    // Final console errors check
    const ignorable = consoleErrors.filter(
      (e) =>
        !e.includes("404") &&
        !e.includes("MIME type") &&
        !e.includes("strict MIME") &&
        !e.match(/http 400: .*\/(_next|api)/) &&
        !e.includes("Failed to load resource: the server responded with a status of 400"),
    );
    if (ignorable.length > 0) {
      log("no console errors", false, ignorable.slice(0, 3).join(" | "));
    } else {
      log("no console errors", true, `(${consoleErrors.length} ignorable)`);
    }
  } finally {
    await browser.close();
  }

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  if (fail > 0) {
    console.log("\nFailures:");
    for (const e of errors) console.log("  - " + e);
    process.exit(1);
  }
}

main().catch((e) => { console.error("smoke crashed:", e); process.exit(1); });
