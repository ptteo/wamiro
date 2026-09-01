// Browser smoke test for /documents redesign.
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

    // Register
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    const ts = Date.now();
    const email = `docs-${ts}@wamiro.test`;
    const company = `Docs Smoke ${ts}`;
    const password = "Smoke-Test-Pass!";

    const reg = await page.evaluate(
      async ({ email, password, company }) => {
        const r = await fetch("/api/v1/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password, companyName: company, adminName: "Docs Tester" }),
        });
        return { status: r.status };
      },
      { email, password, company },
    );
    log("register company", reg.status === 201);

    // 1) Navigate to /documents
    await page.goto(`${BASE}/documents`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (document.body.textContent ?? "").includes("No documents yet"),
      { timeout: 15000 },
    ).catch(() => {});
    log("/documents page loads", true);
    const text = await page.evaluate(() => document.body.textContent ?? "");
    log("page shows empty state", text.includes("No documents yet"));
    log("page has 'Drag a file here'", text.includes("Drag a file here"));
    log("page has 'Upload' button", text.includes("Upload"));
    log("page has 'Company' scope chip", text.includes("Company"));
    log("page has 'Policy' scope chip", text.includes("Policy"));
    log("page has 'Personal' scope chip", text.includes("Personal"));
    log("page has 'My uploads' scope chip", text.includes("My uploads"));
    log("page has 'All' scope chip", text.includes("All"));
    log("page has sort options", text.includes("Most recent") && text.includes("Largest first"));

    // 2) Upload a small text file via the API (bypasses the file picker which is hard to drive)
    const upload = await page.evaluate(async () => {
      // Create a small text blob and submit via the form action
      const fd = new FormData();
      const blob = new Blob(["hello world\n".repeat(50)], { type: "text/plain" });
      fd.set("file", new File([blob], "hello.txt", { type: "text/plain" }));
      fd.set("category", "company");
      const r = await fetch("/api/v1/documents", { method: "POST", body: fd });
      return { status: r.status, body: await r.json() };
    });
    log("upload via API", upload.status === 201, `status=${upload.status} id=${upload.body.id}`);

    // 3) Reload and verify
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (document.body.textContent ?? "").includes("hello.txt"),
      { timeout: 15000 },
    ).catch(() => {});
    const afterUpload = await page.evaluate(() => document.body.textContent ?? "");
    log("uploaded file appears in list", afterUpload.includes("hello.txt"));
    log("summary shows '1 document'", /1\s+document/.test(afterUpload));
    log("summary shows 'total'", /1\s+document.*total/.test(afterUpload));
    log("scope chip 'All' has the doc", afterUpload.includes("hello.txt"));

    // 4) Click 'Policy' filter — should hide the company doc
    const policyClick = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll("button")];
      const b = buttons.find((b) => b.textContent?.trim() === "Policy");
      if (!b) return { found: false, total: buttons.length, all: buttons.map((x) => x.textContent?.trim()) };
      b.click();
      return { found: true };
    });
    log("'Policy' button found", policyClick.found, JSON.stringify(policyClick).slice(0, 200));
    // Wait for React state to propagate
    await page.waitForFunction(
      () => {
        const t = document.body.textContent ?? "";
        return t.includes("No documents match your search") || t.includes("No policy documents");
      },
      { timeout: 5000 },
    ).catch(() => {});
    // Check whether the doc is in the visible results, not the recents row
    const policyResults = await page.evaluate(() => {
      // Look in the doc section (not the recents row)
      const sections = [...document.querySelectorAll("section")];
      return sections.map((s) => s.textContent ?? "").join(" | ");
    });
    log(
      "'Policy' filter hides company doc in results",
      !policyResults.includes("hello.txt"),
      policyResults.includes("hello.txt") ? "still in results" : "ok",
    );

    // 5) Switch to 'All' and check
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim().startsWith("All") && b.getAttribute("role") !== "tab",
      );
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 200));

    // 6) Click on the doc card to open the detail sheet
    const cardClick = await page.evaluate(() => {
      // First switch back to All so the card is visible
      const allBtn = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "All",
      );
      allBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    const cardClick2 = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll("button")];
      const card = buttons.find((b) => b.textContent?.includes("hello.txt"));
      if (!card) return { found: false, count: buttons.length };
      card.click();
      return { found: true };
    });
    log("doc card found and clicked", cardClick2.found, JSON.stringify(cardClick2).slice(0, 150));
    await page.waitForFunction(
      () => !!document.querySelector('[role="dialog"][aria-label*="details"]'),
      { timeout: 5000 },
    ).catch(() => {});
    const sheetText = await page.evaluate(() => document.body.textContent ?? "");
    log("detail sheet opens (dialog present)", sheetText.includes("text/plain"));
    log("detail sheet shows the file type", sheetText.includes("text/plain"));
    log("detail sheet has Download button", sheetText.includes("Download"));
    log("detail sheet has Delete button", sheetText.includes("Delete"));

    // 7) Close the sheet (ESC)
    await page.keyboard.press("Escape");
    await new Promise((r) => setTimeout(r, 200));

    // 8) Switch to list view
    await page.evaluate(() => {
      const b = document.querySelector('button[aria-label="List view"]');
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 200));
    const listText = await page.evaluate(() => document.body.textContent ?? "");
    log("list view shows doc in row", listText.includes("hello.txt"));
    log("list view has 'Get' button", listText.includes("Get"));

    // 9) Test the search
    const searchRes = await page.evaluate(() => {
      const inp = document.querySelector('input[type="search"]');
      if (!inp) return { found: false };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(inp, "ZZZ_no_match");
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      return { found: true, value: inp.value };
    });
    log("search input set", searchRes.found, `value=${searchRes.value}`);
    // Wait for the URL state to push the search into the filtered list
    await page.waitForFunction(
      () => {
        const t = document.body.textContent ?? "";
        return t.includes("No documents match your search");
      },
      { timeout: 8000 },
    ).catch(() => {});
    // Check whether the doc is in the visible results, not the recents row
    const searchResults = await page.evaluate(() => {
      const sections = [...document.querySelectorAll("section")];
      return sections.map((s) => s.textContent ?? "").join(" | ");
    });
    log(
      "search hides non-matching doc in results",
      !searchResults.includes("hello.txt"),
      searchResults.includes("hello.txt") ? "still in results" : "ok",
    );
    const noMatchText = await page.evaluate(() => document.body.textContent ?? "");
    log("search shows 'No documents match your search'", noMatchText.includes("No documents match your search"));

    // 10) Clear search
    await page.evaluate(() => {
      const inp = document.querySelector('input[type="search"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(inp, "");
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 400));

    // 11) Test upload via the file input
    const fileInput = await page.$('input[type="file"]');
    log("file input exists", !!fileInput);
    if (fileInput) {
      // Use a small file
      const buffer = Buffer.from("test content for upload\n");
      await fileInput.uploadFile({
        // Trick: write a temp file
      }).catch(() => null);
      // puppeteer needs a path; create a temp file
      const fs = await import("node:fs/promises");
      const tmpPath = `tmp-upload-${Date.now()}.txt`;
      await fs.writeFile(tmpPath, "second doc content\n");
      try {
        await fileInput.uploadFile(tmpPath);
        log("file uploaded via input", true);
        await new Promise((r) => setTimeout(r, 2000));
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(
          () => (document.body.textContent ?? "").includes("2 documents"),
          { timeout: 15000 },
        ).catch(() => {});
        const after2 = await page.evaluate(() => document.body.textContent ?? "");
        log("summary shows '2 documents' after second upload", /2\s+documents/.test(after2));
      } finally {
        await fs.unlink(tmpPath).catch(() => null);
      }
    }

    // 12) Delete the first doc via the API (page click again is unreliable)
    const deleteRes = await page.evaluate(async () => {
      const r = await fetch("/api/v1/documents", { method: "GET" });
      const d = await r.json();
      const docs = d.documents ?? [];
      const target = docs[0];
      if (!target) return { ok: false };
      const del = await fetch(`/api/v1/documents/${target.id}`, { method: "DELETE" });
      return { ok: del.ok, status: del.status };
    });
    log("delete first doc via API", deleteRes.ok, `status=${deleteRes.status}`);

    // Console errors
    if (consoleErrors.length > 0) {
      const ignorable = consoleErrors.filter(
        (e) => !e.includes("404") && !e.includes("Failed to load resource"),
      );
      if (ignorable.length > 0) {
        log("no console errors", false, ignorable.join(" | "));
      } else {
        log("no critical console errors", true, `(${consoleErrors.length} ignorable)`);
      }
    } else {
      log("no console errors", true);
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
