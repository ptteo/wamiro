/**
 * One-off SMTP verification (Phase 0 env work): sends a Wamiro product
 * introduction through the configured Brevo relay.
 *   node --import tsx scripts/send-test-mail.mts <to@example.com>
 */
import { readFileSync } from "node:fs";

import { renderBrandedEmail, sendEmail, mailerConfigured } from "../src/lib/mailer.ts";

// load .env (mailer reads process.env directly)
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const to = process.argv[2] ?? "onlyforptwork@gmail.com";
if (!mailerConfigured()) {
  console.error("SMTP_URL is not set — cannot send");
  process.exit(1);
}

const html = renderBrandedEmail({
  title: "Introducing Wamiro — your Company OS",
  body: [
    "Hi,",
    "This is a test delivery from Wamiro's mail pipeline (Brevo SMTP).",
    "",
    "Wamiro is a multi-tenant Company Operating System: one login, one home,",
    "one workspace per company.",
    "",
    "• People & HR — directory, attendance, shifts, leave, payroll, HR documents",
    "• Work — projects, tasks, goals, calendar",
    "• Requests & approvals with SLA escalation",
    "• Support — helpdesk with SLA engine, CSAT, service catalog, email-to-ticket",
    "• Finance, knowledge, analytics and an AI assistant (permission-aware)",
    "",
    "Every company's data is strictly isolated, every action audited.",
    "If you received this, transactional email is working end to end.",
  ].join("\n"),
  actionLabel: "Open Wamiro",
  actionUrl: process.env.APP_URL ?? "http://localhost:3000",
});

const ok = await sendEmail(to, "Wamiro — transactional mail test", html);
console.log(JSON.stringify({ ok, to, from: process.env.MAIL_FROM ?? null }));
process.exit(ok ? 0 : 1);
