# Wamiro Admin Panel — Tenant & Subscription Management (End-to-End Plan)

**Status:** Active plan (amended v2). The provider side of billing ops is **shipped** (Paddle webhook + invoice mirror + dunning — migrations 0059, `src/modules/billing/{adapter,webhook,dunning,status}.ts`); everything else below is open.
**Purpose:** the internal console for the **Wamiro platform team** to operate subscriber companies — usage, health, billing, support, comms, controls — in one place.
**Core data rule:** panel-owned data lives in a **dedicated Postgres schema (`platform`), separate from all tenant/company tables** (§2). The panel never writes into tenant tables, and tenant deletion never destroys platform history.
**Cost:** $0/month new services. All self-built on the existing jobs worker + free tiers.

---

## 0. Amendment log (v2)

| # | Change | Why |
| --- | --- | --- |
| 1 | All panel tables moved to a **`platform` Postgres schema** with a strict ownership table (§2) | Your requirement: admin-panel data stored separately from company data |
| 2 | **Billing ledger converted to soft references** (+ `org_name` snapshot): resolves the §3.3-vs-§9 contradiction; revenue history survives tenant deletion | Audit/revenue reporting must outlive churned customers |
| 3 | **Manual-invoice schema amendment** for the shipped `billing_invoices` (which is currently a pure Paddle mirror: `provider_invoice_id NOT NULL`, no lines/number/due date) | Plan's manual-invoice path was impossible against the shipped table |
| 4 | `api_calls` column replaced by **`mutations`** sourced from `rate_limit_hits` | Request logs go to stdout only — the old column had no data source |
| 5 | **Alert dedupe** unique index `(rule_id, organization_id, window_start)` | Racing evaluator could double-fire |
| 6 | **Entitlements caching strategy** specified (60 s in-process TTL) | Per-request entitlement queries would sit on the hot path |
| 7 | **MRR precedence** stated (invoice ledger = collected truth; seats × price = forward-looking only) + refunds/voids bucketed | Two sources previously disagreed silently |
| 8 | Retention clauses for ledger tables (3 years) | Prevents the next unbounded table |
| 9 | Phases re-scoped to what remains; provider-side billing marked shipped; effort re-estimated (~2 weeks) | Concurrent enterprise work already landed (migrations 0054–0060) |
| 10 | Added **§10 "Beyond the phases"** — 14 decide-then-slot improvement suggestions + deferred list, each mapped to the phase where it lands | Operator-requested enhancements kept out of the critical path but on record |

---

## 1. Research — how leading platforms manage tenants internally

| Platform | What they give their internal team | What Wamiro borrows |
| --- | --- | --- |
| **Stripe Billing** | Invoices + credit/debit notes, dunning flows with email alerts, revenue recovery analytics, customer portal, usage-based metering, MRR/churn reporting (<1 h freshness) | Billing ops spine: invoice ledger, dunning history, failure states, MRR reporting — mirrored from the MoR, not rebuilt |
| **ChartMogul** | MRR/ARR, churn by reason/plan, LTV/ARPA, benchmarks | Revenue vocabulary: MRR movement buckets (new/expansion/contraction/churn), cohort retention, trial→paid funnel |
| **Vitally** | Dynamic health scores per lifecycle stage, playbooks (auto tasks), NPS, dashboards | Health score engine + playbook/automation engine, NPS capture, "unified customer data" 360 |
| **ChurnZero** | Health scoring (usage+engagement+sentiment+outcomes), 360° account view, plays, renewal forecasting, churn-risk prediction | Renewal forecast, at-risk revenue metric, risk list with next-step guidance |
| **Modern infra consoles** (Supabase/Vercel/WorkOS class) | Per-tenant feature flags/entitlements, module kill-switches, usage meters on tenant cards, admin-action audit, export/delete tooling, vendor-staff roles | Entitlements editor, per-tenant overrides, audit trail (exists), platform-team roles |

**Deliberately NOT built:** event streaming / 100k-EPS metering, data-warehouse sync, a payments engine from scratch (Paddle is merchant-of-record). At <100 companies, **nightly SQL rollups over data we already write** deliver 95% of the insight at $0.

