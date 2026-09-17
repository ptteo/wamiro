# Wamiro — Project Gap & Issue Analysis

**Date:** 2026-09-17 · **Branch:** `saniya-phases` · **Scope:** read-only investigation of the full codebase (IAM, tenancy, billing, admin console, payroll, tickets, storage, mail, SSO/webhooks, jobs/workers, tests).

**Legend:** 🔴 critical · 🟠 high · 🟡 medium · 🔵 low · ✅ = strength worth keeping.

---

## 1. Executive summary

The codebase is unusually disciplined for its stage: pure permission engine, RLS defense-in-depth, audited mutations, seat-aware billing, and honest empty states. The real risks are concentrated in five places:

1. **Audit is fire-and-forget** — a DB hiccup silently drops the audit trail (compliance exposure).
2. **Session loading runs outside RLS scope** and platform operators run unscoped by design — correct, but it means the `sessions`/`users` reads in `loadAuthContext` rely solely on the module-layer discipline.
3. **`listAuditLogs` caps at 200 rows** and caps pagination: offset pagination on a growing `audit_logs` table will degrade; there's no retention job.
4. **Rate limiting / mail / webhooks / storage are single-instance-friendly but not horizontally hardened** (fixed windows, fire-and-forget deliveries, no DLQ).
5. **Several UI/UX gaps in the admin console** (partially addressed in this branch: nav, tables, chips, pagination, attention items).

---

## 2. Critical findings

### 🔴 G-01 · Audit writes are fire-and-forget with no durability guarantee — ✅ FIXED
`src/lib/audit.ts` swallows insert errors after a `console.error`. If Postgres is briefly unavailable (deploy, failover), audit rows are lost permanently — and compliance audits are exactly when you need them.
**Fix direction:** outbox pattern (transactional insert with the business write) or a durable queue; at minimum, buffer-and-retry with a dead-letter file.
**Fixed (2026-09-17):** three-layer durability in `src/lib/audit.ts` — inline insert → bounded retry with backoff (`AUDIT_RETRY_ATTEMPTS`) → JSONL dead-letter file under `WAMIRO_DATA_DIR/audit-dead-letter/` (serialized writes, 64 MB roll guard). Jobs worker replays it every 15 min (`audit_dlq_replay`), inserting in original order and truncating atomically only after every line succeeds. Tested: `src/lib/audit-dlq.test.ts` (6 cases). Signature unchanged for ~200 call sites — still never throws.

### 🔴 G-02 · No audit-log retention / archival policy — ✅ FIXED
`audit_logs` grows unbounded (`bigserial`, jsonb old/new values). Only `rate_limit_hits` gets swept. Long tenants will see slower `/admin/audit` queries (offset pagination) and storage bloat.
**Fix direction:** partition by month + retention env (`AUDIT_RETENTION_DAYS`), or archive-to-object-storage job. Already scaffolding exists in `scripts/worker-jobs.mts`.
**Fixed (2026-09-17):** archive-then-delete in `src/modules/retention/service.ts` (`archiveAndDeleteAuditLogs`) riding the existing 12h `retention_sweep` job — no new scheduler. `AUDIT_RETENTION_DAYS` (unset/0 = disabled, 30-day floor) gates it; rows past cutoff are written to `WAMIRO_DATA_DIR/audit-archive/audit-YYYY-MM.jsonl` (month partitions, `archivedAt` stamps) BEFORE any delete; archive failure aborts the sweep with nothing deleted. Bounded 5000 rows/run, oldest first. Tested: `src/modules/retention/audit-retention.test.ts` (5 cases: ordering, fail-safe, disable, floor, partitioning).

### 🔴 G-03 · Offset pagination on the audit trail is O(n) per page — ✅ FIXED
`listAuditLogs` now supports `offset`, but Postgres offset scans are O(offset+limit) and audit_logs is append-heavy. Deep "Load more" pages (page 50+) will get slow.
**Fix direction:** keyset pagination on `(createdAt, id)` — return a cursor; keep offset only for the first pages. Cheap now, painful later.
**Fixed (2026-09-17):** keyset pagination on `(createdAt, id)` with a total order (id tiebreak) — `listAuditLogs(…, { before })` seeks rows strictly older than the cursor via a Postgres row-constructor comparison (one index-backed seek, no scan). Opaque base64url cursors (`encodeAuditCursor`/`decodeAuditCursor`, garbage = start from top). `/admin/audit` now paginates by cursor: "Load more" carries `before`, "← Previous" pops a stateless 31-deep `stack` param — bidirectional with no session state, and every filter survives navigation. Public API gained `before`/`nextBefore` while `page=` offset keeps working for shallow integrations. Offset remains only as an explicit fallback.

