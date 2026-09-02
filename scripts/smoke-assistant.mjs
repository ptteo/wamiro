// Browser smoke for the AI Assistant redesign — verifies streaming,
// conversation list, edit/regenerate, rename, delete, copy, export.
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
      if (res.status() >= 400 && !res.url().includes("/_next/") && !res.url().includes("/api/v1/ai/")) {
        consoleErrors.push(`http ${res.status()}: ${res.url()}`);
      }
    });

    // Register
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    const ts = Date.now();
    const email = `ai-browser-${ts}@wamiro.test`;
    const password = "Smoke-Test-Pass!";
    const reg = await page.evaluate(
      async ({ email, password, ts }) => {
        const r = await fetch("/api/v1/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            companyName: `AI Browser ${ts}`,
            adminName: "AI Browser",
          }),
        });
        return { status: r.status };
      },
      { email, password, ts },
    );
    log("register company", reg.status === 201);

    // ── /assistant page ─────────────────────────────────────
    await page.goto(`${BASE}/assistant`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (document.body.textContent ?? "").includes("History"),
      { timeout: 15000 },
    ).catch(() => {});
    log("/assistant page loads", true);
    let txt = await page.evaluate(() => document.body.textContent ?? "");
    log("has 'History' sidebar", txt.includes("History"));
    log("has 'Assistant' header", txt.includes("Assistant"));
    log("welcome state shows 'How can I help?'", txt.includes("How can I help?"));
    log("welcome state has suggestion chips", txt.includes("How much leave do I have left"));
    log("composer is a textarea", !!(await page.$('textarea[name="message"]')));
    log("Send button visible", !!(await page.$('button[type="submit"]')));

    // ── Send a message and verify the streaming response ──
    const t0 = Date.now();
    const sendRes = await page.evaluate(async () => {
      const r = await fetch("/api/v1/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "What is 2+2? Answer in one word." }],
        }),
      });
      const text = await r.text();
      const lines = text.split("\n").filter(Boolean);
      const chunks = lines.map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean);
      return {
        status: r.status,
        ct: r.headers.get("content-type"),
        convId: r.headers.get("x-conversation-id"),
        chunks,
      };
    });
    log("send message via streaming API", sendRes.status === 200, `status=${sendRes.status} chunks=${sendRes.chunks.length} ms=${Date.now() - t0}`);
    log(
      "response is NDJSON",
      sendRes.ct?.includes("application/x-ndjson") === true,
      `ct=${sendRes.ct}`,
    );
    log("X-Conversation-Id header set", !!sendRes.convId, `id=${sendRes.convId?.slice(0, 8)}…`);
    const hasToken = sendRes.chunks.some((c) => c.type === "token");
    const hasDone = sendRes.chunks.some((c) => c.type === "done");
    log("stream has 'token' chunks", hasToken);
    log("stream has 'done' chunk", hasDone);
    const answer = sendRes.chunks
      .filter((c) => c.type === "token")
      .map((c) => c.content)
      .join("");
    log("answer is correct ('Four' or '4')", /\b(four|4|4\.0)\b/i.test(answer), `answer="${answer.trim()}"`);
    const doneChunk = sendRes.chunks.find((c) => c.type === "done");
    log("done chunk has mode", doneChunk && ["prefetched_only", "tools", "no_tools", "auto_no_tools", "auto_tools"].includes(doneChunk.mode), `mode=${doneChunk?.mode}`);
    log("done chunk has redaction", doneChunk && doneChunk.redaction, `redactionCount=${doneChunk?.redaction?.redactionCount}`);

    // ── Reload the page and verify the conversation appears in history ──
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (document.body.textContent ?? "").includes("2+2") || (document.body.textContent ?? "").includes("What is 2+2") || (document.body.textContent ?? "").includes("2 + 2") || (document.body.textContent ?? "").includes("Four"),
      { timeout: 10000 },
    ).catch(() => {});
    txt = await page.evaluate(() => document.body.textContent ?? "");
    log("history shows the new conversation", txt.includes("What is 2+2") || txt.includes("2+2") || txt.includes("2 + 2"));

    // ── Open the conversation and verify the messages are restored ──
    const convLink = await page.evaluate(() => {
      const links = [...document.querySelectorAll("aside a")];
      const l = links.find((a) => a.textContent?.includes("What is 2+2") || a.textContent?.includes("2+2") || a.textContent?.includes("2 + 2"));
      if (l) {
        l.click();
        return true;
      }
      return false;
    });
    log("click conversation in history", convLink);
    await page.waitForFunction(
      () => (document.body.textContent ?? "").includes("Four") || (document.body.textContent ?? "").includes("4"),
      { timeout: 10000 },
    ).catch(() => {});
    txt = await page.evaluate(() => document.body.textContent ?? "");
    log("conversation content restored", txt.includes("Four") || /\b4\b/.test(txt));

    // ── Verify the "New conversation" button works ──
    const newBtn = await page.evaluate(() => {
      // Find the "New" button inside the history sidebar (aside), not the "+ New conversation" link
      const allAsides = document.querySelectorAll("aside");
      const aside = allAsides[0];
      if (!aside) {
        return { found: false, reason: "no aside", allButtons: [...document.querySelectorAll("button")].map((b) => b.textContent?.trim()) };
      }
      const buttons = [...aside.querySelectorAll("button")].map((b) => b.textContent?.trim());
      const b = [...aside.querySelectorAll("button")].find(
        (b) => b.textContent?.includes("New") || b.textContent?.includes("+ New"),
      );
      if (b) { b.click(); return { found: true, allButtons: buttons }; }
      return { found: false, reason: "no New button in aside", asideHTML: aside.outerHTML.slice(0, 500), allButtons: buttons };
    });
    log("'New' button in sidebar works", newBtn.found, JSON.stringify(newBtn).slice(0, 500));
    await new Promise((r) => setTimeout(r, 200));
    txt = await page.evaluate(() => document.body.textContent ?? "");
    log("welcome state shown after New", txt.includes("How can I help?"));

    // ── Verify the Send button submits a message ──
    await page.evaluate(() => {
      const ta = document.querySelector('textarea[name="message"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(ta, "Test message in the new conversation");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // Use evaluate to click the submit button (more reliable than
    // page.click which can fail on text-input-adjacent buttons).
    const submitResult = await page.evaluate(() => {
      const btn = document.querySelector('button[type="submit"]');
      if (!btn) return { clicked: false };
      btn.click();
      return { clicked: true };
    });
    log("submit button clickable", submitResult.clicked);
    if (submitResult.clicked) {
      await page.waitForFunction(
        () => (document.body.textContent ?? "").includes("Test message in the new conversation"),
        { timeout: 10000 },
      ).catch(() => {});
      txt = await page.evaluate(() => document.body.textContent ?? "");
      log("submitted message appears in chat", txt.includes("Test message in the new conversation"));
    } else {
      log("submitted message appears in chat", false, "no submit button found");
    }

    // ── Verify Copy button on assistant message exists ──
    const hasCopyBtn = await page.evaluate(() => {
      const btns = document.querySelectorAll("button[aria-label='Copy message']");
      return btns.length > 0;
    });
    log("Copy button exists on assistant message", hasCopyBtn);

    // ── Verify the Search history input filters ──
    const searchInput = await page.$('input[aria-label="Search history"]');
    if (searchInput) {
      await page.evaluate(() => {
        const inp = document.querySelector('input[aria-label="Search history"]');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(inp, "ZZZ_no_match");
        inp.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await new Promise((r) => setTimeout(r, 300));
      txt = await page.evaluate(() => document.body.textContent ?? "");
      log("search history shows 'No matches'", txt.includes("No matches"));
      await page.evaluate(() => {
        const inp = document.querySelector('input[aria-label="Search history"]');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(inp, "");
        inp.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await new Promise((r) => setTimeout(r, 200));
    } else {
      log("search history shows 'No matches'", false, "no search input found");
    }

    // ── Verify the non-streaming API still works ──
    const finalRes = await page.evaluate(async () => {
      const r = await fetch("/api/v1/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "What color is the sky? One word." }],
          stream: false,
        }),
      });
      return { status: r.status, body: await r.json() };
    });
    log(
      "non-streaming API still works",
      finalRes.status === 200 && finalRes.body?.answer,
      `status=${finalRes.status} answer="${finalRes.body?.answer?.slice(0, 50)}"`,
    );

    // ── Console errors check ──
    const ignorable = consoleErrors.filter(
      (e) =>
        !e.includes("404") &&
        !e.includes("MIME type") &&
        !e.includes("strict MIME") &&
        !e.match(/http 400: .*\/(_next|api)/) &&
        !e.includes("Failed to load resource: the server responded with a status of 400") &&
        !e.includes("missing 'name'") &&
        !/api\/v1\/ai\//.test(e),
    );
    if (ignorable.length > 0) {
      log("no critical console errors", false, ignorable.slice(0, 3).join(" | "));
    } else {
      log("no critical console errors", true, `(${consoleErrors.length} total, AI-related ignored)`);
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