---

## 2. Data separation — the `platform` schema (core rule)

### 2.1 Ownership model

| Data | Lives in | Why |
| --- | --- | --- |
| **Tenant company data** (people, tickets, payroll, docs…) | `public` schema, row-keyed by `organization_id` | unchanged |
| **Platform-panel data** (usage rollups, health scores, invoices/payments/credits, alerts, notes, touchpoints, entitlements, operator roles) | **`platform` schema** (`platform.tenant_usage_daily`, …) | your requirement: admin-panel data is Wamiro's own, physically namespaced apart from customer data |
| **Platform-team audit** | `public.audit_logs` with `organization_id = NULL` (existing convention) | platform ops already never write tenant rows; keep one audit store |

One database, one connection pool, one backup/restore path — the restore drill covers both schemas automatically. The separation is *logical isolation with physical simplicity*: no cross-database queries, no second migration runner (the raw runner applies SQL regardless of schema; scripts begin with `CREATE SCHEMA IF NOT EXISTS platform;`).

### 2.2 Reference policy (how platform rows point at tenants)

Three classes, applied per table:

| Class | Reference to `organizations.id` | Survives tenant deletion? | Used by |
| --- | --- | --- | --- |
| **Historical** | soft: `org_id uuid` (no FK) + `org_name text` + `org_slug text` snapshots | ✅ yes — churn/revenue history must outlive deletion | `billing_invoices`, `billing_payments`, `billing_credits`, `tenant_usage_daily`, `tenant_health_scores` |
| **Operational** | hard FK `ON DELETE CASCADE` | ❌ dies with the tenant | `org_entitlements`, `alert_instances` (open alerts are meaningless for a deleted tenant), `tenant_notes`/`tenant_touchpoints` (they belong to the relationship), `impersonation_sessions` (exists) |
| **Config** | hard FK CASCADE + `updated_by` | ❌ dies with the tenant | `alert_rules` (org-scoped rules), platform roles reference `users` instead |

Rules of the road:
- The panel **never writes to tenant tables** (except via existing audited tenant services during impersonation, which is already consent-gated + ledgered).
- Tenant-facing surfaces never read the `platform` schema — customers can never see admin notes, scores, or revenue data.
- Deletion flow (GDPR, enterprise plan Phase 4) deletes operational rows via CASCADE and leaves historical rows with snapshots — churn cohorts and MRR history stay computable forever.

### 2.3 Shipped-schema amendment (required follow-up)

The already-shipped `billing_invoices`/`billing_events` (migration-0059, `public` schema, hard CASCADE FK, `provider_invoice_id NOT NULL`) must be brought in line: new migration **moves them to `platform` schema as Historical class, makes `provider_invoice_id` nullable, and adds the manual-invoice columns** (§3.3). Until then, Revenue reporting for deleted tenants is lossy — this migration is phase B-fix, first in the build order.

---

## 3. Data model (all additive, ADR-004; migrations 0061+)

### 3.1 Metering — `platform.tenant_usage_daily` (Phase A)

Nightly + on-read rollup, one row per org per day. **No new event pipeline** — computed from tables we already write:

```sql
CREATE SCHEMA IF NOT EXISTS platform;
CREATE TABLE IF NOT EXISTS platform.tenant_usage_daily (
  org_id uuid NOT NULL,
  org_name text NOT NULL,
  org_slug text NOT NULL,
  day date NOT NULL,
  active_users int NOT NULL DEFAULT 0,     -- users.last_active_at that day
  logins int NOT NULL DEFAULT 0,           -- audit_logs action='USER_LOGIN'
  actions int NOT NULL DEFAULT 0,          -- audit_logs rows that day
  by_module jsonb NOT NULL DEFAULT '{}',   -- {"tickets":12,"leave":5} from audit action prefixes
  tickets_created int NOT NULL DEFAULT 0,
  leave_requests int NOT NULL DEFAULT 0,
  documents_stored int NOT NULL DEFAULT 0, -- cumulative
  storage_bytes bigint NOT NULL DEFAULT 0, -- cumulative
  mutations int NOT NULL DEFAULT 0,        -- Phase F: Σ rate_limit_hits counts (reads uncounted by design)
  seats_active int NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, day)
);
CREATE INDEX IF NOT EXISTS tenant_usage_daily_day_idx ON platform.tenant_usage_daily(day);
-- retention: DELETE WHERE day < now() - interval '3 years'
```