### 🔴 G-04 · Rate limiter is a DB-write per mutating request with no local fallback — ✅ FIXED
`enforceRateLimit` upserted `rate_limit_hits` on **every mutating call** — the org bucket row was a write hotspot.
**Fixed (2026-09-17):** rewritten in `src/lib/ratelimit.ts` — 1s-aggregated batched writes (pure `RateAggregator` buffers per-(scope,key,window) deltas; a background flusher folds them into Postgres at most once per second per key; the first hit of a window still writes synchronously for an authoritative count). Warm-path checks are pure in-memory against cache+buffer; a projected-limit rejection re-checks the DB before 429. If Postgres is down, enforcement falls back to a per-instance local floor instead of failing every mutation. `maybeSweep()` is now a deterministic scheduled cleanup (6h) + flush trigger. Cross-instance tolerance is ≤1s of buffered hits — fine for abuse limiting. Tested: `ratelimit-aggregator.test.ts` (5 cases: batching, re-buffer on flush failure, capacity guard, sync-write handoff, window separation).

### 🔴 G-05 · `loadAuthContext` bypasses RLS tenant scope by design — but nothing documents/monitors it — ✅ FIXED (guard-test variant)
Pages never entered `withTenantScope`; a missed `where` in a page-level query would be a cross-tenant leak with no second wall.
**Fixed (2026-09-17):** investigated the full-wrap option first — it is not viable under RSC streaming (an ALS scope entered in the page loader does not wrap the streamed page body, and pinning a pool connection per render would starve the 10-conn pool). Took the gap doc's explicit alternative: (1) audited every `(app)` page that imports raw `db` (5 exist; all reads verified org-scoped — plus one hardened: `/requests` reviewer-name lookup now also filters `users.organizationId`); (2) added `src/tests/page-db-guard.test.ts` — a CI wall where any page importing `db` must be on a reviewed allowlist with a justification (and allowlist entries must point at real files). The RLS second wall remains active where writes concentrate: the API `route()` wrapper.

---

## 3. High-priority issues

### 🟠 G-05 · `loadAuthContext` bypasses RLS tenant scope by design — but nothing documents/monitors it
`withTenantScope` is applied in `route()` only when the caller is **not** platform.admin. Pages (`requireAuthPage`) never enter `withTenantScope`. That means every RSC read relies purely on the module-layer `organization_id` discipline. It's coherent, but a single missed `where` in a page-level service is a cross-tenant leak with no second wall.
**Fix direction:** wrap page loads in `withTenantScope` too (except platform workspace), or add an eslint rule/test that greps services for `db.select` without `organizationId` equality.

### 🟠 G-06 · Session fixation/regeneration on privilege change — ✅ FIXED
Role changes and override grants did not refresh the target user's session — a demoted admin kept a 14-day session.
**Fixed (2026-09-17):** `bumpUserSessions()` in `src/lib/session.ts` caps every active session of the affected user at 1h (only shortening: sessions already expiring sooner are untouched; failures never break the admin action). Wired into all four privilege-change points: `assignRole`, `removeRole`, `addOverride`, `removeOverride`. `computeEffectiveAccess` still applies grants/denies per request, so access is correct immediately — the bump only bounds how long a *stale/stolen* session can live.

### 🟠 G-07 · Password reset flow doesn't invalidate password-change requests — ✅ FIXED
`resetPassword` (public flow) left pending managed-mode requests open after the user had already self-reset.
**Fixed (2026-09-17):** `resetPassword` in `src/modules/auth/passwords.ts` now marks all of that user's pending `password_change_requests` as `approved` (with `decidedAt` stamp) after the reset completes — the admin queue can no longer list work that already happened.

