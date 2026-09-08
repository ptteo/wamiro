# Wamiro — Master Implementation Plan v2 (Enterprise End-to-End)

**Status:** Active roadmap. Absorbs and supersedes `implementation-plan-native-hr-support.md` (Phases 1–7, shipped) and `scaling-to-100-companies-plan.md` (Phases A–F shipped; B/C/G remain, folded below).
**Product thesis:** multi-tenant Company OS — a company buys, Wamiro provisions its admin, the company completes onboarding itself, then cascades invitations to every employee with role-appropriate access. Everything below is scoped to cost **$0/month** in services (free tiers + self-hosted).

---

## 0. How your requirements map to the product (analysis & corrections)

### 0.1 Your flow, restructured end-to-end

1. **Purchase → provisioning.** Company purchases (or is granted) a plan → Wamiro platform operator (or self-serve checkout, Phase 3) creates the tenant → **admin invitation email** with a single-use token link → admin sets their own password → tenant exists in `active` state with onboarding **incomplete**.
2. **Company-led onboarding.** Admin completes the guided first-run wizard (branding, company profile, departments, leave types, service catalog, admin team). Product is **feature-gated until onboarding is complete** (see 0.3).
3. **Cascading invitations.** Tenant admin invites HR + managers (bulk import or one-by-one). Managers & HR then invite **their own** employees. Each invite = email with token link → employee sets own password → first-login tour.
4. **Role-based access.** RBAC catalog with SELF→GLOBAL scopes already enforces per-role access (employee/manager/HR/admin templates shipped). Manager invites land under the inviting manager's reporting line.
5. **Daily use.** Attendance, leave, payroll, tickets, requests, work, knowledge, finance, analytics — all native, all tenant-scoped.
6. **Support & help.** In-product help center + AI assistant grounded on the knowledge base; escalations reach the platform support queue.

### 0.2 Corrections to your stated design (important)

| Your design | Better version | Why |
| --- | --- | --- |
| "User cannot change password but can request change" | **Self-service change always** (requires current password) + email reset link (token, 30 min) + admin-triggered reset. Keep your idea as an **opt-in "managed password mode"** per tenant for compliance-heavy customers. | Password-change requests create helpdesk load and security risk (plaintext intent, delays). Every enterprise product (Google, Microsoft, BambooHR) allows self-service change. Offer managed mode as a policy, not the default. |
| "Mail sent with id and password to register" | **Invitation token links** — email contains a single-use, 7-day link; user sets their own password on a /invite/accept page. No password ever transits email. | Emailed passwords sit in mailboxes forever, are forwarded by mistake, and fail SOC 2 checks. Token links are the industry standard (Slack, Notion, BambooHR). |
| "In DB a main table will be created under company name; all data stored in that" | **Keep row-level multi-tenancy** (current design): one schema, every row keyed by `organization_id`, all queries derive tenant from the session. Optionally add **Postgres RLS** as a second wall (Phase 5). Per-tenant *schemas* only as a future compliance tier. | Table-per-company is an anti-pattern: thousands of tables break migrations, backups, connection pooling, and cross-tenant analytics. Row-level + indexed `organization_id` + session-derived tenant context + the existing cross-tenant isolation suite is what Rippling/Zoho-class products run. Your goal (zero clash, easy identification) is already met — every row is identifiable by `organization_id`, and S3/R2 keys are already `tenant/{organizationId}/…`. |
| "Admin gives id and password to employees" | Same as invite-token correction above; bulk import (CSV/XLSX) for large companies with per-row error reporting. | Speed + security + audit. |
| "Designated official mail accounts; login using that only" | Identity stays **email** (already globally unique). Add: (a) **email ownership proof** — the invite link verifies the mailbox; (b) **org domain lock** — tenant can restrict invites/logins to `@company.com`; (c) SSO later enforces it cryptographically. | Email as identity is right; the missing piece is *proving* the mailbox at first login. |

### 0.3 Onboarding gate (your "only after all steps" requirement)

Current state: setup checklist is a **nudge** (Home card). Upgrade to a **gate**:

- Org-level flag `onboarding_state`: `pending → admin_done → employees_seeded → complete`.
- While `pending`/`admin_done`: daily-use modules (tickets, leave, attendance, payroll, requests, work) return a friendly "Finish setup" interstitial; read-only Admin + Settings stay open.
- Skip-path: platform operator can force-complete for pilots. 7-day grace then soft-reminder emails; never a hard lockout without consent (plan rule: "no tenant silently locked out").

---

## 1. Current state snapshot (re-analyzed today)