Backfill: `scripts/backfill-usage.mjs` (chunked, idempotent) over `audit_logs` history. Ongoing: jobs worker `usage_rollup` (hourly) upserts yesterday+today. Soft references + snapshots mean churned-tenant history remains queryable.

### 3.2 Health — `platform.tenant_health_scores` (Phase D)

```sql
CREATE TABLE IF NOT EXISTS platform.tenant_health_scores (
  org_id uuid NOT NULL,
  org_name text NOT NULL,
  day date NOT NULL,
  score int NOT NULL,            -- 0..100
  grade text NOT NULL,           -- green | yellow | red
  factors jsonb NOT NULL,        -- {"recency":20,"adoption":18,"breadth":15,"support":20,"billing":12}
  PRIMARY KEY (org_id, day)
);
```

Explainable score (weights env-tunable): **recency** (days since last activity) 20 · **adoption** (WAU ÷ seats) 25 · **breadth** (distinct modules used in 30 d, target ≥4) 20 · **support** (open escalations, breached SLAs, CSAT) 20 · **billing** (cancelled=0, past_due halved, trial halved) 15. Computed daily by the jobs worker; history powers trend arrows (↑↓ vs 7 d ago).

### 3.3 Billing ledger — `platform.billing_invoices` / `_payments` / `_credits` (Phase B — schema amendment + UI)

```sql
CREATE TABLE IF NOT EXISTS platform.billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,                          -- soft ref (NULL after tenant deletion)
  org_name text NOT NULL,
  org_slug text NOT NULL,
  number text NOT NULL UNIQUE,          -- INV-2026-0001
  period_start date, period_end date,
  amount_cents bigint NOT NULL,
  currency char(3) NOT NULL DEFAULT 'USD',
  status text NOT NULL,                 -- draft | open | paid | void | uncollectible
  source text NOT NULL DEFAULT 'manual',-- manual | paddle
  provider_invoice_id text,             -- nullable: manual invoices have none
  issued_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  paid_at timestamptz,
  lines jsonb NOT NULL DEFAULT '[]',    -- [{desc, qty, unit_cents, total_cents}]
  pdf_key text,
  created_by uuid
);
-- platform.billing_payments: id, invoice_id, amount_cents, method, received_at, provider_ref, status (succeeded|failed|refunded)
-- platform.billing_credits: id, org_id (soft), amount_cents, reason, expires_at, created_by
```

Phase B-fix migration: reshape the shipped `public.billing_invoices` into this shape (or migrate rows into it), keeping the Paddle webhook's `applyPaddleEvent` writing to the same ledger. Manual invoices (enterprise deals, comp months) become first-class; PDFs via print-CSS → storage key. Amounts live in **our** ledger — "who paid" never needs a provider API call.

### 3.4 Entitlements & controls — `platform.org_entitlements` (Phase F)

```sql
CREATE TABLE IF NOT EXISTS platform.org_entitlements (
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key text NOT NULL,             -- 'module.tickets' | 'cap.seats' | 'flag.early_access' | 'limit.api_per_min'
  value text NOT NULL,           -- 'off' | 'on' | number
  updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, key)
);
```

**Hot-path strategy (fixed):** values are cached in-process per org with a **60 s TTL**; the write path bumps the cache version. Session load reads the cache — zero added queries in steady state; a kill-switch takes effect within ≤60 s, which is the documented contract.

### 3.5 Alerts & playbooks — `platform.alert_rules` / `_instances` (Phase D)

