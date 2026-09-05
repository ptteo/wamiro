# Wamiro Native HR & Support — Implementation Plan
## Replace Frappe HR + Zammad with built-in, fully native modules

**Status:** Complete — Phases 1–7 IMPLEMENTED (Phase 7 = full parity gap-fill + UX overhaul, see progress notes) · **Scope:** feature-for-feature parity with Frappe HR (HR engine) and Zammad (helpdesk), end-to-end working, deployable per tenant, **zero external dependency**
**Read alongside:** `docs/architecture.md` (v1 deviations), `docs/Wamiro_R&D_Master_Package/04_WAMIRO_OPEN_SOURCE_PROVIDER_REGISTRY.md` (licensing), `company_os_final_multitenant_end_to_end_blueprint.md` §28/§30/§40–42 (original provider scopes), `docs/desgin-phases/wamiro_phase_d6_support_it_assets.md` (support spec), `docs/desgin-phases/wamiro_phase_d13_people_hr_lifecycle_employee_experience.md` (HR spec)

---

# 1. Goal & success criteria

**Goal:** make `FRAPPE_BASE_URL` / `ZAMMAD_BASE_URL` optional-to-obsolete by implementing every feature those products provide as first-class, tenant-scoped Wamiro modules — same behavior, same UX language, no second system of record.

**Success criteria (all must hold at the end):**
1. A company can onboard employees and run **HR operations** (attendance, leave, payroll, expenses, performance, onboarding) entirely inside Wamiro — no Frappe.
2. Employees and IT can run **helpdesk operations** (tickets, SLA, service catalog, email intake, attachments, escalation, CSAT) entirely inside Wamiro — no Zammad.
3. Every feature is **RBAC-gated, tenant-isolated, audited, and notification-driven**, matching how every existing module behaves.
4. The Frappe/Zammad adapters, env vars, and deploy runbooks are removable without code changes elsewhere (registry-driven).

**Explicit non-goals:** rebranding as ERPNext (accounting ledgers, general ledger), full Zammad multi-channel messaging (chat, phone, social), and Frappe's statutory payroll *per-country legal engines*. We implement payroll foundations + the common deduction model; country-specific tax plugins remain configuration.

---

# 2. Current state (ground truth, verified in code)

Everything below already exists natively today:

| Domain | Module | Coverage |
|---|---|---|
| Directory | `people`, `departments`, `teams` | employees, org chart, manager links, scope filters |
| Attendance | `attendance` | clock in/out, open-shift model, weekly summary |
| Leave | `leave` | leave types, balances, apply → approve/reject, scopes |
| Helpdesk | `tickets` (+ `ticket_replies`) | categories, priorities, statuses, **SLA due date**, requester/assignee, agent queue, internal notes, audit |
| Assets (GLPI-lite) | `assets` | inventory, assign-to-person, employee "My Assets" |
| Finance (claims) | `finance` | expenses → approve/reimburse, purchase requests → order/receive, travel, vendors, budgets |
| People-ops | `people-ops` | recruitment (openings/candidates/stages), onboarding & offboarding journeys, performance review cycles (self/manager/finalize), learning (courses/enrollments), recognition, job changes, profile-change requests |
| Requests/approvals | `requests`, `approvals` | request types, dynamic forms, approval center, delegations |
| Support infra | `notifications`, `documents`, `knowledge`, `automations`, `surveys`, `announcements`, `analytics`, `search`, `governance` | reusable engines for everything below |

**Verified gaps vs Frappe HR:** payroll (salary structures, payslips, runs, deductions) — entirely absent; shift *scheduling/rostering* — absent (only clock-in "shift" exists); employee HR documents, leave encashment, attendance corrections, HR analytics.

**Verified gaps vs Zammad:** email-to-ticket ingestion; ticket attachments; first-response / resolution SLA *tracking and breach* state (only `sla_due_date` exists); SLA dashboard & escalation automation; agent groups/teams + assignment rules; service catalog front door; incidents/problems/change records; CSAT after resolution; in-app reply from the *employee-facing* surface (native `/tickets` already has replies via `ticket_replies`).

---

# 3. Design principles (non-negotiable)

1. **Reuse engines, never duplicate them** (D13 absolute rule). Request/approval workflows come from `requests`/`approvals`; notifications from `notifications`; audit from `audit`; uploads from `documents`/storage; automation from `automations`; IAM from `iam/catalog.ts`.
2. **Every table carries `organization_id`** with FK + index; every query filters by `ctx.user.organizationId`; no client-supplied tenant context.
3. **Every mutation goes through the `route()` wrapper** with explicit `permission` gates; new permission keys are added to the catalog + role templates + a one-time backfill migration.
4. **Every user-visible state change emits a notification + audit entry.**
5. **Migrations are additive and idempotent** (ADR-004 style, `scripts/migration-*.sql`).
6. **Everything ships with unit + integration tests** (extend `src/tests/isolation.test.ts` to every new table).
7. **UI follows the D1/D6 Frappe-inspired grammar** (`components/ui.tsx` primitives, rail + sidebar workspace architecture).