### 🟠 G-08 · Webhook delivery has no retry/dead-letter and is sequential per event — ✅ FIXED
Failures overwrote `lastStatus` and were gone; fan-out was serial; replay window was unlimited.
**Fixed (2026-09-17):** (1) new `webhook_deliveries` ledger (migration 0067) — one row per delivery with payload, delivery id, attempts, status (`pending|delivered|failed`), `next_attempt_at`; (2) fan-out is now `Promise.allSettled` — a slow endpoint no longer delays siblings; (3) failures are retried by the new `webhook_retry_sweep` job (5 min) with exponential backoff 30s→1h, 6 attempts, then marked `failed` and kept for history (31-day retention tail added to the retention sweep); (4) signed deliveries now carry `x-wamiro-timestamp` with a 5-minute symmetric freshness window (`isSignatureFresh`, timestamp is covered by the HMAC) — receivers get a bounded replay window; (5) `testDelivery` (admin UI) writes the same ledger row shape. Tested: `webhooks/retry.test.ts` (backoff curve + freshness window).

### 🟠 G-09 · Storage usage listing is unbounded for large tenants — ✅ FIXED
`/admin/storage` listed every object — a 500k-object org would time out the page.
**Fixed (2026-09-17):** `usageForOrg` defaults to a 10k-object cap (`USAGE_LIST_CAP`), fetches cap+1 to detect overflow, and returns `truncated: true`; `/admin/storage` renders an explicit "totals are under-counted" warning banner when truncated. The fleet view keeps its own 5k bound.

### 🟠 G-10 · CSV import path (`commitImport`) is sequential & non-transactional — ✅ FIXED
A failure at row 800 left 799 invites committed with no rollback and no report.
**Fixed (2026-09-17):** `commitImport` now runs the entire batch in ONE `db.transaction` — roles resolved once per distinct key, users/roles/memberships/employees/invite-tokens inserted per row, any failure rolls back everything. Manager forward-references (manager later in the same batch) are patched in a second pass inside the same tx. Side effects (invite emails, audits, webhooks, seat sync) fire only AFTER commit, so a rollback can never leave a half-announced state. Added an import-specific rate limit (`IMPORT_MAX_ROWS_PER_HOUR`, 1000/h default) distinct from the per-invite cap.

### 🟠 G-11 · No CSRF token for cookie-auth state changes beyond Origin check — ✅ FIXED
Origin-only checking let a same-site subdomain attacker through (Origin is optional).
**Fixed (2026-09-17):** `route()` now also validates `Sec-Fetch-Site` on every mutation: when the header is present (all modern browsers) it must be `same-origin`, `same-site`, or `none` — cross-site requests are rejected before auth. When absent (non-browser clients, older browsers) the existing Origin-host check still applies. No token plumbing needed; zero impact on legitimate API consumers.

### 🟠 G-12 · `users.email` is globally unique — no multi-tenant identity model — ✅ FIXED (short-term hardening)
Mixed-case emails could fork into two identity rows or fail lookups.
**Fixed (2026-09-17, short-term per the fix direction):** (1) `normalizeEmail()` added in `src/lib/email-domain.ts` as the single documented normalizer (trim + lowercase, whole address) with tests proving mixed-case inputs collide into one identity; (2) all create/lookup paths verified to casefold inline (login, invites ×2, admin invite, SCIM, SSO, org register, teams, automations, mailboxes); (3) migration 0068 folds historic mixed-case `users.email` rows to lowercase (idempotent). The full identity/membership split remains long-term work (G-12 residual) — start with the cross-org invite tests already in `isolation.test.ts`.

---

## 4. Medium issues

### 🟡 G-13 · Payroll `computeRun` N+1 per employee and holds no lock — ✅ FIXED
**Implemented:** `computeRun` takes `SELECT … FOR UPDATE` on the run row (concurrent computes serialize instead of interleaving) and per-employee structure/proration reads are consolidated; delete+insert stays inside the same transaction.
Each payslip runs 3 queries (structure, proration×2 SQL); 500 employees ≈ 1500+ queries per compute click. Two concurrent computes of the same run can interleave (both draft) — transaction wraps only delete+insert.
**Fix direction:** compute payloads in one SQL pass (CTE), and take a `SELECT … FOR UPDATE` on the run row.

### 🟡 G-14 · Ticket SLA sweep notifies per ticket inside a loop → notification storm risk — ✅ FIXED
**Implemented:** `sweepOrgSlaStates` batches breach notifications into one digest per assignee and caps notifications per run — a post-outage mass breach can no longer flood the worker.
`sweepOrgSlaStates` sends one `notify()` per ticket at breach (up to 10k rows/tick). A mass breach (post-outage) floods notifications and the jobs worker.
**Fix direction:** batch notifications (digest per assignee), cap per-run notifications.

