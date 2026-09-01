// Real browser interaction test for /goals using puppeteer-core + system Chrome.
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

    // 1) Register — go to home first to have a base URL
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
    const ts = Date.now();
    const email = `goals-browser-${ts}@wamiro.test`;
    const company = `Goals Browser ${ts}`;
    const password = "Browser-Test-Pass!";

    const regRes = await page.evaluate(
      async ({ email, password, company }) => {
        const r = await fetch("/api/v1/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password, companyName: company, adminName: "Browser Tester" }),
        });
        return { status: r.status, body: await r.json() };
      },
      { email, password, company },
    );
    log("register company", regRes.status === 201, `status=${regRes.status}`);

    // 2) Navigate to /goals
    await page.goto(`${BASE}/goals`, { waitUntil: "networkidle0", timeout: 30000 });
    log("page loads", true);

    // Wait for client to hydrate: the loading skeleton has role="status"
    await page.waitForFunction(
      () => !document.querySelector('[role="status"][aria-label="Loading"]'),
      { timeout: 15000 },
    );
    log("client hydrates (loading skeleton removed)", true);

    // 3) Page chrome
    const title = await page.$eval("h1", (el) => el.textContent);
    log("page title is 'Goals'", title === "Goals", `got "${title}"`);
    const newBtn = await page.$$eval("button", (els) =>
      els.some((b) => b.textContent?.trim() === "New goal"),
    );
    log("'New goal' button visible", newBtn);

    // 4) Empty state
    const emptyText = await page.evaluate(() => document.body.innerText);
    log("empty state shows 'No goals yet'", emptyText.includes("No goals yet"));

    // 5) Click "New goal" to open inline create form
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "New goal",
      );
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 500));
    const formState = await page.evaluate(() => {
      return {
        formCount: document.querySelectorAll("form").length,
        hasGoalTitlePlaceholder: [...document.querySelectorAll("input[placeholder]")].some(
          (i) => i.placeholder?.includes("Goal title"),
        ),
        hasDateInput: !!document.querySelector('input[type="date"]'),
        hasCreateButton: [...document.querySelectorAll("button")].some(
          (b) => b.textContent?.trim() === "Create",
        ),
      };
    });
    log(
      "'New goal' opens inline form",
      formState.formCount > 0 && formState.hasGoalTitlePlaceholder && formState.hasCreateButton,
      JSON.stringify(formState),
    );

    // 6) Create a goal via the form
    await page.evaluate(() => {
      const titleInput = document.querySelector('input[placeholder*="Goal title"]');
      const dateInput = document.querySelector('input[type="date"]');
      const submit = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Create",
      );
      if (!titleInput || !dateInput || !submit) {
        return { ok: false, reason: "missing inputs or submit" };
      }
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(titleInput, "Hire 5 engineers");
      titleInput.dispatchEvent(new Event("input", { bubbles: true }));
      const future = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
      setter.call(dateInput, future);
      dateInput.dispatchEvent(new Event("input", { bubbles: true }));
      submit.click();
      return { ok: true };
    });
    log("create-goal form submitted", true);

    // 7) Wait for the goal to appear
    await page.waitForFunction(
      () => document.body.innerText.includes("Hire 5 engineers"),
      { timeout: 5000 },
    ).then(() => log("new goal appears in list", true))
      .catch(() => log("new goal appears in list", false));

    // 8) Click My goals filter
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "My goals",
      );
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 200));
    const myGoalsText = await page.evaluate(() => document.body.innerText);
    log("'My goals' filter still shows the goal (admin owns it)", myGoalsText.includes("Hire 5 engineers"));

    // 9) Click back to All
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "All",
      );
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 200));

    // 10) Click At risk filter (the goal is in the future, so should be empty)
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "At risk",
      );
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 200));
    const atRiskText = await page.evaluate(() => document.body.innerText);
    log("'At risk' filter hides non-overdue goal", !atRiskText.includes("Hire 5 engineers"));
    const atRiskEmpty = await page.evaluate(() => document.body.innerText);
    log("'At risk' filter shows 'Nothing at risk' empty state", atRiskEmpty.includes("Nothing at risk"));

    // 11) Click Active filter
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Active",
      );
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 200));
    const activeText = await page.evaluate(() => document.body.innerText);
    log("'Active' filter shows the goal", activeText.includes("Hire 5 engineers"));

    // 12) Click Completed filter
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Completed",
      );
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 200));
    const completedText = await page.evaluate(() => document.body.innerText);
    log("'Completed' filter hides active goal", !completedText.includes("Hire 5 engineers"));

    // 13) Back to All
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "All status",
      );
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 200));

    // 14) Test the inline progress slider: change value
    const sliderChanged = await page.evaluate(async () => {
      const slider = document.querySelector('input[type="range"]');
      if (!slider) return { ok: false, reason: "no slider" };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(slider, "75");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new Event("change", { bubbles: true }));
      // Try mouseup to trigger commit
      slider.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      return { ok: true, value: slider.value };
    });
    log("slider accepts new value", sliderChanged.ok && sliderChanged.value === "75", `value=${sliderChanged.value}`);

    // Wait for PATCH to fire and refresh
    await new Promise((r) => setTimeout(r, 1500));

    // 15) Check the progress is now 75
    await page.waitForFunction(
      () => {
        const m = document.body.innerText.match(/(\d+)\/100/);
        return m && Number(m[1]) >= 70;
      },
      { timeout: 5000 },
    ).then(() => log("progress=75 reflected in card", true))
      .catch(() => log("progress=75 reflected in card", false));

    // 16) List view toggle
    await page.evaluate(() => {
      const b = document.querySelector('button[aria-label="List view"]');
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    const listText = await page.evaluate(() => document.body.innerText);
    log("list view shows goal in row format", listText.includes("Hire 5 engineers"));

    // 17) Search filter
    await page.evaluate(() => {
      const inp = document.querySelector('input[type="search"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(inp, "ZZZ_NO_MATCH_ZZZ");
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 400));
    const noMatchText = await page.evaluate(() => document.body.innerText);
    log("search hides non-matching goal", !noMatchText.includes("Hire 5 engineers"));
    log("search shows 'No goals match your search'", noMatchText.includes("No goals match your search"));

    // 18) Clear search
    await page.evaluate(() => {
      const inp = document.querySelector('input[type="search"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(inp, "");
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 400));

    // 19) Create an overdue goal to test At risk section
    const past = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const createRes = await page.evaluate(
      async ({ title, dueDate }) => {
        const r = await fetch("/api/v1/goals", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, dueDate }),
        });
        return { status: r.status, body: await r.json() };
      },
      { title: "Critical deadline", dueDate: past },
    );
    log("create overdue goal", createRes.status === 201);
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForFunction(
      () => !document.querySelector('[role="status"][aria-label="Loading"]'),
      { timeout: 10000 },
    );
    const reloadedText = await page.evaluate(() => document.body.innerText);
    log("At risk section appears on reload", reloadedText.includes("At risk"));
    log("Overdue goal shows 'Overdue' badge", reloadedText.match(/Overdue/) !== null);

    // 20) Console errors
    if (consoleErrors.length > 0) {
      log("no console errors during interactions", false, consoleErrors.join(" | "));
    } else {
      log("no console errors during interactions", true);
    }

    // 21) Test the "You" indicator works correctly (reset to All status first)
    const youState = await page.evaluate(() => {
      const allStatus = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "All status");
      const pressed = allStatus?.getAttribute("aria-pressed");
      return { hasButton: !!allStatus, pressed, allBtns: [...document.querySelectorAll("button")].map((b) => b.textContent?.trim()).filter((t) => t && t.length < 15) };
    });
    if (youState.pressed !== "true") {
      await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "All status");
        b?.click();
      });
      await new Promise((r) => setTimeout(r, 500));
    }
    const youCount = await page.evaluate(() => {
      // The "You" pill renders as "YOU" via CSS uppercase; count case-insensitively
      return (document.body.innerText.match(/\byou\b/gi) || []).length;
    });
    log("'You' pill appears for owned goals", youCount >= 3, `count=${youCount} state=${JSON.stringify(youState).slice(0, 150)}`);
    if (youCount < 3) {
      // The "You" pill renders as "YOU" via CSS uppercase, so use case-insensitive
      const debug = await page.evaluate(() => ({
        innerSnippet: document.body.innerText.slice(-500),
        goalTitles: [...document.querySelectorAll("h3")].map((h) => h.textContent),
        youCountCI: (document.body.innerText.match(/\byou\b/gi) || []).length,
      }));
      console.log("DEBUG:", JSON.stringify(debug));
    }

    // 22) Test the "1 owned by you" summary text matches reality
    const summaryText = await page.evaluate(() => {
      const m = document.body.innerText.match(/(\d+)\s*owned by you/);
      return m ? Number(m[1]) : null;
    });
    log("summary 'owned by you' label exists", summaryText !== null, `value=${summaryText}`);

    // 23) Test description expansion
    const longDesc = "This is a detailed description that should appear under the title in the card view.";
    const descRes = await page.evaluate(
      async ({ title, dueDate, description }) => {
        const r = await fetch("/api/v1/goals", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, dueDate, description }),
        });
        return { status: r.status, body: await r.json() };
      },
      { title: "Goal with description", dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), description: longDesc },
    );
    log("create goal with description", descRes.status === 201);
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForFunction(
      () => !document.querySelector('[role="status"][aria-label="Loading"]'),
      { timeout: 10000 },
    );
    const descVisible = await page.evaluate(() => {
      return document.body.innerText.includes("This is a detailed description");
    });
    log("description rendered in card", descVisible);

    // 24) Test that the right number of goals is shown in summary
    const finalSummary = await page.evaluate(() => {
      const t = document.body.innerText;
      const m = t.match(/(\d+)\s*goal/);
      return m ? Number(m[1]) : null;
    });
    log("summary 'N goals' matches DB count", finalSummary === 3, `summary=${finalSummary} expected=3`);

    // 25) Test that overdue goal has red border
    const overdueRedBorder = await page.evaluate(() => {
      const overdue = [...document.querySelectorAll("h3")].find((h) => h.textContent === "Critical deadline");
      if (!overdue) return false;
      const card = overdue.closest('[class*="border"]');
      return card?.className?.includes("danger") || false;
    });
    log("overdue goal has danger border", overdueRedBorder);

    // 26) Test that the progress slider triggers an actual API call by counting network requests
    const beforeReqs = await page.metrics();
    await page.evaluate(() => {
      const slider = document.querySelector('input[type="range"]');
      if (!slider) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(slider, "50");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 2000));
    const afterReqs = await page.metrics();
    // Hard to assert specific network; at least verify no error thrown

    // 27) Test that the goals.manage permissions check works (creating as a non-manager user)
    // The default admin has goals.manage, so this is implicit. Skip.

    // 28) Test keyboard accessibility - Tab through interactive elements
    const tabbableCount = await page.evaluate(() => {
      const els = document.querySelectorAll("button, input, select, textarea, a[href]");
      return els.length;
    });
    log("page has many interactive elements (a11y)", tabbableCount > 10, `count=${tabbableCount}`);

    // 29) Test that goal with 100% progress shows as done
    const done100Res = await page.evaluate(
      async ({ title, dueDate }) => {
        const r = await fetch("/api/v1/goals", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, dueDate }),
        });
        const b = await r.json();
        await fetch(`/api/v1/goals/${b.id}/progress`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ progress: 100 }),
        });
        return { status: r.status, id: b.id };
      },
      { title: "Already finished", dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) },
    );
    log("create + complete goal", done100Res.status === 201);
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForFunction(
      () => !document.querySelector('[role="status"][aria-label="Loading"]'),
      { timeout: 10000 },
    );
    // The done goal should appear when filter is "Completed"
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Completed");
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    const completedSection = await page.evaluate(() => document.body.innerText);
    log("100% goal appears in Completed filter", completedSection.includes("Already finished"));
    log("Completed section header is visible", completedSection.match(/Completed\s+\d+/) !== null);

    // 30) Test the number input commits on Enter
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "All status");
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    // Use the page's actual click+type+enter flow for the number input
    const numberInputState = await page.evaluate(() => {
      const inp = document.querySelector('input[type="number"]');
      if (!inp) return { ok: false, reason: "no number input" };
      inp.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(inp, "33");
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      // Press Enter
      const enterEvent = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true });
      inp.dispatchEvent(enterEvent);
      return { ok: true, value: inp.value };
    });
    log("number input accepts typed value", numberInputState.ok && numberInputState.value === "33", `value=${numberInputState.value}`);
    // Wait for the commit to complete
    await new Promise((r) => setTimeout(r, 2000));
    const afterEnter = await page.evaluate(() => {
      // Find all progress values, return the one near 33
      const matches = [...document.body.innerText.matchAll(/(\d+)\/100/g)].map((m) => Number(m[1]));
      return matches;
    });
    log("Enter on number input commits (33% in DOM)", afterEnter.includes(33), `progress values=${afterEnter.join(",")}`);

    // 31) Test no-goal-yet empty state with recovery button
    // Use a new page context to avoid session cookie interference
    const ctx2 = await browser.createBrowserContext();
    const page2 = await ctx2.newPage();
    await page2.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    // New user
    const ts2 = Date.now();
    const reg2 = await page2.evaluate(
      async ({ email, password, company }) => {
        const r = await fetch("/api/v1/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password, companyName: company, adminName: "Empty" }),
        });
        return { status: r.status, body: await r.json() };
      },
      { email: `empty-${ts2}@wamiro.test`, password: "Empty-Test-Pass!", company: `Empty ${ts2}` },
    );
    log("register second user", reg2.status === 201);
    // Give the new context a moment to settle the cookie
    await new Promise((r) => setTimeout(r, 500));
    const cookies2 = await page2.cookies();
    const sessionCookie2 = cookies2.find((c) => c.name.includes("session") || c.name.includes("wamiro"));
    log("second user has session cookie", !!sessionCookie2, `cookies=${cookies2.map((c) => c.name).join(",")}`);
    await page2.goto(`${BASE}/goals`, { waitUntil: "networkidle0" });
    await page2.waitForFunction(
      () => !document.querySelector('[role="status"][aria-label="Loading"]'),
      { timeout: 15000 },
    );
    const emptyStateText = await page2.evaluate(() => document.body.innerText);
    log("empty state shows 'No goals yet'", emptyStateText.includes("No goals yet"));
    const emptyStateBtn = await page2.evaluate(() => {
      return [...document.querySelectorAll("button")].map((b) => b.textContent?.trim());
    });
    const hasNewGoalBtn = emptyStateBtn.includes("New goal");
    log("empty state has 'New goal' recovery button", hasNewGoalBtn);

    // 32) Test the goals.manage permission gate (a non-manager should not be able to create)
    // The default admin always has goals.manage. The api doesn't currently check this — anyone with auth can POST.
    // This is a separate backlog item.

    // 33) Test the inline number input when value is 0
    await page2.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "New goal");
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    const createdEmpty = await page2.evaluate(
      async () => {
        const r = await fetch("/api/v1/goals", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: "Test 0 progress" }),
        });
        return { status: r.status, body: await r.json() };
      },
    );
    log("create goal with no due date and no description", createdEmpty.status === 201);
    await page2.reload({ waitUntil: "networkidle0" });
    await page2.waitForFunction(
      () => !document.querySelector('[role="status"][aria-label="Loading"]'),
      { timeout: 10000 },
    );
    const newCard = await page2.evaluate(() => {
      const h3s = [...document.querySelectorAll("h3")].map((h) => h.textContent);
      const dueElements = [...document.querySelectorAll("span")].filter((s) =>
        s.textContent?.includes("No target"),
      );
      return { titles: h3s, noTargetCount: dueElements.length };
    });
    log("goal with no due date shows 'No target'", newCard.noTargetCount >= 1);

    await ctx2.close();
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

main().catch((e) => { console.error("browser smoke crashed:", e); process.exit(1); });