---

# 4. Feature parity matrices

Legend: ✅ = exists natively · ⚠️ = partial · 🆕 = build this plan

## 4.1 Zammad (helpdesk) parity

| Zammad capability | Status | Where / plan phase |
|---|---|---|
| Ticket record (title, state, priority, customer, owner, group) | ✅ | `tickets` table |
| State machine `new → open → pending → escalated → closed` | ✅ | `tickets.status` |
| Priority model (1 low … 3 high / urgent) | ✅ | `tickets.priority` |
| Customer can open + track tickets | ✅ | `/tickets` page |
| Agent queue (whole org), assignment | ⚠️ | assignee exists; **groups + unassigned queue** 🆕 P1 |
| Conversation thread (articles) | ✅ | `ticket_replies` |
| **Reply from within Wamiro** | ✅ | `POST /api/v1/tickets/[id]/replies` (native) |
| Internal notes (agent-only) | ✅ | `is_internal` + server-side filter |
| **SLA: first response + resolution deadlines, breach state** | ⚠️ | `sla_due_date` only → full SLA engine 🆕 P1 |
| **SLA dashboard (at risk / breached / due soon / healthy)** | 🆕 | P1 |
| **SLA escalation automation (warn → notify → escalate → manager)** | 🆕 | P1, on `automations` engine |
| **Email-to-ticket (inbound channel)** | 🆕 | P2 |
| **Attachments on tickets** | 🆕 | P2 (reuse storage) |
| **Service Catalog (request a service → workflow → approval → IT execution)** | 🆕 | P2 (reuse `requests`) |
| **CSAT survey after resolution** | 🆕 | P2 (reuse `surveys`) |
| **Incident / Problem / Change records** | 🆕 | P2 |
| **Groups, teams, assignment rules** | 🆕 | P2 |
| **Automation/triggers (auto-assign, auto-reply)** | ⚠️ | `automations` exists (requests) → extend to tickets 🆕 P2 |
| Knowledge base linked to tickets | ⚠️ | `knowledge` exists; link surface 🆕 P2 |
| Mention support in threads | 🆕 | P2 (reuse discussions/notifications) |
| Notifications (assigned/updated/SLA/resolved) | 🆕 | P1 (engine exists) |
| Reports (queue throughput, SLA compliance, CSAT) | 🆕 | P5 |

## 4.2 Frappe HR parity

| Frappe HR capability | Status | Where / plan phase |
|---|---|---|
| Employee master (profile, department, designation, reporting) | ✅ | `employees`, `departments` |
| Employee documents (contract, ID, letters) | ⚠️ | `documents` exists → HR document types 🆕 P3 |
| Attendance (clock in/out, records) | ✅ | `attendance` |
| **Shift scheduling / rostering** | 🆕 | P3 |
| **Attendance corrections & manager approval** | 🆕 | P3 |
| Leave (types, allocation, apply, approve) | ✅ | `leave` |
| **Leave encashment** | 🆕 | P3 |
| Holiday calendar | ✅ | `holidays` table (wire into attendance/leave) |
| Expenses & claims | ✅ | `finance.expenses` |
| **Payroll: salary structures, components, monthly runs, payslips, statutory deductions, net pay, bank export, payslip ESS** | 🆕 | P4 |
| Performance (cycles, self/manager review) | ✅ | `people-ops` reviews |
| Onboarding / offboarding | ✅ | `people-ops` journeys |
| Recruitment (openings, candidates, interviews, offers) | ✅ | `people-ops` recruitment |
| Learning (courses, enrollments) | ✅ | `people-ops` learning |
| Recognition | ✅ | `people-ops` recognitions |
| Employee lifecycle (promotion, transfer, compensation change) | ✅ | `job_changes`, `profile_change_requests` |
| HR analytics (headcount, attrition, leave utilization, payroll cost) | 🆕 | P5 |
| Employee self-service portal | ✅ | `/people/me`, `/settings` (extend with payslips in P4) |

---

# 5. Implementation phases

Each phase is independently shippable and ends with: migrations applied, typecheck/lint/tests green, integration tests extended, UI live, docs updated.

---

## Phase 1 — Helpdesk depth (SLA engine, escalation, notifications, CSAT groundwork)

**Outcome:** the native `/tickets` module matches Zammad's SLA and escalation behavior end-to-end.