### 🟡 G-15 · `listTickets` caps at 100 rows with no pagination — ✅ FIXED
**Implemented:** keyset pagination on `(createdAt, id)` with opaque cursor + `nextBefore`, plus a parallel `count(*)` for the total; both ticket pages destructure the new shape and show honest totals.
Agent queue UI will silently hide older tickets. Filters exist for status/SLA but not for page/cursor.
**Fix direction:** keyset pagination + total count, match the audit page pattern.

### 🟡 G-16 · Mail is silent no-op without SMTP — with no admin-facing signal — ✅ FIXED
**Implemented:** `/admin/users` shows a warning banner when `mailerConfigured()` is false **and** pending invites exist — no silent no-op anymore.
`mailerConfigured()` gates everything; invites then fall back to "copy link" UX that only the inviting admin sees. No "SMTP not configured" warning anywhere in `/admin` or `/settings/organization`.
**Fix direction:** show a dismissible banner in Admin → Users when `mailerConfigured()` is false and pending invites exist.

### 🟡 G-17 · `generate_series` proration assumes Mon–Fri workweek — ✅ FIXED
**Implemented:** `organizations.workweekStart` column (migration **0069**, default Mon) + `timezone` plumbed into the proration CTE; `src/modules/payroll/workweek.ts` centralizes the working-day mask with unit tests.
`prorationFactor` hardcodes `EXTRACT(ISODOW) < 6` and ignores org timezone (server UTC). Middle-East/Sunday-start weeks and `organizations.timezone` are ignored — payroll days will drift.
**Fix direction:** workweek + timezone columns on organizations; plumb into the CTE.

### 🟡 G-18 · Access reviews "keep" only logs — no cadence/reminders — ✅ FIXED
**Implemented:** `gov_obligations.source_key` (migration **0070**) + `ensureAccessReviewObligations()` — an hourly `access_review_cadence` job idempotently creates one quarterly "Quarterly access review" obligation per active tenant; existing governance escalation handles overdue reminders.
`logReviewKeep` writes `ACCESS_REVIEWED` but nothing schedules re-reviews; "Access reviews" page relies on admin remembering to visit. The governance module has obligations with escalation — reuse it.
**Fix direction:** quarterly review obligation auto-created per admin; escalate via governance sweep.

### 🟡 G-19 · Sidebar "Governance" lives under Admin workspace but `/governance` has its own permission (`governance.view`) and is HR-facing — ✅ FIXED
**Implemented:** Governance moved to the Company workspace under "Governance & Compliance". Company has no workspace-level gate, so `governance.view` holders (HR) finally see it; the Admin workspace no longer gates a page its own users can't open.
Grouping GRC under "Admin" hides it from HR admins who hold `governance.view` but not `users.manage` — they'd see an Admin workspace appear with just Governance inside, which is confusing IA.
**Fix direction:** move Governance into Company workspace, or its own GRC workspace.

### 🟡 G-20 · Admin users page loads ALL users with roles (no pagination/search server-side) — ✅ FIXED
**Implemented:** `listUsersBounded()` — server-side ILIKE search (`?q=`) + LIMIT 500 + `count(*)` total; the client debounces the query into the URL, keeps instant local filtering on the hydrated page, and shows a truncation notice. Full listing preserved for access reviews/API.
`listUsersWithRoles` returns every org user × roles to the client; the search/filter is client-side only. At 2–5k users the payload and render cost become real.
**Fix direction:** server-side search params (like audit), keep client filter for instant feedback but hydrate with a bounded page.

### 🟡 G-21 · `getAdminOverview` runs 4+ sequential round-trips on the console home — ✅ FIXED
**Implemented:** all five reads (user/session/role stats, recent audit activity, overrides) run in one `Promise.all` — console-home latency drops from ~5× RTT to 1×.
userStats, sessionStats, roleStats, recentActivity, overrides, plus departments, plus password requests — each await adds latency to the admin landing page.
**Fix direction:** `Promise.all` the independent stats (some already are), or one materialized `admin_overview` rollup refreshed by the jobs worker.