```sql
CREATE TABLE IF NOT EXISTS platform.alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, enabled boolean NOT NULL DEFAULT true,
  kind text NOT NULL,            -- dormant | trial_ending | failed_payment | sla_breach | churn_risk
  threshold jsonb NOT NULL,      -- {"days":14} | {"daysLeft":7} | {"grade":"red"}
  action text NOT NULL,          -- notify_operator | email_tenant | create_task
  created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS platform.alert_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES platform.alert_rules(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  org_name text NOT NULL,
  window_start date NOT NULL,    -- dedupe bucket (weekly)
  fired_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL DEFAULT 'open',   -- open | acknowledged | resolved
  payload jsonb, resolved_by uuid REFERENCES users(id), resolved_at timestamptz,
  UNIQUE (rule_id, org_id, window_start)   -- dedupe: evaluator can never double-fire
);
```

Seeded playbooks: dormant >14 d → alert + operator task; trial ends ≤7 d → alert; invoice past due → alert + tenant email (Brevo); health grade red → alert; escalated-ticket SLA breach → alert. Evaluated hourly by the jobs worker.

### 3.6 CRM-lite — `platform.tenant_notes` / `_touchpoints` (Phase C)

`notes`: id, org_id (CASCADE), body, pinned, created_by, created_at. `touchpoints`: id, org_id (CASCADE), kind (call|email|meeting|demo), summary, occurred_at, created_by. Broadcasts + transactional emails auto-log as touchpoints (kind=email, source=system).

### 3.7 Platform team governance (Phase F)

`platform.platform_operators` (user_id PK → users, role: **viewer | operator | admin**, created_at). `requirePlatform(ctx)` gains a level argument: viewer = read-only console; operator = can act (plans, impersonation, broadcasts, invoices); admin = manage operators, entitlements, delete tenants. Platform audit already covers actions; viewer-role shrinks blast radius.

---

## 4. Screens (what the operator sees)

### 4.1 Tenant 360 (`/platform/tenants/[id]`) — the centerpiece

```
┌ Bruito Ltd · Growth · active ▏health 82 (green ↑) ▏10/50 seats ▏MRR $40
│ tabs: Overview · Usage · Billing · Support · Notes & Timeline · Access
│ Overview: created, onboarding state, owner (admin user), domain, region
│   sparkline: active users 30d · storage gauge · open support tickets
│   quick actions: [Open window (impersonate)] [Adjust plan] [Add credit]
│                 [Email tenant] [Suspend] [More ▾]
│ Usage:     per-module bars 30d (tickets 41 · leave 12 · payroll 3 · …)
│            DAU/WAU/MAU · seats utilization trend · last 10 logins
│ Billing:   subscription state, next invoice, invoice table (status chips,
│            dunning history), credits balance, [Manual invoice] [Record payment]
│ Support:   open escalated tickets (Phase E queue), FRT, CSAT avg
│ Timeline:  merged feed — notes · touchpoints · plan changes · impersonation
│            windows · broadcasts received · alerts · status changes
│ Access:    admins list, MFA status, SSO config (exists), consent grants
└
```

### 4.2 Revenue (`/platform/revenue`)

KPI cards: **MRR, ARPA, active trials, trial→paid (30 d), churned MRR (30 d), at-risk MRR (red/yellow health × MRR)**. MRR movement waterfall (new/expansion/contraction/churn — from daily seats × price snapshots). Invoice aging table (open/overdue with days). Renewal forecast (trials + contracts ending ≤30 d). CSV export on every table.

### 4.3 Health & Alerts (`/platform/health`)

Red/yellow/green list sorted by score, factor breakdown on hover ("billing 0/15 — cancelled"), trend vs 7 d. Alert inbox (open instances → acknowledge/resolve → written to the tenant timeline). Rule editor (enable/disable, threshold, action).

### 4.4 Usage (`/platform/usage`)

Fleet table sortable by WAU, actions, storage, seat utilization; module-adoption heatmap (rows = tenants, cols = modules, cell = users active in module/30 d); "activated" per the Phase A definition (setup complete + ≥3 active members in 7 d).

---

## 5. Implementation phases (each gated: lint/typecheck/unit/isolation/build/smoke)