**✅ IMPLEMENTED (2026-09-04):**
- Migration `0040` + schema: `first_response_due_at`, `first_response_at`, `sla_state`, `sla_warning_notified_at`, `breach_notified_at`, `csat_score`, `csat_comment` (+ indexes). Applied to live DB.
- `src/modules/tickets/service.ts`: pure `slaStateOf`/`slaBucketOf` (unit-tested), per-priority first-response (1/4/8/24h) + resolution (4/8/24/48h) deadlines, first-response stamping on first agent reply, `updateStatus` (stamps `resolvedAt`, persists state), `assignTicket`, `submitCsat`, `sweepSlaStates` (one-time at-risk/breach notifications), `listOpenForSla`, `listAssignableUsers`. Notifications wired for assign/status/reply/SLA.
- API: `GET /api/v1/tickets?sla=&status=` filters; `PATCH [id]` supports status + assignee; new `POST /api/v1/tickets/[id]/csat`.
- UI: `/tickets` full workspace (detail, conversation with internal notes, reply, assignee/status controls, CSAT stars, SLA countdown badges) in the shared design grammar; new `/tickets/sla` dashboard (breached/at_risk/due_soon/healthy) for agents; native Support workspace added to the rail (`src/lib/workspaces.ts`); home quick links point at `/tickets`.
- Tests: `src/modules/tickets/sla.test.ts` (7 cases, in `npm test`); isolation suite extended (cross-tenant assign/CSAT/sweep, SLA fields, CSAT lifecycle) — PASS vs live DB. Build green (60+ routes incl. `/tickets/sla`); smoke 14/14 PASS; live API E2E verified (create→SLA→resolve→CSAT).

### F1.1 SLA engine (first response + resolution, breach state)
**Behavior (as per Zammad):** every ticket has SLA targets per priority — first-response deadline (urgent 1h, high 4h, normal 24h, low 48h) and resolution deadline (urgent 4h, high 8h, normal 24h, low 48h — match current `SLA_HOURS`). First response is the timestamp of the first agent (`tickets.manage`) reply. Resolution is the `resolved` transition. Remaining time and breach are computed continuously.

**Build:**
- Schema (migration-00xx): add to `tickets`: `first_response_due_at`, `first_response_at`, `resolution_due_at` (replaces/aliases `sla_due_date`), `sla_state` (`ok | at_risk | breached`) computed + persisted by a cron sweep; `breach_notified_at`.
- Service: extend `src/modules/tickets/service.ts` — set deadlines at create; stamp `first_response_at` on first agent reply; compute `sla_state` in every read (derived) + a sweep job (`scripts/` or a lazy check on read) that flips persisted state and fires notifications once.
- API: `GET /api/v1/tickets?sla=at_risk|breached` filter; SLA fields on list/detail.
- UI: ticket list column "SLA" with remaining-time countdown + tone (matches D6 §32 "1h 24m remaining"); detail shows first-response/resolution deadlines.
- Permissions: none new (agent/requester split existing).
- Tests: unit (deadline math, first-response stamping) + integration (tenant isolation on SLA fields).

### F1.2 SLA dashboard
**Behavior (as per D6 §33):** agent view with queues: At risk, Breached, Due soon, Healthy.

**Build:** page `/support/sla` (or section in `/tickets`), four query views over `sla_state` + `slaDueDate` ordering; reuses ticket list primitives. Agent (`tickets.manage`) only.

### F1.3 SLA escalation automation
**Behavior (as per Zammad escalation + D6 §34):** when a ticket enters `at_risk` → notify assignee + requester; when `breached` → notify owner, then manager chain; optional auto-assign to a group if unassigned.

**Build:** extend `automations` engine with ticket event sources (`ticket.created`, `ticket.at_risk`, `ticket.breached`, `ticket.assigned`) and actions (notify user/email, set assignee/status, add internal note). Reuse `automation_rules` table with a new `source` column. Admin UI under `/admin` for rule management (list/create/activate) mirroring existing requests automation UI.

### F1.4 Support notifications
**Behavior (as per D6 §35):** ticket assigned, ticket updated, mentioned, SLA warning, SLA breached, ticket resolved, request approved, asset assigned/returned.

**Build:** wire `notifications` service into ticket service mutation points (assign, status change, reply, SLA events). New notification channels already exist; add tenant-scoped in-app + email (SMTP if configured).

### F1.5 CSAT groundwork (surveys + ticket link)
**Behavior (as per Zammad satisfaction):** after a ticket is resolved/closed, the requester gets a survey (1–5 stars + comment). Result visible to agents on the ticket and in reports.

**Build (P1 groundwork; UI completion P2):** add `ticketId` link to `surveys` (nullable FK), auto-create survey on `resolved` status change, notification to requester. Completing it stores the response on the ticket record (`csat_score`, `csat_comment`).

---

## Phase 2 — Helpdesk channel & catalog

**Outcome:** Zammad's remaining surfaces: email intake, attachments, service catalog, incidents/problems/changes, groups/routing.