### 🟡 G-22 · Local-disk storage path traversal guard is `startsWith(ROOT)` only — ✅ FIXED
**Implemented:** `resolveLocalKey()` — `resolve` + `path.relative(ROOT, target)` must not be empty/`..`-prefixed/absolute; wired into **all seven** local-backend primitives (save/read/remove/exists/list/removeByPrefix). The old `startsWith(ROOT)` sibling-prefix weakness is gone; 10 new traversal assertions in `storage.test.ts` cover escape keys, sandboxed `..` keys, and soft-primitive no-ops.
`saveObject`/`readObject` build `join(ROOT, key)`; `startsWith` blocks `../` basics, but on Windows `join` normalizes differently and a key like `tenant/x/../../other` could sneak past in edge cases (S3 backend unaffected).
**Fix direction:** normalize then compare path segments, or `path.relative(ROOT, target).startsWith('..')` check; add unit tests (there are some in `lib/storage.test.ts`).

---

## 5. Low / polish

- ✅ **G-23 (FIXED)** · `roles` unique index documented — `src/db/schema.ts` now explains the NULL-distinct contract (platform rows exempt, one role per (org, key) per tenant) and warns against `NULLS NOT DISTINCT`.
- ✅ **G-24 (FIXED)** · `admin-user-actions.tsx` (the destructive buttons the gap flagged in admin-users) uses `ConfirmDialog` + inline error banners instead of `window.confirm/alert`.
- ✅ **G-25 (FIXED)** · duplicate `PageHeader` removed from `components/ui.tsx` after verifying zero imports (all 55+ files use `components/page-header.tsx`); canonical implementation unchanged.
- ✅ **G-26 (FIXED)** · `listDepartments` moved out of JSX inline-await in `admin/page.tsx` into the data-loading phase.
- ✅ **G-27 (FIXED)** · audit CSV export labeled: sr-only "(exports the rows currently shown on this page)" on the button + Filters section subtitle states it.
- ✅ **G-28 (FIXED)** · `AUDIT_ACTION_GROUPS` in `lib/admin-security.ts` is the single source; audit-page chips are `map()`ped from it — lists can no longer drift.
- ✅ **G-29 (FIXED)** · `docs/architecture.md` created: account hierarchy, access computation, write/read data flows, audit & retention pipeline, jobs, storage, time/payroll.
- ✅ **G-30 (FIXED)** · `lib/date-bounds.ts` — strict `YYYY-MM-DD` parsing (rejects 2026-02-31), 2000-01-01 floor, ~2y future cap; wired into `logTime` and workplace `book`; 5 unit tests.

---

## 6. Strengths worth keeping (do not regress)

- ✅ **Pure IAM engine** (`computeEffectiveAccess`) — unit-testable, deny-wins precedence, unknown-permission hardening.
- ✅ **RLS defense-in-depth** — `withTenantScope` + GUC + connection-destroy-on-error is a genuinely strong pattern.
- ✅ **Every mutation audited** with old/new values, IP, requestId; audit page has filters + CSV.
- ✅ **Seat-aware billing** with hard/soft overage, dunning stages, trial sweep, Paddle adapter isolation.
- ✅ **Password handling** — scrypt w/ NFKC normalize, SHA-256-hashed tokens, one-time invite/reset tokens, lockout + admin notify.
- ✅ **Rate limiting** is DB-backed (multi-instance safe) with per-org entitlement overrides.
- ✅ **Impersonation is consent-gated** (tenant admin must grant) with a ledger + banner.
- ✅ **Honest empty states** everywhere; no fake data in production paths.
- ✅ **Admin console IA** — single source of truth (`admin-nav.ts`) shared by sidebar + tabs; quick-filter chips + keyset-ready pagination (this branch).

---

## 7. Suggested fix order (impact ÷ effort)

| Order | Item | Why first |
|---|---|---|
| 1 | G-01 audit outbox | Compliance; small change in `audit()` |
| 2 | G-05 page-load RLS scope + lint guard | Closes the biggest latent leak class |
| 3 | G-03 keyset pagination | Do before audit_logs grows |
| 4 | G-06 session bump on privilege change | 30-min fix, closes a real attack window |
| 5 | G-09 storage usage cap | Prevents a production timeout |
| 6 | G-08 webhook retries | Enterprise trust feature parity |
| 7 | G-12 identity model review | Big migration; start with tests now |
| 8 | G-04 rate-limit hotspot | At ~50+ req/s per org |
| 9 | G-02 retention partitions | Before the table is huge |

---

*File created read-only (documentation only — no code changed in this investigation beyond the three admin UX items delivered earlier in this session: audit quick-filter chips, Load-more pagination, and pending password-request attention item).*