**Scale:** 47 domain modules · 190 API routes · 75 pages · 53 unit tests · isolation integration suite · 53 migrations. Single Next.js monolith + jobs worker + Caddy on Lightsail, RDS Postgres.

**Shipped & verified (unit + cross-tenant isolation suite + build):** tenancy & RBAC (5 scopes, deny-overrides), sessions+MFA(TOTP), SSO(OIDC)+SCIM, org switcher, people/HR (directory, org chart, shifts, corrections, encashment, advances, HR docs), payroll engine (runs, payslips, bank export), leave, attendance, work (projects/tasks/goals), requests/approvals+delegations, support (tickets, SLA engine, CSAT, groups, toolkit, catalog, IT records, mailboxes), knowledge, documents, announcements, surveys, acknowledgements, governance, finance, workplace, assets, dashboards/analytics, AI assistant (permission-gated, per-org policies), webhooks (HMAC), push (PWA), custom domains, platform console v2 (risk board, audited consent-gated impersonation, broadcast, support queue), billing plans/seats/trials, background jobs worker (5 sweeps, ledger), shared rate limiters, health with component gates, backups + restore drill.

**Known gaps & defects → Phase 0/1/2 fixes below (each with file refs).**

---

## 2. Sidebar / IA audit (industry-standard naming)

### 2.1 Applied today (labels corrected in `src/lib/workspaces.ts`)

| Was | Now | Standard source |
| --- | --- | --- |
| Corrections | **Attendance Corrections** | ambiguity removed (BambooHR/keka use full terms) |
| Encashment | **Leave Encashment** | standard HRIS term |
| IT Records | **Incidents & Changes** | ITIL (incident/problem/change) |
| Polls | **Surveys & Polls** | CultureAmp/Officevibe convention |
| Signatures | **Acknowledgements** | matches feature + policy-ack standard |
| Access Control (admin) | **Users** | standard admin-console naming |

### 2.2 Proposed (Phase 7 — needs your call)

| Change | Rationale |
| --- | --- |
| Merge **Documents** into **Knowledge** workspace (rail: Knowledge → Articles / Documents / HR Docs) | 14 rail items > industry norm (7–10); content lives together in Notion/Confluence class products |
| Merge **Assets** + **Workplace** into one workspace (**Facilities & IT**) | both are "physical ops"; mirrors Freshservice/Officevibe grouping |
| Move **Governance** entry from Company → **Admin** (GRC section) | GRC is an admin function in BambooHR/LogicGate class tools |
| AI as rail tab → keep, but add ⌘K "Ask AI" shortcut | modern expectation (Notion AI, Copilot) |

Sidebar item groups verified correct: Time & Attendance, Leave, Payroll & Documents, People Ops, Directory, Support Settings, Access & Security. One fix proposed: move "HR Documents" group heading under Knowledge after merge (2.2).

---

## 3. Phased roadmap

Every phase ships with its gate: `lint 0 errors · typecheck · unit tests · isolation suite vs live DB · build · smoke`. Migrations stay additive+idempotent (ADR-004). Everything uses free tiers.

### Phase 0 — Hardening & debt (do first, ~1 week)

Fix known defects from the code audit; no new features.

1. **Payroll proration counts paid leave against pay** — `prorationFactor` counts distinct clock-in days only (`src/modules/payroll/service.ts`). *Fix:* subtract approved leave days from "not worked"; treat holiday+leave as worked for paid types.
2. **Mailbox polling drops attachments & HTML-only mail** — `pollMailbox` passes `attachments: []`, reads body part "1" only (`src/modules/mailboxes/service.ts`). *Fix:* parse multipart (text+html fallback, attachments via mailparser — free MIT).
3. **`computeRun` not transactional** — partial payslip writes possible mid-loop. *Fix:* wrap in `db.transaction`, pre-validate all structures before delete.
4. **IMAP passwords in plaintext** — `mailboxes.imap_pass`. *Fix:* AES-256-GCM at rest with env key `SECRET_KEY` (node crypto, no dependency).
5. **Trusted-proxy/XFF doc** — login limiter trusts `x-forwarded-for`; runbook: firewall app port to Caddy only + Caddy `trusted_proxies` config.
6. **Repo hygiene** — remove tracked logs (`prod.log`, `e2e-out.txt`, `goals-dump*.html`, `.next-prod-*.log`), fix `.env.example` duplicate `APP_URL`, remove stale `SMTP_HOST` check in `providers/registry.ts`, fix deploy-oracle.md Docker-for-Zammad remnant.
7. **Queued sweep limits** — SLA sweep caps 200 tickets/org, queue caps 200 (`tickets/service.ts`, `platform/console.ts`); paginate with keyset.
8. **`getPayslip` duplicate guard** + `requestTypes.steps` comment drift — tiny cleanups.
9. **Unbounded login-limiter map removal** (login route already migrated to shared store — delete any remaining in-memory remnants).

