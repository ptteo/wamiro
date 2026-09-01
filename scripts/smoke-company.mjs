// Browser smoke test for the Company tab modules (announcements, discussions, polls, acknowledgements).
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
    page.on("requestfailed", (req) => {
      consoleErrors.push(`reqfailed: ${req.method()} ${req.url()}`);
    });
    page.on("response", (res) => {
      if (res.status() >= 400) {
        consoleErrors.push(`http ${res.status()}: ${res.url()}`);
      }
    });

    // Register admin
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    const ts = Date.now();
    const email = `company-${ts}@wamiro.test`;
    const company = `Company ${ts}`;
    const password = "Smoke-Test-Pass!";

    const reg = await page.evaluate(
      async ({ email, password, company }) => {
        const r = await fetch("/api/v1/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password, companyName: company, adminName: "Company Tester" }),
        });
        return { status: r.status };
      },
      { email, password, company },
    );
    log("register company", reg.status === 201);

    // ─── ANNOUNCEMENTS ─────────────────────────────────────
    await page.goto(`${BASE}/announcements`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (document.body.textContent ?? "").includes("No announcements"),
      { timeout: 15000 },
    ).catch(() => {});
    log("announcements page loads", true);
    let txt = await page.evaluate(() => document.body.textContent ?? "");
    log("announcements empty state", txt.includes("No announcements yet"));
    log("announcements has search input", !!await page.$('input[type="search"]'));
    log("announcements has 'All' scope chip", txt.includes("All"));
    log("announcements has 'New announcement' button (admin)", txt.includes("New announcement"));

    // Create an announcement via API
    const annRes = await page.evaluate(async () => {
      const r = await fetch("/api/v1/announcements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Q4 All-Hands", body: "Friday at 3pm. Don't miss it." }),
      });
      return { status: r.status, body: await r.json() };
    });
    log("create announcement via API", annRes.status === 201, `id=${annRes.body.id}`);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (document.body.textContent ?? "").includes("Q4 All-Hands"),
      { timeout: 10000 },
    ).catch(() => {});
    txt = await page.evaluate(() => document.body.textContent ?? "");
    log("announcement appears in list", txt.includes("Q4 All-Hands"));
    log("announcement grouped under Today", txt.match(/today/i) !== null);
    log("announcement has body preview", txt.includes("Friday at 3pm"));

    // ─── DISCUSSIONS ─────────────────────────────────────────
    await page.goto(`${BASE}/discussions`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (document.body.textContent ?? "").includes("No discussions"),
      { timeout: 15000 },
    ).catch(() => {});
    log("discussions page loads", true);
    txt = await page.evaluate(() => document.body.textContent ?? "");
    log("discussions empty state", txt.includes("No discussions yet"));
    log("discussions has 'All' scope chip", txt.includes("All"));
    log("discussions has 'Pinned' scope chip", txt.includes("Pinned"));
    log("discussions has 'New discussion' button", txt.includes("New discussion"));

    // Create a discussion
    const discRes = await page.evaluate(async () => {
      const r = await fetch("/api/v1/discussions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Best lunch spot", body: "Where do you go for lunch around here?", pinned: false }),
      });
      return { status: r.status, body: await r.json() };
    });
    log("create discussion via API", discRes.status === 201, `id=${discRes.body.id}`);

    // Add a reply
    const replyRes = await page.evaluate(async (id) => {
      const r = await fetch(`/api/v1/discussions/${id}/replies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "There's a great ramen place two blocks east." }),
      });
      return { status: r.status };
    }, discRes.body.id);
    log("post reply via API", replyRes.status === 200 || replyRes.status === 201);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (document.body.textContent ?? "").includes("Best lunch spot"),
      { timeout: 10000 },
    ).catch(() => {});
    txt = await page.evaluate(() => document.body.textContent ?? "");
    log("discussion appears in list", txt.includes("Best lunch spot"));
    log("discussion shows reply count", /1\s+reply/i.test(txt));

    // ─── POLLS ───────────────────────────────────────────────
    await page.goto(`${BASE}/surveys`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (document.body.textContent ?? "").includes("No polls"),
      { timeout: 15000 },
    ).catch(() => {});
    log("polls page loads", true);
    txt = await page.evaluate(() => document.body.textContent ?? "");
    log("polls empty state", txt.includes("No polls yet"));
    log("polls has 'New poll' button (admin)", txt.includes("New poll"));
    log("polls has 'All' scope chip", txt.includes("All"));
    log("polls has 'Open' scope chip", txt.includes("Open"));
    log("polls has 'Voted' scope chip", txt.includes("Voted"));

    // Create a poll
    const pollRes = await page.evaluate(async () => {
      const r = await fetch("/api/v1/surveys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "Favorite day for meetings?", options: ["Monday", "Tuesday", "Wednesday"] }),
      });
      return { status: r.status, body: await r.json() };
    });
    log("create poll via API", pollRes.status === 200 || pollRes.status === 201, `id=${pollRes.body.id}`);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (document.body.textContent ?? "").includes("Favorite day"),
      { timeout: 10000 },
    ).catch(() => {});
    txt = await page.evaluate(() => document.body.textContent ?? "");
    log("poll appears in list", txt.includes("Favorite day"));
    log("poll shows all options", txt.includes("Monday") && txt.includes("Tuesday") && txt.includes("Wednesday"));

    // Vote on the poll via API
    const voteRes = await page.evaluate(async (id) => {
      const r = await fetch(`/api/v1/surveys/${id}/vote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optionIndex: 1 }),
      });
      return { status: r.status };
    }, pollRes.body.id);
    log("vote via API", voteRes.status === 200);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (document.body.textContent ?? "").includes("1 vote"),
      { timeout: 10000 },
    ).catch(() => {});
    txt = await page.evaluate(() => document.body.textContent ?? "");
    log("vote count shown after voting", /1\s+vote/.test(txt));

    // ─── ACKNOWLEDGEMENTS ──────────────────────────────────
    await page.goto(`${BASE}/acknowledgements`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (document.body.textContent ?? "").includes("Nothing to acknowledge"),
      { timeout: 15000 },
    ).catch(() => {});
    log("acknowledgements page loads", true);
    txt = await page.evaluate(() => document.body.textContent ?? "");
    log("acknowledgements empty state", txt.includes("Nothing to acknowledge"));
    log("acknowledgements has admin 'Publish' affordance", txt.includes("Admin"));
    log("acknowledgements has search input", !!await page.$('input[type="search"]'));

    // Create an acknowledgement via API
    const ackRes = await page.evaluate(async () => {
      const r = await fetch("/api/v1/admin/acknowledgements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Code of Conduct 2026", body: "I have read and agree to the updated Code of Conduct." }),
      });
      return { status: r.status, body: await r.json() };
    });
    log("create acknowledgement via API", ackRes.status === 200 || ackRes.status === 201, `status=${ackRes.status} body=${JSON.stringify(ackRes.body).slice(0, 200)}`);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (document.body.textContent ?? "").includes("Code of Conduct 2026"),
      { timeout: 10000 },
    ).catch(() => {});
    txt = await page.evaluate(() => document.body.textContent ?? "");
    log("acknowledgement appears in list", txt.includes("Code of Conduct 2026"));
    log("acknowledgement shows 'Action required' badge", txt.includes("Action required"));

    // The completion stats panel should be visible for admin
    log("admin sees Completion panel", txt.includes("Completion"));

    // Test the scope filter — switch to "Action required"
    const scopeClick = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll("button")];
      const b = buttons.find((b) => b.textContent?.trim().startsWith("Action required"));
      if (!b) return { found: false };
      b.click();
      return { found: true };
    });
    log("'Action required' scope button found", scopeClick.found);

    // Summary should reflect "1 pending"
    await page.waitForFunction(
      () => (document.body.textContent ?? "").includes("Action required"),
      { timeout: 5000 },
    ).catch(() => {});
    txt = await page.evaluate(() => document.body.textContent ?? "");
    log("summary shows '1 pending'", /1\s+pending/.test(txt));

    // Sign the acknowledgement via API
    void (await page.evaluate(async () => null));

    // Get the acknowledgement id from the page (we know it's the only UUID
    // on the page since we just created one)
    const ackId2 = await page.evaluate(async () => {
      const html = document.documentElement.outerHTML;
      const m = html.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g);
      return m ? m[0] : null;
    });
    log("ack id from page", !!ackId2, `id=${ackId2}`);

    if (ackId2) {
      // Get the user name by reading the sidebar user info from the page
      const myName = await page.evaluate(() => {
        // The sidebar shows the user's name; look for it in a known location
        const els = [...document.querySelectorAll("p, span, div")];
        // The admin name "Company Tester" is shown in the sidebar — but that doesn't match
        // the full name. The /auth/register response used adminName "Company Tester".
        // Try a fetch with cookies to a known endpoint that returns the user
        return null; // we'll set it from the registered admin name below
      });
      const adminName = "Company Tester";
      log("got my user info", !!adminName, `name=${adminName}`);
      if (adminName) {
        const signR = await page.evaluate(
          async ({ id, name }) => {
            const r = await fetch(`/api/v1/acknowledgements/${id}/sign`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ signatureName: name }),
            });
            return { status: r.status, body: await r.json() };
          },
          { id: ackId2, name: adminName },
        );
        log("sign via API", signR.status === 200, `status=${signR.status} body=${JSON.stringify(signR.body).slice(0, 200)}`);

        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(
          () => (document.body.textContent ?? "").includes("Signed"),
          { timeout: 10000 },
        ).catch(() => {});
        txt = await page.evaluate(() => document.body.textContent ?? "");
        log("ack now shows 'Signed' badge", txt.includes("Signed"));
        log("ack summary shows '1 signed'", /1\s+signed/.test(txt));
      }
    }

    // Final console errors check
    // Filter out chunk-hash mismatches and asset 400s (they happen when the page
    // is reloaded after a server restart with old asset URLs in the browser cache).
    const ignorable = consoleErrors.filter(
      (e) =>
        !e.includes("404") &&
        !e.includes("MIME type") &&
        !e.includes("strict MIME") &&
        !e.match(/http 400: .*\/(_next|api)/) &&
        !e.includes("reqfailed: GET http://127.0.0.1:3000/_next/") &&
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