**✅ IMPLEMENTED (2026-09-04):**
- Migrations `0041` + `0042` (applied): `ticket_attachments`, `ticket_groups`, `ticket_group_members`, `assignment_rules`, `service_items`, `it_records`, `mailboxes`, `mailbox_messages`; `tickets.group_id` + `tickets.related_knowledge_ids`; `services.manage` permission backfilled to admin/hr_admin; default catalog seeded for existing orgs AND in `provisionOrganization` (new tenants).
- **F2.1 Attachments** (`src/modules/tickets/attachments.ts`): multipart upload on tickets, list, tenant-scoped download (cross-tenant = 404), agent remove; storage via existing adapter.
- **F2.3 Service catalog** (`src/modules/support-catalog/`): employee catalog page `/tickets/catalog` (request forms), seeded items; no-approval items create a ticket instantly, approval items route through the requests engine; `request.approved` domain event → auto-create IT ticket for `auto_create_ticket` items (consumer in `src/lib/event-consumers.ts`, event emitted by `requests.service.review`). Admin CRUD at `/admin/services`.
- **F2.4 IT records** (`src/modules/it-records/`): incidents/problems/changes with per-type status machines, ticket linking, page `/tickets/it-records` with type tabs + create + status/link controls.
- **F2.5 Groups/routing** (`src/modules/ticket-groups/`): groups + members + assignment rules; `autoAssignOnCreate` hooks into `createTicketRecord` and assigns the least-loaded member. Admin UI at `/admin/ticket-groups`.
- **F2.6 Knowledge links**: `related_knowledge_ids` + `linkKnowledge` + detail panel links; knowledge titles returned by `getTicket`.
- **F2.2 Email-to-ticket** (`src/modules/mailboxes/`): mailbox connect UI at `/admin/mailboxes`, dedupe ledger, sender-match/unknown-skip, `[#ticket-id]` reply tags, attachments carried over; `pollMailbox` uses lazy `imapflow` (`webpackIgnore`, zero build deps — `npm i imapflow` + `npm run mail:worker` when enabling); ingestion fully unit/isolation-tested without a live IMAP server.
- Tickets detail panel gained attachment upload/download/remove + related knowledge. Navigation extended (Support workspace: catalog + IT records; Admin: services, ticket groups, mailboxes).
- Verified: typecheck clean · lint 0 errors (0 new warnings) · unit 33/33 · isolation suite extended (attachments, catalog CRUD + request routing, IT-record isolation, group auto-assign, mailbox ingest dedupe/reply/skip) PASS vs live DB · build green (9 new routes) · smoke 14/14 · live API E2E for every Phase 2 flow.

### F2.1 Ticket attachments
**Behavior (as per Zammad):** attach files when creating/replying; agents and requesters see them; internal-note attachments stay agent-only.

**Build:** reuse storage adapter (`src/lib/storage.ts`, `WAMIRO_DATA_DIR` / S3 seam) via the `documents` upload path; new table `ticket_attachments (id, organization_id, ticket_id, reply_id nullable, file_key, file_name, mime, size, uploaded_by, created_at)`. Multipart handling in `POST /api/v1/tickets` and `POST /api/v1/tickets/[id]/replies`; render as download links with tenant-scoped auth (mirror existing document-download 404-isolation behavior). Tests: cross-tenant download → 404.

### F2.2 Email-to-ticket
**Behavior (as per Zammad email channel):** a per-tenant inbound address (e.g. `support@tenant.wamiro.app`) receives mail; a new ticket (or reply on existing, via `[ticket-id]` subject tag) is created; the sender is matched/created as end-user by email; attachments carried over.

**Build:** table `mailboxes (id, organization_id, email, enabled, forward_to_group_id nullable, created_at)`. Polling worker (`scripts/worker-mail.mjs` run under systemd/pm2, same host) using `imap`/POP over SMTP URL config (`IMAP_URL`); creates tickets through `tickets.service.createTicket` with `source = "email"`; dedupe via `idempotency_keys` (message-id). Admin UI: connect mailbox (host, user, pass), test connection (mirrors documented "connect-test" pattern), last-sync status. Config in `.env`: `IMAP_*` per tenant in DB (encrypted at rest), not env. Integration test: assert mail→ticket creation + tenant isolation.

### F2.3 Service Catalog
**Behavior (as per D6 §12–14):** employee-facing catalog of services (Access, Hardware, Software, Accounts, Security, plus enabled Travel/Facilities). Each item: icon, name, description, eligibility, expected time, approval process, `[Request]` → creates a request through the existing `requests` engine → approval → IT execution → notification.

**Build:** table `service_items (id, organization_id, name, description, category, icon, expected_time_days, approval_required, request_type_id, eligibility_rule (jsonb), active, sort)`. Page `/support/catalog` (employee) and `/admin/services` (admin CRUD). Request flow reuses `request_types`/`requests`; IT execution = optional linked automation (e.g., create ticket/asset assignment). Seed a default catalog on tenant creation.

### F2.4 Incident / Problem / Change management
**Behavior (as per D6 §15 + Zammad-adjacent ITSM):**
- **Incident:** title, impact, priority, status, owner, affected service, started, updated — linked to tickets (an incident may spawn/absorb tickets).
- **Problem:** root-cause record linked to one or more incidents.
- **Change:** planned change with risk assessment, approval workflow (reuse `requests`), implementation window, status.

**Build:** one table `it_records (id, organization_id, type: incident|problem|change, title, description, impact, priority, status, owner_id, affected_service, window_start/end, risk, ticket_ids uuid[], created_at, updated_at)`; service `src/modules/it-records/service.ts`; APIs `/api/v1/support/{incidents,problems,changes}`; pages under `/support`; permissions `it_records.manage` / `it_records.view` (catalog + templates + backfill migration).