| Phase | Scope | Migration | Est. | Status |
| --- | --- | --- | --- | --- |
| **B-fix** | Move/reshape shipped billing tables into `platform` schema (soft refs, snapshots, nullable `provider_invoice_id`, manual-invoice columns); keep webhook code path working | 0061 | 1 d | **done** — migration 0061 (`platform.billing_invoices` unified ledger with soft refs + snapshots, `_events`, `_payments`, `_credits`, `destructive_ops` two-person rule), webhook `applyPaddleEvent` writes the platform ledger, manual invoices + payments + credits service (`src/modules/platform/billing-ledger.ts`) with reason prompts (fold-in #14), `/api/v1/platform/billing-ledger` + `/api/v1/platform/destructive-ops` routes, Billing card on the platform console (`platform-billing-card.tsx`), overpayment carry-forward, isolation-test coverage |
| **A** | Usage metering: `tenant_usage_daily` + `usage_rollup` job + backfill script + fleet Usage tab | 0062 | 3 d | **done** — migration 0062 + `platform.tenant_usage_daily` schema (with fold-in #4 `plan`/`seat_price_cents` snapshot), hourly `usage_rollup` job, `scripts/backfill-usage.mts`, `/api/v1/platform/usage` route, Usage tab on the platform console, 3-year retention prune |
| **C** | Tenant 360 + CRM-lite (notes/touchpoints) + timeline merge | 0063 | 4 d | **done** — migration 0063 (`platform.tenant_notes` / `_touchpoints`, operational class CASCADE), CRM-lite service (`src/modules/platform/crm.ts`: notes CRUD, touchpoints with kind validation, system-touchpoint hooks), Tenant 360 read-models (`src/modules/platform/tenant-360.ts`: Overview/Usage/Billing/Support/Access tabs), `/platform/tenants/[id]` page + tabbed client, merged timeline (notes + touchpoints + platform audit), auto-touchpoint logging on broadcasts (`logBroadcastTouchpoint`) and dunning (`logDunningTouchpoint`), `/api/v1/platform/tenants/[id]{,/notes,/touchpoints}` + `/api/v1/platform/search`, global tenant search ⌘K dialog (fold-in #8), isolation-test coverage |
| **D** | Health scores + alerts/playbooks + Health & Alerts tab | 0064 | 4 d | **done** — migration 0064 (`platform.tenant_health_scores` Historical class + `alert_rules` with 5 seeded playbooks + `alert_instances` with the `(rule_id, org_id, window_start)` UNIQUE dedupe index), health engine (`src/modules/platform/health.ts`: explainable factors recency/adoption/breadth/support/billing with `HEALTH_WEIGHT_*` env tuning, hourly `health_rollup` job + 3-year prune, console board with 7d trend, 90-day history API), alerts module (`src/modules/platform/alerts.ts`: hourly `alert_evaluator` job, per-kind detection SQL, `email_tenant` action, inbox acknowledge/resolve audited to the tenant timeline, rule editor), `/api/v1/platform/{health,alerts,alert-rules}` routes, Health & Alerts card on the console (§4.3), health badge + 90-day score sparkline on Tenant 360 (fold-in #6), isolation-test coverage |
| **E** | Revenue analytics: MRR waterfall, cohorts, trial funnel, churn-by-reason capture | — (reads ledger) | 3 d | **done** — revenue module (`src/modules/platform/revenue.ts`): KPIs with ledger-wins precedence (collected, MRR seats×price, ARPA, trials, trial→paid 30d, churned MRR, at-risk MRR × health grades, NRR proxy), MRR movement waterfall from daily plan+price snapshots (new/expansion/contraction/churn, refunds/voids = contraction per amendment #7), invoice aging with overdue flags, renewal forecast (trials + manual invoices ≤30d), `/platform/revenue` page + `/api/v1/platform/revenue`, CSV export via the audited ops-export endpoint |
| **F** | Entitlements (+60 s cache) + platform-operator roles + Controls tab + ops export | 0065 | 3 d | **done** — migration 0065 (`platform.org_entitlements` PK (org_id,key) CASCADE + `platform.platform_operators` with bootstrap of existing platform.admin holders to 'admin'), entitlements module (`src/modules/platform/entitlements.ts`): 60 s in-process TTL cache per org with write-path bump (§3.4 contract: kill-switch effective ≤60 s, zero steady-state queries), key grammar `module.*`/`flag.*` on-off + `cap.seats`/`limit.api_per_min` numeric, hot-path consumers wired (session-load module kill-switch overlay fail-open, api.ts per-org rate-limit override), leveled gate `requirePlatformLevel(viewer|operator|admin)` retrofitted on billing mutations (operator) + destructive ops (admin request / operator approve) + reads (viewer), operator role management, ops export with mandatory audited reason (fold-in #5, `/api/v1/platform/export/[dataset]`: invoices/usage/health/alerts CSV, formula-injection-safe), Controls tab (`/platform/controls`: entitlement editor + operator roles), saved views (fold-in #9) + panel density toggle (fold-in #11), isolation-test coverage |

Dependencies: B-fix before Revenue analytics (E); A before D (health consumes rollups); F independent. **Not started until your signal.**

---

## 6. KPIs the panel owns (definitions fixed here)

| KPI | Definition (source) |
| --- | --- |
| **Collected revenue** | Σ paid invoice amounts (billing ledger — **authoritative**) |
| **MRR (forward-looking)** | active paid orgs: plan price × seats (usage snapshot — **indicative only**; where the two disagree, the ledger wins) |
| Trial→paid | trials converted ÷ trials ended (30 d rolling) |
| Churn (logo/MRR) | cancelled ÷ active at period start; refunds/voids count as **contraction** in the month they occur, churn only on actual cancellation |
| NRR proxy | (Σ MRR today of cohort active 90 d ago) ÷ (same cohort MRR 90 d ago) |
| Activation | setup-complete orgs with ≥3 active members in 7 d (Phase A definition) |
| WAU/seats | usage rollup ÷ seats_active |
| Time-in-product | *proxy*: DAU + actions/day (true duration needs client pings — out of scope v1, revisit on demand) |
| At-risk MRR | Σ MRR of yellow/red health tenants |
| Support health | open escalations, median FRT, CSAT avg (platform tickets) |

---

## 7. What already exists (don't rebuild)

Provider billing spine: Paddle adapter + signature verification + idempotent webhook (`applyPaddleEvent`, `billingEventExists`) + invoice mirror + `sweepDunning` · tenant registry + plan/trial/cancel ops · fleet stats · risk board · audited consent-gated impersonation · broadcast · support queue with escalation SLAs · jobs worker + `platform_job_runs` ledger · audit trail · structured request logs · health endpoint · backups + restore drills · billing plan columns + seat enforcement.

## 8. Edge cases designed-in

Webhook replay/race with manual edits (ledger last-writer-wins + `source` column) · tenant deleted → operational rows CASCADE, **historical rows keep org snapshots** (revenue/churn analytics survive) · clock/timezone (day buckets UTC — documented) · rollup failure (ledger shows failure; next tick retries; health flags stale) · impersonation during billing ops (allowed, audited) · credit larger than invoice (balance carried forward) · operator offboarded (notes/audit persist, `created_by` SET NULL) · entitlement cache staleness ≤60 s by contract · alert evaluator restarts (weekly window dedupe is idempotent).

## 9. Sequencing & cost

B-fix → A → C → D → E → F. All self-built on existing tables + the jobs worker; **$0 new monthly cost** (Paddle fee remains revenue-linked only). Estimated total: **~2 weeks** of focused work for one engineer. **Build starts only on your signal.**

---

## 10. Beyond the phases — improvement suggestions (decide-then-slot)

Enhancements on top of A–F. None are blockers; each is small, free, and slots into an existing phase or runs as a fast-follow. Status column = where it lands if approved.

### 10.1 Relationship & communication

| # | Suggestion | What it adds | Lands in |
| --- | --- | --- | --- |
| 1 | **Tenant-facing "Your account manager" widget** — optional Settings card showing the assigned operator (name + photo) with a "contact support" link; assignment via a `platform.tenant_assignments` table (org_id → operator_user_id) | Humanizes the vendor relationship, makes CRM touchpoints earn their keep, gives customers a named person instead of a black hole. Read-only for tenants — data stays platform-side; the only deliberate tenant-visible leak from the panel | Fast-follow after C |
| 2 | **Weekly operator digest email** — jobs worker composes a Monday-morning email to the Wamiro team: new alerts, MRR movement, trials ending, at-risk list, stalled setups | Makes the panel *proactive* — you don't have to remember to open it; risks surface in your inbox | After D (needs alerts) |
| 3 | **Contract registry** — `platform.contracts` (org soft-ref, start/end, annual value, PO number, auto_renew, payment_method: card/bank) for enterprise deals bought outside Paddle | Makes the renewal forecast (§4.2) real instead of trial-based only; annual/bank-transfer deals become first-class revenue | Extends B-fix |

### 10.2 Data & analytics precision

| # | Suggestion | What it adds | Lands in |
| --- | --- | --- | --- |
| 4 | **Snapshot-based MRR precision** — add `plan text` + `price_cents` to each `tenant_usage_daily` row | MRR waterfall becomes exact instead of reconstructed from *current* prices; historical price changes stop rewriting the past | Fold into A now (one column, zero cost later) |
| 5 | **Export governance** — the SOC-2-style ops export requires a **reason prompt** (like impersonation), stored in audit with the export's date range and requesting operator | The compliance artifact itself stays compliant; no silent data exfiltration path | Fold into F |
| 6 | **Health-score history chart on Tenant 360** — 90-day score sparkline next to the grade badge | Turns the score from a snapshot into a story ("healthy until the support incidents") | Fold into C |
| 7 | **Usage anomaly flag** — jobs worker compares each org's daily actions against its own 30-day median; >5× spike or >80% drop flags a note in the rollup | Spots both power users (expansion candidates) and dying accounts (churn candidates) without any ML — just median math | Fast-follow after A |

### 10.3 Panel UX for the operator team

| # | Suggestion | What it adds | Lands in |
| --- | --- | --- | --- |
| 8 | **Global tenant search (⌘K)** — search across tenant name, slug, admin email, invoice number from anywhere in the panel | Speed: the 360 page should be ≤2 keystrokes away, always | Fold into C |
| 9 | **Saved views + CSV on every list** — persist filter combos per operator (e.g. "red health, growth plan, dormant") | Weekly rituals become one click; exports already planned per table | Fold into F |
| 10 | **Tenant compare mode** — pick two tenants, side-by-side usage/adoption/billing | Great for QBR prep and for answering "why is Bruito growing but Acme isn't?" | Fast-follow after A |
| 11 | **Panel dark mode + density toggle** — operators live in this console for hours; respect the product's theme system | Operator comfort; consistent with the existing theme toggle | Fold into F |

### 10.4 Governance & safety

| # | Suggestion | What it adds | Lands in |
| --- | --- | --- | --- |
| 12 | **Two-person rule for destructive ops** — tenant deletion and subscription cancellation on annual contracts require a second operator's confirmation (second `approved_by` on the request) | Protects customers from a single-operator mistake; classic enterprise control, trivial to build | Fold into B-fix (cancellation) + Phase 4 GDPR deletion |
| 13 | **Operator activity digest** — monthly audit summary of the Wamiro team's own actions (impersonations, plan changes, credits, exports) sent to the platform admin | Self-audit hygiene; keeps the operator team honest with zero effort (audit data already exists) | Fold into F |
| 14 | **Read-only "reason" prompts on billing mutations** — plan changes, credits, and manual invoices require a short reason, stored on the row | Six months later, "why did Bruito get 50% off?" is answerable from the ledger itself | Fold into B-fix |

### 10.5 Explicitly deferred (revisit triggers)

| Item | Revisit when |
| --- | --- |
| True time-in-product (client activity pings) | A customer or investor asks for engagement minutes |
| Multi-currency revenue reporting | First non-USD invoice exists |
| NPS/survey collection in-panel | 20+ active tenants (statistical meaning) |
| Warehouse sync / BI export | Data team exists or 100+ tenants |
| Per-operator SLA targets on alerts | Platform team >2 people |

