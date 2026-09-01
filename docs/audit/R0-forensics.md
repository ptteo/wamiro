# R0 — Repository Forensics (living document)

Master command: `docs/Wamiro_R&D_Master_Package/00_WAMIRO_MASTER_ORCHESTRATOR.md`.
Phase registry: `06_WAMIRO_PHASE_REGISTRY.md` (R0–R15 above D1–D15 baselines).

## Documentation inventory (verified on disk)

| File | Lines | Status |
|---|---|---|
| 00 Master Orchestrator | 2710 | present |
| 01 Research Agent Team | 566 | present |
| **02 End-to-End Blueprint V2** | — | **MISSING from directory — must be restored/authored (gap DOC-1)** |
| 03 Role & Identity Flow Spec | 351 | present |
| 04 Open-Source Provider Registry | 158 | present |
| 05 100-Company E2E Test Matrix | 535 | present |
| 06 Phase Registry | 65 | present |
| D1–D15 phase specs | ~26k total | present; **D14 Workplace & D15 Governance never implemented** |

## Documented-vs-actual classification (running table)

| Area | Class | Evidence |
|---|---|---|
| Auth/sessions/MFA | IMPLEMENTED CORRECTLY | unit+integration suites, suspend kills sessions (E2E) |
| Tenant isolation | IMPLEMENTED CORRECTLY | isolation suite green across 15 surfaces |
| Multi-org membership per person | **IMPLEMENTED (R2 r2-3) — 46/46 E2E** | migration-0030 memberships + session active-org (COALESCE join); migration-0031 dropped global `employees_user_key` UNIQUE(user_id) → per-org UNIQUE(org,user) — that constraint was the hidden blocker forbidding one person in two tenants. Switcher APIs verified: list→switch→context change→switch back; identity-link invite now works |
| Active role context in shell | PARTIAL → FIXED this round | identity chip w/ roleNames in desktop sidebar + mobile header |
| Domain events (§33) | **IMPLEMENTED core (R6 r6)** | `emit()` persists + fans out to isolated consumers (`src/lib/event-consumers.ts`, registered via api.ts); live consumers: leave.requested & request.created → manager notification; notifications list API added; **E2E proves manager receives actionable notification** |
| Personal user configuration (§17) | **IMPLEMENTED (R5 r5-6)** | store + merged GET/PUT + ThemeToggle now persists theme server-side (best-effort); E2E proves global-vs-tenant split across real tenant switch |
| Authorization precedence (§14) | **IMPLEMENTED + TESTED (R3 r4)** | `precedence.test.ts` (11 contract tests wired into `npm test`): deny>override>role, default-deny, widest-scope, expiry semantics, catalog-locked keys (engine hardened: unknown keys can never be granted), documented non-implication manage≠approve. Enforcement points: route() permission gate + service-level checks + engine |
| Role-based HOME (§14) | **IMPLEMENTED (R4 r1)** | `personasFor()` derives executive/hr/manager/admin/employee from effective permissions; `/home` renders materially different sections per persona; identity header shows dept (§13) |
| Role-based RAIL deltas (§15) | PARTIAL | rail is module+permission filtered, not role-weighted → R4 |
| Department-scoped experience (§13) | MISSING UI | dept exists in IAM scope only → R4/R7 |
| Personal user configuration (§17) | MISSING | no user_prefs store beyond favorites/savedViews → R5 |
| Invitation flow edge cases (§21) | PARTIAL | invite works; expiry/duplicate/revoke states absent → R2 |
| Temporary access (§27–28) | PARTIAL | overrides+delegations exist; acting-manager absent → R3 |
| Platform vs tenant admin (§25) | PARTIAL | platform orgs API + super_admin role exist; guarded console minimal → R6 |
| D14 Workplace | **CORE IMPLEMENTED (r20-21)** | workplace_resources + workplace_bookings (migration-0035); conflict-checked booking API returning human-readable 409 (§9); cancel w/ owner-or-manager authz; `workplace` module + permission group + employee base grants; E2E: create→book→conflict-409→cancel all green. Remaining D14: visitors, facilities issues, calendar UI |
| Registration 500 regression (r20) | **FIXED (r21)** | Root cause: admin SYSTEM_ROLE template contained duplicate `workplace.manage` grant → multi-row insert violated role_permissions uniqueness on every new tenant. Diagnosed via prod stderr capture; catalog deduped to exactly one grant per template; suite green again |
| R7 provider registry | **IMPLEMENTED (r16)** | `src/lib/providers/registry.ts` capability→adapter map (license+status+configured-probe), admin status API `GET /api/v1/admin/integrations` (settings.manage, booleans only), doc `docs/audit/provider-registry.md` honoring doc-04 hard cost/license rules; E2E 51/51 |
| R13 security review | **DELIVERED (r17)** | `docs/audit/security-review.md`: §41 threat table w/ enforcement points + verification per row; fixed real gap this round — documents upload now has 25 MB cap + mime allow-list; migration-0034 adds hot-path indexes (notifications user+created_at, sessions active_org, requests org+status); gaps tracked (upload negative-case test, restore drill, AI tool scoping) |
| D14 Workplace | **CORE + VISITORS IMPLEMENTED (r20-21, r24)** | resources/bookings (0035) with conflict-409; **visitors (0037): invite→checkin→checkout lifecycle, host-or-manage authz, E2E green**; `workplace` module + perms registered. Remaining D14: facilities issues, calendar UI |
| D15 Governance | **CORE + OBLIGATION SWEEP + CONTROLS TESTING IMPLEMENTED (r23, r25-27, r29)** | gov_policies/gov_risks/gov_controls/gov_obligations (migration-0036); obligations gained owner+escalated_at (0038); `POST /api/v1/governance/sweep` escalates overdue open obligations once and notifies governance.manage holders (org-correct query via roles join — initial version wrongly referenced user_roles.organization_id, caught by cause-chain logging); policies = metadata wrappers over Knowledge (§8); **controls: create + record test result (status/result/lastTestedAt) via POST+PATCH, E2E green**. Remaining D15: legal matters/contracts |
| Module excellence program | **ALL 13 MODULES DONE — Home · People · Work · Requests · Knowledge · Documents · Support · Finance · Workplace · Analytics · AI · Admin · Governance** | `docs/audit/modules/*.md`: quick-actions + who's-out; profile depth + direct reports + lifecycle; overdue salience + project bars; SLA badges + escalation visibility + bulk approval; recents strip + freshness pill + tag filter + author avatars (Knowledge); documents grouped + drag-drop + recents + search/sort + download count from audit log; support stats strip + state filter + recents + inline detail panel + article timeline; finance home stats strip + multi-currency pending totals + 30-day category breakdown + recent vendors + activity timeline + bulk approval center; workplace page (NEW) w/ stats strip + org-wide day timeline + kind-filtered resources + inline booking form + free/busy badges + recents + tabbed visitors w/ check-in/out; analytics operations + finance & risk KPI strips + 30-day comparisons w/ tone-coded deltas + expenses-by-category + leave-by-type charts + scope badge + CSV snapshot export; AI assistant w/ role-aware suggestion chips, history sidebar w/ date stamps, stop button (AbortController), typing indicator, scroll-to-bottom pill, citation links; admin users search+status+role filters, audit log actor filter + CSV export + pagination hint, security-events (24h) strip; governance page (NEW) w/ risk heat map + 4 tabs + inline create forms + status actions + run-sweep button + due-date badges. New components: `BulkApprovalList`, `CsvExportLink`, `WorkplaceClient`, `GovernanceClient`. New services: `orgBookingsOn`, `getTicket` (customer-scoped), `setObligationStatus`. New UI props: `Stat tone`, `KpiStrip comparisonTone`. New endpoints: `GET /api/v1/support/tickets/[id]`. 11 new analytics metrics (8 scalars + 2 chart series + 1 currency rollup). Helper: `suggestionsFor(access)`. Bugs caught+fixed: leave_by_type enum mismatch (no 'reimbursed' in leave_status), knowledge_articles has no 'status' column, setPolicyStatus bumpVersion was `undefined as unknown as number` (latent no-op) now `sql\`${govPolicies.version}+1\`` + audit. AI chat 500→503 fix. **59/60 E2E green** — no regressions across all 13 modules. Home refresh (m14) added. **64/64 E2E green** across all 13 modules plus AI hardening plus Home refresh. Continuing with backlog items per module. (policy version diff, control evidence, framework mapping, etc.). |
| R14 readiness / RC | **CLOSED OUT (r29)** | Full battery GREEN (lint 0 · types clean · 25/25 unit · integration 1/1) + E2E 58/58 on prod; release notes v0.2.0 published (`docs/product/release-notes.md`); rc-readiness checklist current with restore-drill ticked and remaining GA items enumerated (D14 UI, D15 UX/legal, parallel branches, AI scoping) |
| Backup restore drill | **PERFORMED & PASSED (r28)** | `scripts/restore-drill.mjs`: WAL_LOG clone of live DB → row-parity on 9 core tables (orgs=109, users=153, employees=168, audit=2170) → drop. **DR claim now supported by a tested restore path.** Full pg_dump-based logical drill still blocked locally (pg_dump 17 vs server 18.3) — install PG18 client tools for artifact-level dumps |
| R13 security review | **DELIVERED (r17-18)** | `docs/audit/security-review.md`: §41 threat table w/ enforcement + verification per row. Fixed real gap: documents upload 25 MB cap + mime allow-list; migration-0034 hot-path indexes. Negative cases now AUTOMATED in e2e-all (oversized upload 400, blocked mime 400, employee export denied). Remaining gaps tracked: AI tool scoping, per-route mutation rate limits |
| R11 performance | **EVIDENCE (r16-17)** | Sim N=10 → 25: search p95 731ms @25 tenants (flat vs 643ms @10 after 0034 indexes); /me p95 268ms; notifications p95 340ms. Register 429s beyond env limit are limiter-by-design (raise REGISTER_RATE_LIMIT_PER_HOUR for bulk runs). Next: larger N needs non-dev server + separate IP |
| R12 100-company simulation | **HARNESS DELIVERED (r16)** | `scripts/simulate-tenants.mjs` (`npm run sim`): N-tenant provisioning via public API + per-tenant workload (identity/directory/search/notifications) with p50/p95 latency report and a per-check cross-tenant search-leak assertion. Verified: 10/10 tenants, 0 failures, **0 isolation leaks in 40 scoped checks**; register rate-limit made env-configurable (`REGISTER_RATE_LIMIT_PER_HOUR`, default raised 5→20) to support bulk onboarding — documented decision |
| Workflow engine (§32) | **SEQUENTIAL CHAINS VERIFIED IMPLEMENTED (r19)** | requestTypes.steps → review() resolves chain, authorizes PER-STEP (manager-of-requester or company scope), advances currentStep, records approvedSteps[], finalizes on last; rejection short-circuits w/ notify+audit; pendingForApprover filters to current step. SLA+escalation from r12-15. Remaining §32 deltas: parallel branches, retry/timeout automation |
| Workflow engine legacy row | superseded by row above |
| Domain events (§33) | PARTIAL | domainEvents table + emit() exist; few producers/consumers → R6 |
| Provider adapters (§27 of cmd) | PARTIAL | Frappe/Zammad behind services; storage local; no adapter registry → R7 |
| D14 Workplace | MISSING entirely | no tables/routes/pages |
| D15 Governance | MISSING entirely | none |
| Search ordering tenant→perm→scope→query | IMPLEMENTED CORRECTLY | search service gates before querying |
| AI authorization/citations (§35–37) | **Citations IMPLEMENTED (R10 r7-8)**: chatTurn returns {answer,citations}; knowledge hits become "Sources" deep-links in the chat UI; §36 satisfied by design (all AI tools read-only, mutations require confirmed product flows). Remaining: per-tool scope narrowing for cross-tenant resources |
| R10 ledger cleanup | done |

## Verified-green baseline entering the program

`scripts/e2e-all.mjs`: 42/42 PASS ×2 consecutive runs · lint 0 errors · typecheck clean · production build GREEN · migrations applied through 0029.

## Execution order (registry)

R0 ✔(this doc) → R1 research synthesis → R2 multi-org identity → R3 authorization precedence tests → **R4 role experiences (P0 homes/rail)** → R5 preferences → R6 platform services/events → R7 provider adapters → R8 workflow engine → R9 search → R10 AI safety+citations → R11 perf → R12 100-tenant sim → R13 security → R14 readiness → R15 RC.

Rule: every gap lands as spec-update → implement → test → evidence here.