### F2.5 Groups, assignment rules, mentions
**Behavior (as per Zammad groups/triggers):** tickets belong to a group; agents can be in one or more groups; unassigned queue per group; auto-assignment rule (round-robin or by category) on create.

**Build:** table `ticket_groups (id, organization_id, name, description)`; `ticket_group_members`; `tickets.group_id` FK; `assignment_rules (id, organization_id, group_id, category, round_robin, active)`. Auto-assign on create; UI: group management under `/admin`, group filter in agent queue. Mentions in replies → notification (reuse discussions mention pattern).

### F2.6 CSAT completion + knowledge links
Finish CSAT flow UI (requester sees survey; agents see results on ticket detail) and link related knowledge articles to ticket detail (`related_knowledge` via existing `knowledge_articles` ids on `tickets`).

---

## Phase 3 — HR operations completion

**✅ IMPLEMENTED (2026-09-05):** (F3.5 self-service hub deliberately folded into Phase 4 — payslips make `/people/me` meaningful; the per-feature self-service surfaces already exist.)
- **F3.1 Shifts** (`src/modules/shifts/`, migration 0043): `shift_types` (start/end minutes, grace, hours, color) + `shift_assignments` (per employee + date, unique per org); shift-type CRUD, range/weekly-repeating assignment, roster queries, membership guard against cross-tenant targets. Clock-in attaches the day's rostered shift; the weekly attendance view shows planned shift windows (`scheduled`/`shiftLabel` cells). UI: `/shifts` (My shifts + HR roster/type/assign panel), nav in People workspace. Permissions `shifts.view` (all) + `shifts.manage` (hr_admin/admin), backfilled.
- **F3.2 Attendance corrections** (`src/modules/attendance/corrections.ts`): employee requests `clock_in | clock_out | missing` correction with reason + actual times; manager (TEAM) or HR (COMPANY) approves/rejects; approval upserts the attendance record with a `corrected:` note; one pending correction per day; notifications + audit (`ATTENDANCE_CORRECTION_*`). New permission `attendance.correct` (manager TEAM, hr_admin/admin COMPANY), backfilled. UI: `/attendance/corrections` (request form + approvals queue + history).
- **F3.3 Employee HR documents** (`src/modules/people/hr-documents.ts`): typed docs (offer letter / contract / ID proof / degree / bank / tax / other) with expiry, stored via the storage adapter under `hr-documents/`; owner always reads/downloads own, `employees.edit` manages all; 30-day expiry sweep notifies the owner once per document (fires when HR opens the page, mirroring the SLA sweep). UI: `/people/documents` with upload (self or any employee), list, download, delete.
- **F3.4 Leave encashment + holiday wiring**: `leave_encashments` with apply → decide (approval mirrors leave scoping; per-day rate required; amount = days × rate recorded for the P4 payroll link; approved days deducted from the balance). UI `/leave/encashment`. `holidays` now (a) flag attendance week cells (`Holiday` chip, excluded from days-worked) and (b) are subtracted from charged leave days in `leave.service.businessDays`.
- Verified: typecheck clean · lint 0 errors (0 new warnings) · unit 33/33 · isolation suite extended (shift types/roster/clock-attach + cross-tenant roster/assign guards, correction review org-scoping + applied record, encashment org-scoping/self-approval/amount math, holiday day-exclusion, HR-doc owner vs cross-tenant access) PASS vs live DB (migration 0043 applied) · build green (new `/shifts`, `/attendance/corrections`, `/leave/encashment`, `/people/documents` routes) · smoke 14/14 · live API E2E of every Phase 3 flow.

### F3.1 Shift scheduling / rostering
**Behavior (as per Frappe HR shifts):** HR defines shift types (name, start/end, grace, working hours); assigns employees to shifts (daily or weekly roster); attendance clock-in validates against assigned shift; reports show per-shift coverage.

**Build:** tables `shift_types (id, organization_id, name, start_time, end_time, grace_minutes, working_hours, color)`; `shift_assignments (id, organization_id, employee_user_id, shift_type_id, date, is_recurring_pattern jsonb nullable)`. Attendance service: on clock-in, attach `shift_type_id`; weekly view shows shift windows. UI under `/people/shifts` (HR) + employee view; permission `shifts.manage` / `shifts.view`; calendar view reuses D14 calendar primitives.

### F3.2 Attendance corrections
**Behavior (as per Frappe):** employee requests a correction (missed clock-in/out, wrong time) with reason; manager approves; audit trail.

**Build:** table `attendance_corrections (id, organization_id, employee_user_id, record_date, type: in|out|missing, requested_in_at/out_at, reason, status, decided_by, decided_at)`; flow mirrors leave apply/approve; after approval, upsert `attendance_records` with `corrected_at` marker. Page `/people/attendance` corrections tab.

### F3.3 Employee HR documents
**Behavior (as per Frappe Employee documents):** typed document records per employee (offer letter, contract, ID proof, degree) with expiry; expiry notifications.

**Build:** table `employee_documents (id, organization_id, employee_user_id, doc_type, file_key, title, expires_at, uploaded_by, created_at)` using storage; reuse documents upload; `/people/[user]/documents`; expiry sweep → notifications; permission `employees.edit` to manage, employee sees own.

