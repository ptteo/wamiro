// Quick check what /approvals renders
const BASE = "http://127.0.0.1:3000";
const ts = Date.now();
const email = `check-${ts}@wamiro.test`;
const password = "Sm0ke-Test-Pass!";

const reg = await fetch(`${BASE}/api/v1/auth/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password, companyName: `Check ${ts}`, adminName: "Check" }),
});
const cookie = reg.headers.get("set-cookie")?.split(";")[0] ?? "";
console.log("register:", reg.status);

const page = await fetch(`${BASE}/approvals`, { headers: { cookie } });
console.log("approvals status:", page.status);
const html = await page.text();
console.log("approvals length:", html.length);
console.log("has 'Approvals' header:", html.includes("Approvals"));
console.log("has 'Pending':", html.includes("Pending"));
console.log("has 'No pending':", html.includes("No pending"));
// Look for the main content
const m = html.match(/<main[^>]*>([\s\S]{0, 2000})/);
console.log("main content:", m?.[1]?.slice(0, 500));