Gate: all tests green + `docs/audit/rc-readiness.md` updated.

### Phase 1 — Identity & access completion (enterprise identity, ~2 weeks)

The heart of your flow. Free throughout.

1. **Invitation token links** (replaces emailed passwords end-to-end)
   - `invitation_tokens` table: token hash, org, role, invitedBy, target email, expires 7d, usedAt. Migration-0054.
   - `/invite/accept?token=…` page: shows tenant brand, name prefill, password + confirm (zod, strength meter), sets password, creates session, routes to tour.
   - Service: `createInvitation(ctx, {email, roleKey, managerScope?})` + bulk variant; resend + revoke in admin UI.
   - Migration path: keep temp-password fallback for `?legacy=1` for one release.
2. **Password self-service + reset**
   - `/settings/security`: change password (current + new, strength meter, revoke other sessions).
   - `/forgot-password`: email token (Brevo) → `/reset-password`. Rate-limited per IP+email (shared limiter).
   - **Managed password mode** (opt-in org policy): password changes require admin approval → your "request change" flow as a policy, not a product-wide rule. `password_change_requests` table + admin approval UI.
3. **Account lockout** — 10 failed logins/15min per account → 30-min lock + admin notification (shared limiter + `users.lockedUntil`).
4. **Cascading invitations**
   - New permission `team.invite` (SELF→TEAM scope): managers can invite users **into their own reporting line** only; invite pre-sets `employees.managerUserId = inviterId`.
   - Admin bulk import: CSV/XLSX (name, email, role, manager email) with dry-run validation report (duplicates, unknown managers, invalid emails), then commit; per-row error CSV download.
   - Org chart preview before commit ("these 34 report to Priya").
5. **Corporate email enforcement** — org setting `allowedEmailDomains: string[]`: invites + logins restricted; platform console can set it too.
6. **Session & device management** — user-facing "Your sessions" (list, revoke other devices) building on the sessions table; admin session revoke already exists.
7. **MFA policy** — org setting `mfaMode: optional | required_admins | required_all`; enforcement at login + settings nudge.
8. **Onboarding gate** (0.3) — state machine + interstitial + platform force-complete.

Edge cases covered: expired/used token reuse (404 + "ask for new invite"), email already in org (friendly "you're already a member — sign in"), email in another org (global identity link → membership added), invited-then-deleted user (token invalidated on delete), domain-lock mismatch (clear error), manager offboarded with pending invites (reassign), bulk import >1000 rows (chunked, 422 report), self-invite (block), suspended org (invite blocked).