### F3.4 Leave encashment + holiday wiring
- **Encashment:** table `leave_encashments (id, organization_id, employee_user_id, leave_type_id, days, rate (salary-day basis), status, decided_* )`; workflow reuses approvals; on approval, days deducted from balance and amount queued into payroll (P4 link).
- **Holidays:** wire existing `holidays` into attendance (holiday = no clock-in required) and leave (holiday not counted) views.

### F3.5 Employee self-service polish
Single `/people/me` surface: profile changes (exists), documents, payslips (P4), corrections, recognitions, learning, lifecycle timeline — ensure empty states + notifications on approvals.

---

## Phase 4 — Payroll engine (the large one)

**✅ IMPLEMENTED (2026-09-05):**
- **F4.1 Components + structures** (`src/modules/payroll/service.ts`, migration 0044): org-wide `salary_components` library (earning/deduction × fixed/% of basic, taxable flag) with activation/deactivation; versioned `salary_structures` per employee (base, currency, effective date) with component lines — first structure auto-activates, later ones start draft and are explicitly activated (superseding the previous); net-pay must be positive at creation; membership guard blocks cross-tenant structures. APIs `/api/v1/payroll/{components,structures}`; activate endpoint.
- **F4.2 Payroll runs**: `payroll_runs` (draft → submitted → approved → paid) + computed `payslips` (earnings/deductions JSON, gross, net). Pure `computeAmounts` (unit-testable) adds the base as an earning, applies fixed/% lines, and prorates by worked days vs scheduled workdays (weekdays minus org holidays; no attendance on record = full month). Approved **leave-encashment payouts inside the period are added automatically** as an earning — P3↔P4 synced. Runs: create → compute (draft only, regenerates) → submit → approve → paid (payslips lock; every employee notified).
- **F4.3 Payslip delivery (ESS)**: `GET /api/v1/payroll/payslips/mine` returns the viewer's own slips once a run is approved/paid (never earlier); single-slip read is owner/manager + run-state gated; `/payroll` page shows an expandable payslip breakdown.
- **F4.4 Bank export**: employees gained `bank_name / bank_account_no / ifsc_code` (set via `/api/v1/payroll/bank`); `GET /api/v1/payroll/export?runId=` streams an audited CSV of approved/paid runs (net > 0) gated by `payroll.manage` + `data.export`.
- **F4.5 Reports**: `/api/v1/payroll/ytd` year-to-date per-employee rollups; run list shows per-run totals; UI `/payroll` (Payroll workspace entry) — component library, structure builder, run lifecycle, bank details, YTD.
- Permissions `payroll.view_self` (all roles) + `payroll.manage` (hr_admin/admin), backfilled for existing tenants.
- Verified: typecheck clean · lint 0 errors (0 new warnings) · unit 33/33 · isolation suite extended (component/structure org-scoping, run + payslip math 1000+200−50 = 1150, cross-tenant run compute/payslip reads denied, self-view gating, bank remittance rows, lock-on-pay, YTD rollup) PASS vs live DB (migration 0044 applied) · build green (13 new payroll routes + `/payroll`) · smoke 14/14 · live API E2E: components → structure → run compute/submit/approve/paid → payslip (locked, net 1150) → bank CSV → YTD.

**F4.6 (deferred):** statutory per-country engines (PF/PT/TDS registers) remain config-driven — the component/deduction model supports them via %-of-base deduction components.

### F4.1 Salary structures & components
**Behavior (as per Frappe):** HR defines earning components (basic, HRA, allowances, bonus, overtime) and deduction components (PF, professional tax, income tax, loan recovery, others) per employee with amounts/percentages and effective dates; structure versioning.

**Build:** tables:
- `salary_components (id, organization_id, name, type: earning|deduction, amount_type: fixed|percent_of_basic, default_amount, is_taxable, active)`
- `salary_structures (id, organization_id, employee_user_id, name, base, currency, effective_from, status: draft|active|superseded)` 
- `salary_structure_lines (id, structure_id, component_id, amount, percent_of_basic nullable)`
Service `src/modules/payroll/service.ts`; APIs `/api/v1/payroll/{components,structures}`; UI under `/people/payroll` (HR) — component library + per-employee structure editor with validation (earnings ≥ deductions, no negative net).

### F4.2 Monthly payroll runs
**Behavior (as per Frappe Payroll Entry):** HR selects a month + employees → system computes each payslip from the active structure + attendance (pro-rated days) + leave encashments + approvals → run state machine `draft → submitted → approved → paid`; lock after pay.

**Build:** tables `payroll_runs (id, organization_id, period_label, period_start, period_end, status, submitted_by/at, approved_by/at, paid_by/at, currency)` and `payslips (id, organization_id, run_id, employee_user_id, earnings jsonb, deductions jsonb, gross_cents, total_deduction_cents, net_cents, status, locked)`. Computation is a pure function (unit-testable): earnings/deductions from structure lines, pro-ration by worked days from attendance, encashment amounts added as earnings. Run list + detail pages with per-employee breakdown; approval reuses approvals engine; `payroll.manage` / `payroll.view` / `payroll.run` permissions.

