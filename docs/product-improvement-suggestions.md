# Wamiro — Overall Improvement Suggestions

Audit of the product after Phases 1–7 (native HR + support, no Frappe/Zammad).
Ordered by impact; each item is independently shippable.

## 1. Platform & reliability (highest leverage)

- **Background workers.** SLA sweep, mail polling and leave/payroll auto-actions
  currently depend on page loads or manual sweeps. Move them to a proper job
  queue (`scripts/worker-mail.mjs` already exists) with retries, backoff and a
  systemd/pm2 unit so SLA enforcement runs even when nobody is logged in.
- **Observability.** Add structured request logging (method, route, status,
  latency, org id) + a `/healthz` probe and uptime dashboards. The audit trail
  is strong; ops visibility is not.
- **Backups & DR.** `scripts/restore-drill.mjs` exists — wire it into a cron
  with documented RPO/RTO and test restores on a schedule, not ad hoc.
- **Idempotency on email ingest** exists (message-id keys) — extend the same
  pattern to webhook-style channels (chat, forms) before adding them.

## 2. Feature depth (parity + differentiation)

- **Zammad leftovers:** online chat widget + public web forms, ticket merging,
  custom ticket statuses/priorities, saved custom overviews (the `saved-views`
  module exists — expose it on tickets), and tags across the org (tag cloud).
- **Frappe leftovers:** statutory deduction configs (tax slabs, PF/ESI) as
  tenant-configurable tables instead of hardcoded rules; employee loans and
  additional-salary (one-off earnings) on top of advances; leave approval
  hierarchies (multiple approvers) and carry-forward rules; payroll Form-style
  PDF generation.
- **Multi-currency payroll** — structures already carry a currency; make runs
  settle in the org currency with a stored FX rate at lock time.
- **AI assistant** — wire the AI module to tickets (suggest replies from
  canned responses + KB), leave policy Q&A and payroll explanations. Biggest
  perceived-value win for the demo.

## 3. UX & information architecture

- **Home page is the front door** — make it a true command center: today's
  shift + attendance status, upcoming leave, open approvals, SLA health,
  announcements, recognition feed. It currently under-sells the platform.
- **Global search** needs scope-aware deep results (tickets, people, docs,
  payroll) with keyboard-first navigation and the ability to open a ticket and
  reply from search.
- **Empty states + onboarding.** Every module should guide first use ("Create
  your first shift type → assign it → employees see it") with links, not a
  bare empty message.
- **Consistent page grammar.** Phases shipped pages with slight variations
  (headers, table density, button placement). Standardize on the `page-header`
  + `Card`/`Table` primitives everywhere and remove remaining legacy
  `var(--color-*)` usages.
- **Mobile.** The sidebar accordion is desktop-first; audit the mobile menu
  against the same IA and add gesture/tap targets.

## 4. Engineering hygiene

- **Tests.** Unit coverage exists for SLA + payroll math; add unit tests for
  leave auto-allocation, advances, macro validation and the toolkit service so
  regressions surface in `npm test` (not only integration).
- **Type generation.** `src/db/schema.ts` is hand-maintained alongside SQL
  migrations — keep them in lockstep (a drift check script would prevent
  subtle production/seed mismatches).
- **Secrets.** SMTP/IMAP credentials live encrypted in the DB — verify the
  encryption key story (env-based KMS fallback) and rotation path.
- **Performance.** The analytics reports run live SQL per request; add a
  materialized/rollup path (or cache with TTL) once tenants exceed a few
  thousand rows.

## 5. Go-to-market & docs

- **Deployment runbook** for the native stack (single VPS or managed Postgres
  + Next.js) — the plan doc exists; turn it into operator docs with
  env-by-env tables, scaling guidance and a disaster-recovery section.
- **Demo tenant seed** — `src/db/seed.ts` exists; build a richer demo org
  (employees, shifts, payroll run, tickets, CSAT) so sales/demo cycles take
  minutes, not setup effort.
- **CSV import** — Admin bulk user import already exists; extend it if a
  customer needs a one-shot employee/ticket dump from another system.