Gate: isolation suite extended (token single-use, cross-org token use → 404, manager scope can't invite outside line, domain lock, lockout).

### Phase 2 — Onboarding, tour & help (~1 week)

1. **First-login product tour** — self-built (no dependency): step overlay component (spotlight + tooltip, keyboard navigable, respects `prefers-reduced-motion`), stored per-user `tourState` (keyed page, versioned); re-run from Help menu. Tours: Dashboard, Attendance, Leave, Tickets, Requests.
2. **Role-based setup checklists** — admin checklist (exists) + manager checklist ("invite 3 reports", "approve a leave") + employee checklist ("clock in", "apply leave").
3. **Sample data toggle** — during onboarding optionally seed demo projects/tickets marked `demo: true` with one-click purge.
4. **Help center + AI grounding** — `/help` page: curated KB articles per role + "Ask the assistant" (AI module already permission-aware); assistant gets a `help_search` tool + "create support ticket" action (platform queue).
5. **Empty states with next actions** — audit all lists; each empty state = illustration + one primary CTA (many already exist; standardize).
6. **Emails that match the flow** — Brevo runbook (SPF/DKIM/DMARC DNS records), branded templates audit: invite, reset, welcome, approval, payslip-ready, ticket-replied (templates exist in `lib/mail`); add per-event email preferences + weekly digest + quiet hours.

Gate: E2E — new company from invite to "employee clocks in" with zero docs.

### Phase 3 — Self-serve billing (~1–2 weeks)

**Detailed plan:** `docs/implementation-plan-phase-3-billing.md` (in progress).

1. **Paddle adapter** (merchant-of-record: global tax handled — best default) behind the existing `billingAdapter` seam in `src/modules/billing/`: checkout URL, webhook (sign-verified) → `billing_customer_id/subscription_id`, status map → trial/active/past_due/cancelled, invoice emails by provider.
2. **Seats**: monthly per-seat billing recomputed from `activeSeatCount`; proration on mid-cycle invites (Paddle prepaid proration); overage policy flag: soft-cap (banner) vs hard-block (current).
3. **Settings → Plan & Billing**: payment method (provider portal link), invoice history, plan comparison, cancel/downgrade with data-retention notice.
4. **Platform console**: manual overrides stay (grant trial, comp accounts).
5. **Dunning emails** day 1/3/7 on past_due via jobs worker; day 7+ soft gate banner → hard stop at cancelled (gates already exist at session+login).

Edge cases: webhook replay (idempotency by event id), race webhook vs seat invite (recheck inside transaction), failed card + active sessions (soft gate, banner, no data loss), refund (provider-driven), currency (Paddle handles), Indian seller (Paddle MoR avoids GST registration pain; Stripe India alternative noted).

Gate: sandbox purchase → upgrade → seat-limit behaviors → cancel → reactivate, all E2E.

### Phase 4 — Data layer enterprise (~1 week)

1. **Object storage adapter → Cloudflare R2** (S3 API, 10 GB free, free egress) replacing local disk in `src/lib/storage.ts` (the designed seam); keys remain `tenant/{organizationId}/…`; env `S3_*`; one-time migration script (`scripts/migrate-storage.mjs`) with dry-run + verify mode.
2. **Per-tenant storage stats** — admin: usage per category; platform console: fleet storage; cleanup job for orphaned files.
3. **RLS defense-in-depth** — enable Postgres row-level security on the ~15 hottest tables (`USING (organization_id = current_setting('app.org_id')::uuid)`), set `app.org_id` per request from the session pool hook. Belt-and-braces over the existing query discipline.
4. **GDPR/DATA toolkit** — tenant admin: export everything (already partly via admin export datasets) + **delete-my-company** async job (double-confirm, 7-day undo window, audit).
5. **Retention jobs** — notification/session/idempotency cleanup sweeps in the jobs worker (bounded tables).

Gate: storage switch with zero broken download links (spot-check E2E), RLS on with isolation suite still green.

### Phase 5 — Platform ops completion (~3 days)

**Detailed plan:** `docs/implementation-plan-phase-5-platform-ops.md`. Do not rebuild health, the jobs ledger, or admin audit export.

1. **Error tracking** — **GlitchTip self-hosted** (~256 MB web process, unlimited events). Wamiro sends events only when `GLITCHTIP_DSN` is set; unset = journald only.
2. **Status page** — dynamic public `/status` mirroring `GET /api/v1/health` components (db / storage / jobs). No per-job internals.
3. **Uptime + 5xx** — UptimeRobot on `/api/v1/health/live` (process) and `/api/v1/health` (components 200/503). 5xx cron already in `reliability.md`; GlitchTip for exception email.
4. **Jobs dashboard** — platform console card from existing `platform_job_runs` (one row per job name, not history). `detail.failures` only on per-org sweeps.
5. **My activity** — `/settings/activity` (own audit rows). Admin `/admin/audit` + CSV already exists.

### Phase 6 — UX system & micro-interactions (~1–2 weeks, continuous)

Goal: best-in-class feel without new heavy deps (CSS-first; framer-motion MIT/free only where needed).

1. **Motion system** — CSS custom properties: `--dur-fast:120ms / --dur:180ms / --dur-slow:280ms`, easing `cubic-bezier(.2,.8,.2,1)`; standardized on: hover lift (1px + shadow), button press scale(.98), card enter stagger (20ms/item), drawer/sheet slide+fade, tab underline slide, badge pop on change. All gated by `prefers-reduced-motion: reduce`.
2. **Feedback primitives** — global Toaster (success/error/undo with action), optimistic updates on toggles/reactions (favorites, read-all, reactions) with rollback, `useTransition`-based pending states on every mutation button (no dead clicks).
3. **Skeletons everywhere** — extend existing Skeleton to every list/page route (loading.tsx per segment).
4. **Empty & error states** — standardized component (illustration, one-liner, CTA); 404/500 pages branded with recovery actions.
5. **Command palette polish** — recent items, scoped results, ⌘K from anywhere, action mode ("> approve pending…").
6. **Keyboard & a11y pass** — full tab-order audit, focus-visible rings, aria-live for toasts, contrast audit (WCAG AA), skip-links (exist).
7. **Mobile** — bottom nav for 5 primary workspaces, sheet-based modals, touch targets ≥44px.
8. **Delight** — first-clock-in ✓ micro-animation, 100% checklist confetti (subtle, once), payslip-ready celebratory state; all ≤1s and once-per-user.

Gate: Lighthouse ≥95 a11y/perf on core pages; interaction audit checklist.

### Phase 7 — Sidebar/IA restructure (proposals in §2.2) (~2 days)

Implement 2.2 after your sign-off: Knowledge+Documents merge, Facilities & IT merge, Governance→Admin, ⌘K AI shortcut. Rail shrinks 14 → 11.

### Phase 8 — Module depth (enterprise completeness sweep)

Per module, the missing "no customer left behind" items:

- **Leave**: accrual policies (monthly accrual, carry-forward caps, encashment caps), half-day types, holiday calendars per location, leave balance projections at request time.
- **Attendance**: auto-clockout policy, overtime rules, regularization reminders, geo-fence (optional, v2).
- **Payroll**: pay-schedule (monthly/semi-monthly), arrears line, payslip PDF export (print CSS — free), tax-component groups (config-only; statutory engines per country stay out of scope v1).
- **Tickets**: per-group SLA policies, business-hours calendars, requester satisfaction report (exists partially), auto-close stale resolved, webhook on ticket events (exists).
- **Requests**: form builder already schema-driven — add conditional fields, multi-level chain UI polish, delegation auto-reply.
- **Knowledge**: markdown editor with preview (existing body is plain text), version history, per-article permissions, helpful-votes.
- **Documents**: folders, expiry reminders (job), e-sign v2 (route acknowledgements → signature audit trail).
- **Work**: task recurring, workload view, baselines.
- **Announcements**: scheduling + audience targeting by department (audience column exists).
- **Notifications**: digest (Phase 2), per-type preferences, mute threads.
- **Analytics**: saved report exports (CSV everywhere), scheduled email reports (jobs worker).
- **Finance**: receipt OCR defer; approval chains per amount threshold (rule-based, no ML).
- **People ops**: exit clearance checklist auto-create from journey templates (exists partially).
- **Assets**: check-in/check-out history, warranty expiry job.

Each item is a small, shippable unit — schedule 2–3 per week interleaved with customer feedback.

### Phase 9 — Integrations & extensibility

- **Public API tokens** (org-scoped, hashed, scoped permissions) + OpenAPI spec + docs page; rate-limited via shared limiter (partially exists — formalize + document).
- **Inbound webhooks UI** (webhooks service exists — add console UI + event picker + delivery log + redrive).
- **Calendar feeds** — read-only ICS per user (leave+holidays+shifts) — free, works with Google/Outlook.
- **CSV importers** — universal importer (people, assets, knowledge) with mapping UI.
- **SSO/SCIM** — shipped; finish enterprise UI polish + domain-verified auto-SSO redirect.

### Phase 10 — Scale & residency (trigger-based)

From the scaling plan: load tests at 5× target, PgBouncer when pool saturation, read replica when analytics load hurts, EU regional instance + per-org `region` when EU customers arrive, multi-instance only after rate-limit/job ownership review (limiter already shared; jobs worker needs advisory-lock hardening then).

---

## 4. Cost table (everything $0)

| Item | Free tier | Cap that matters |
| --- | --- | --- |
| Lightsail 2 GB (your decision) | — | $12/mo (the one fixed cost) |
| Brevo email | 300/day | invite/receipt traffic fine |
| Cloudflare R2 | 10 GB + free egress | ~25k docs |
| UptimeRobot / GitHub Actions | 50 monitors / 2k min | plenty pre-100 companies |
| GlitchTip (self-host) | unlimited events | ~256 MB web + Redis; use existing RDS. Do not co-locate on a 2 GB Lightsail with `next build` |
| Tours, animations, toasts | self-built + CSS | $0, no deps |
| Paddle | no fixed fee | 5% + 50¢ per transaction (revenue-linked) |
| RDS | free 12 mo → ~$13/mo | Neon migration documented as fallback |

---

## 5. Release gates & QA matrix

- Every phase: lint/typecheck/unit/isolation/build/smoke green.
- Every auth/billing/tenancy change: platform drill checklist item in the PR.
- Isolation suite is release-blocking and runs against a live DB.
- Manual QA matrix per release: 4 roles (CEO/HR/manager/employee) × 5 core flows (invite→join, leave, ticket, request, payroll view) × desktop/mobile.
- Restore drill monthly; game-day quarterly before 50 companies.

## 6. Sequencing

Phase 0 → 1 → 2 → 3 are the customer-facing spine (identity → onboarding → revenue). 4–6 can interleave. 8 runs continuously. 9/10 trigger-based.