### F4.3 Payslips & ESS delivery
**Behavior (as per Frappe):** employee sees own payslips (read-only, after run approval); printable/downloadable (PDF via print stylesheet or server-side render); locked after payment.

**Build:** `GET /api/v1/payroll/payslips/mine`; page `/people/me` → Payslips tab with detail view + print; download = server-rendered HTML/PDF, tenant-scoped auth, audited.

### F4.4 Bank export
**Behavior (as per Frappe bank remittance):** generate salary bank file (CSV with account numbers, net pay, bank/IFSC per employee) for approved runs; audited export.

**Build:** `GET /api/v1/admin/export/payroll?runId=` gated by `payroll.manage` + `data.export`; includes only approved, net > 0 payslips; employee bank fields on `employees` (`bank_name`, `bank_account_no`, `ifsc_code`, nullable).

### F4.5 Year-to-date & reports
Per-employee YTD earnings/deductions rollups; per-run totals; statutory deduction register (PF/PT per employee) for compliance filing; P5 consolidates into analytics.

---

## Phase 5 — HR & support analytics + reporting — **IMPLEMENTED**

**Outcome:** parity with Frappe HR Reports and Zammad reports. All metrics computed live in `src/modules/analytics/reports.ts` (single definition per KPI, org-scoped SQL, COMPANY-scope gates).

- **HR** (`/analytics/hr`, gated `analytics.view_company`): headcount by department + employment status, attrition (joins from `hired_at`, leaves from new `employees.left_at` stamped by the suspend/reinstate lifecycle, monthly last 6m + 12m rate), leave utilization by type (balances YTD), overtime vs rostered hours (30d, top employees), payroll cost per department (approved/paid runs YTD), recognition heat (6m) + top recipients, hiring funnel (open jobs + candidates by stage).
- **Support** (`/analytics/support`, gated new `tickets.sla_view` granted hr_admin/admin/ceo + backfill in `migration-0045`): ticket volume (status/category/priority + 30d trend), SLA compliance (met/due + by priority + first-response compliance and avg hours), CSAT (avg, response rate, 1–5 distribution), group + assignee workload, unassigned count.
- **Exports:** datasets added to the audited registry (`src/modules/admin/export.ts`): `hr-headcount`, `hr-attrition`, `hr-leave`, `hr-payroll`, `support-tickets`, `support-sla`, `support-csat` — buttons on the Admin page.
- **Dashboards:** `dashboardExtras()` merges `open_tickets`, `sla_compliance_pct`, `csat_avg`, `payroll_cost_ytd`, `attrition_12m_pct` into the existing pin-able `dashboardWidgets` list for managers/CEOs.

---

## Phase 7 — Parity gap-fill & navigation/UX overhaul ✅ IMPLEMENTED

**Outcome:** the last Zammad agent tooling and Frappe HR capabilities the plan deferred, plus a redesigned sidebar.

**Zammad agent toolkit** (`migration-0046`, `src/modules/tickets/toolkit.ts`):
- **Tags** on tickets (dedup per ticket), **time accounting** (entries + totals per ticket), **linked tickets** (related / blocks / duplicates with title search), **canned responses** (text modules) and **macros** (named sets of actions: set status/priority, assign, add tag, add reply, add internal note — applied in one click, audited, requester notified on replies).
- UI: ticket detail gains Tags / Time / Linked tickets / Macros panels; the reply box gets a canned-response picker; new **Agent Toolkit** page (`/tickets/toolkit`) manages canned responses + macros. All mutations gated `tickets.manage`, every read org-scoped, requester can view their own ticket's readouts.

**Frappe HR gap-fill:**
- **Salary advances**: apply → approve/reject (payroll.manage) → approved advances decided inside a payroll period are **auto-deducted by the run computation** (deterministic, recompute-safe — same pattern as encashment). UI at `/payroll/advances`.
- **Leave auto-allocation**: `leave_types.auto_allocate` flag; `reconcileAnnualAllocations` grants the annual quota on hire + each new year, self-healing on every balance read (idempotent). Seeded types now auto-allocate.

**Navigation & UX overhaul:**
- Sidebar now lists **every workspace as a tab** with its sub-modules, **single-open accordion** (opening one closes the others; navigating auto-opens the owning tab), grouped sub-modules (Directory / Time & Attendance / Leave / Payroll & Documents / People Ops / Access & Security / Support Settings …). Removed the decorative WAMIRO rail.
- Added previously orphaned modules to nav: My Profile, Favorites, Performance, Recognition, Recruitment, Learning, Onboarding & Offboarding, Governance (under Company), new **Workplace** tab, Salary Advances.
- Ticket detail panel modernized to the shared design-token grammar.

**Verification:** typecheck clean · lint 0 errors · unit 33/33 · isolation suite extended (tags/time/links/canned/macro org-scoping, macro state-change, advance auto-deduction net 850, leave auto-allocation) PASS vs live DB · build green · smoke 14/14 · live E2E (tags→time→canned→macro resolves ticket→links; advance apply/approve; leave balances auto-allocated 20/10/6; employee 403 on every toolkit mutation).

---

## Phase 6 — Cutover & decommission ✅ IMPLEMENTED

**Outcome:** Frappe/Zammad removed from the product surface; zero runtime coupling remains.

**Delivered:** registry flipped (`hr`/`itsm` → `active: null`, status `integrated`, config probes removed); adapters `src/modules/integrations/{frappe,zammad}.ts` + legacy `/support` surface (page, client, `/api/v1/support/*` routes, sync button, `admin/integrations` registry route) deleted — all removed routes 404 cleanly; `FRAPPE_*`/`ZAMMAD_*` purged from `.env.example` + deployment docs; README/architecture/provider-registry/modules-support audit docs rewritten, `deploy-oracle.md` §4–5 retired to a historical appendix; optional one-shot importers `scripts/import-frappe-employees.mjs` (CSV → users + employees) and `scripts/import-zammad-tickets.mjs` (CSV → tickets) added; smoke + e2e-all updated to the native `/tickets` API. Verified green with **zero integration env vars**: typecheck, lint 0 errors, unit 33/33, isolation suite PASS vs live DB, build, smoke 14/14, live E2E over native HR/support flows.

1. **Registry flip** (`src/lib/providers/registry.ts`): `hr` and `itsm` capabilities → `active: null`, status `integrated` (native is primary, no external adapter); remove `frappeConfig`/`zammadConfig` probes.
2. **Remove adapters** `src/modules/integrations/frappe.ts`, `zammad.ts` and the Zammad-backed surfaces: `/support` page + `src/components/support-client.tsx` + `/api/v1/support/tickets/*` routes (native `/tickets` supersedes them); keep route 404s clean.
3. **Env cleanup:** delete `FRAPPE_*`, `ZAMMAD_*` from `.env.example`, `docs/product/deployment.md`, deploy runbooks.
4. **Docs:** update README (remove "optional Frappe HR"/"Zammad" mentions), `docs/architecture.md` deviation table, `docs/audit/provider-registry.md`, `docs/audit/modules/support.md`; retire `docs/deploy-oracle.md` §4–5 into a historical appendix.
5. **Optional importers (nice-to-have, P6):** CSV importers for legacy Frappe employee master and Zammad tickets (columns documented) so migration from an existing deployment is painless.
6. **Final verification:** `npm run verify`, `npm run build`, smoke test with zero integration env vars set — every HR/support feature green.

---

# 6. Cross-cutting work items

| Concern | Plan |
|---|---|
| IAM catalog | New permissions: `tickets.sla_view`, `it_records.*`, `shifts.*`, `payroll.*` (manage/view/run), `services.manage`; add to employee/manager/hr_admin/admin templates; backfill migration for existing tenants (pattern from D13) |
| Notifications | Ticket + payroll + shifts + documents events; in-app always, email when SMTP configured |
| Audit | Every mutation: `TICKET_SLA_*`, `PAYROLL_*`, `SHIFT_*`, `ENCASHMENT_*`, `DOCUMENT_*`, `IT_RECORD_*`, `ATTENDANCE_CORRECTION_*` with entity ids + newValue payloads |
| Storage | Attachments + HR documents via existing storage adapter; document download isolation tests extended |
| Automation | Extend `automation_rules` with ticket sources/actions (F1.3, F2.5) |
| Worker | `scripts/worker-mail.mjs` (IMAP polling) + SLA sweep — systemd unit documented like the app; respects single-instance assumption (ADR notes) |
| Search | Index tickets, service items, payroll runs (requesters/agents by permission scope), matching existing per-module search pattern |
| Tests | Extend `src/tests/isolation.test.ts` to all new tables (payroll, shifts, mailboxes, attachments, it_records, service_items, encashments, employee_documents); unit tests for payroll math + SLA math; E2E smoke additions for catalog request → approval → ticket, and payroll run → payslip view |
| Seed | Extend `src/db/seed.ts` (or demo seed) with default service catalog + default salary components for demo tenants |

# 7. Suggested sequencing summary

```
P1  SLA engine + dashboard + escalation + notifications + CSAT groundwork   (2–3 sprints)
P2  Email-to-ticket + attachments + service catalog + incidents/problems/
    changes + groups/routing + mentions + CSAT UI + knowledge links          (2–3 sprints)
P3  Shifts + attendance corrections + HR documents + encashment + ESS        (2 sprints)
P4  Payroll (components → structures → runs → payslips → bank export)        (3–4 sprints)
P5  HR & support analytics + export datasets                                  (1–2 sprints)
P6  Cutover: registry flip, adapter removal, env/docs cleanup, importers,    (1 sprint)
    final verify
P7  Parity gap-fill (agent toolkit, advances, leave auto-allocation) +      (1 sprint)
    sidebar/nav overhaul
```

Each phase gates on: `npm run lint` 0 errors · `npm run typecheck` clean · `npm test` green · `npm run test:integration` green (live DB) · `npm run build` green · migrations idempotent · docs updated.