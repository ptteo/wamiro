# Wamiro Admin Panel — Tenant & Subscription Management (End-to-End Plan)

**Status:** Proposal → build. Complements `implementation-plan-enterprise.md` (this is its "platform team" track).
**Question this panel answers in one screen:** *Who are my customers, how much do they use Wamiro, are they healthy, have they paid, what should I do next?*

---

## 1. Research — how leading platforms manage tenants internally

| Platform | What they give their internal team | What Wamiro borrows |
| --- | --- | --- |
| **Stripe Billing** | Invoices + credit/debit notes, dunning flows with email alerts, revenue recovery (smart retries, failure analytics), customer portal, usage-based billing with metering + rate cards, MRR/churn reporting with "<1h freshness", custom SQL reporting | Billing ops spine: invoice ledger, dunning history, failure states, MRR reporting. We mirror what the MoR (Paddle) knows + manual overrides — we don't rebuild payments. |
| **ChartMogul** | MRR/ARR, churn by reason/plan, LTV/ARPA, benchmarks, 25+ billing integrations, customer merge/enrichment | Revenue analytics vocabulary: MRR movement buckets (new / expansion / contraction / churn), cohort retention, ARPA, trial→paid funnel. |
| **Vitally (CS platform)** | Dynamic health scores per lifecycle stage/segment, playbooks (auto CSM assignment, tasks), NPS, surveys, dashboards, AI summaries | Health score engine + playbook/automation engine (trial ending → task+email), NPS capture, tenant 360 as "unified customer data". |
| **ChurnZero** | Health scoring combining usage+engagement+sentiment+outcomes, 360° account/contact view, plays, renewal forecasting, churn-risk prediction | Renewal forecast, at-risk revenue metric, risk list with "next-step guidance" copy. |
| **Industry-wide admin consoles** (Supabase/Vercel/WorkOS-style) | Feature flags/entitlements per tenant, module kill-switches, usage meters on tenant cards, audit of admin actions, data export/delete tools, team roles for the vendor's own staff | Entitlements editor, per-tenant overrides, our audit trail (exists) + platform-team roles. |

**Deliberately NOT built (over-engineering guard):** no event streaming / 100k-EPS metering (Metronome class), no data-warehouse sync, no billing engine from scratch (Paddle is merchant-of-record). At <100 companies, **nightly SQL rollups over data we already write** (audit log, domain events, sessions) deliver 95% of the insight at $0.

---

## 2. Panel information architecture (after this plan)

```
/platform
 ├─ Overview (exists)          fleet stats + at-risk + trial pipeline
 ├─ Tenants (exists)           registry + subscription ops
 ├─ Tenant 360 (NEW)           one page per customer: everything
 ├─ Usage (NEW)                metering: activity, adoption, storage, seats
 ├─ Revenue (NEW)              MRR movements, invoices, dunning, funnel
 ├─ Health & Alerts (NEW)      scores, alert inbox, playbook runs
 ├─ Comms (exists: broadcast)  + email log, NPS results
 ├─ Support (exists)           queue + per-tenant support metrics
 ├─ Jobs (Phase 5 enterprise)  worker freshness/failures
 └─ Controls (NEW)             entitlements, kill-switches, team roles
```

---

## 3. Data model (all additive, ADR-004; migrations 0054+)

### 3.1 Metering — `tenant_usage_daily` (Phase A)

Nightly + on-read rollup, one row per org per day. **No new event pipeline** — computed from tables we already write:

```sql
CREATE TABLE IF NOT EXISTS tenant_usage_daily (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  day date NOT NULL,
  active_users int NOT NULL DEFAULT 0,          -- users.last_active_at that day
  logins int NOT NULL DEFAULT 0,                -- audit_logs action='USER_LOGIN'
  actions int NOT NULL DEFAULT 0,               -- audit_logs rows that day
  by_module jsonb NOT NULL DEFAULT '{}',        -- {"tickets":12,"leave":5,...} from audit action prefixes
  tickets_created int NOT NULL DEFAULT 0,
  leave_requests int NOT NULL DEFAULT 0,
  documents_stored int NOT NULL DEFAULT 0,      -- cumulative
  storage_bytes bigint NOT NULL DEFAULT 0,      -- cumulative (file sizes from documents/ticket_attachments/employee_documents)
  api_calls int NOT NULL DEFAULT 0,             -- from structured request logs (Phase 5: also table if needed)
  seats_active int NOT NULL DEFAULT 0,          -- memberships active
  PRIMARY KEY (organization_id, day)
);
CREATE INDEX IF NOT EXISTS tenant_usage_daily_day_idx ON tenant_usage_daily(day);
```

Backfill: one migration-time script iterates history from `audit_logs` (it has org + created_at + action already). Ongoing: jobs worker `usage_rollup` (hourly) upserts yesterday+today.

### 3.2 Health — `tenant_health_scores` (Phase D)

```sql
CREATE TABLE IF NOT EXISTS tenant_health_scores (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  day date NOT NULL,
  score int NOT NULL,            -- 0..100
  grade text NOT NULL,           -- green | yellow | red
  factors jsonb NOT NULL,        -- {"adoption":22,"recency":20,"breadth":18,"support":20,"billing":20}
  PRIMARY KEY (organization_id, day)
);
```

Explainable score (weights configurable via env): **recency** (days since last activity) 20 · **adoption** (WAU/seats) 25 · **breadth** (distinct modules used in 30d, target ≥4) 20 · **support** (open escalations, breached SLAs, CSAT) 20 · **billing** (past_due/cancelled = 0, trial halved) 15. Computed daily by the jobs worker; history enables trend arrows (↑↓ vs 7d ago) — the Vitally/ChurnZero pattern, but explainable, not black-box AI.

### 3.3 Billing ops — `billing_invoices`, `billing_payments` (Phase B)

```sql
CREATE TABLE IF NOT EXISTS billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  number text NOT NULL,                 -- INV-2026-0001
  period_start date, period_end date,
  amount_cents bigint NOT NULL, currency char(3) NOT NULL DEFAULT 'USD',
  status text NOT NULL,                 -- draft | open | paid | void | uncollectible
  source text NOT NULL DEFAULT 'manual',-- manual | paddle | stripe
  provider_invoice_id text,             -- webhook mirror
  issued_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz, paid_at timestamptz,
  lines jsonb NOT NULL DEFAULT '[]',    -- [{desc, qty, unit_cents, total_cents}]
  pdf_key text,                         -- storage key when generated
  created_by uuid REFERENCES users(id)
);
-- billing_payments: id, invoice_id FK, amount_cents, method, received_at, provider_ref, status (succeeded|failed|refunded)
-- billing_credits: id, organization_id, amount_cents, reason, expires_at, created_by (manual goodwill credits, applied by operator)
```

With Paddle as MoR, webhooks mirror invoices here; operators can also raise **manual invoices** (enterprise deals, comp months). Amounts live in OUR ledger so revenue reporting never needs the provider API to answer "who paid".

### 3.4 Entitlements & controls — `org_entitlements` (Phase F)

```sql
CREATE TABLE IF NOT EXISTS org_entitlements (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key text NOT NULL,            -- 'module.tickets' | 'cap.seats' | 'flag.early_access' | 'limit.api_per_min'
  value text NOT NULL,          -- 'off' | 'on' | number
  updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, key)
);
```

Reads at login/session load alongside `organizations.modules` → per-tenant module kill-switch, seat caps (supersedes plan default), beta-flag early access. UI in Controls tab with search + audit.

### 3.5 Alerts & playbooks — `alert_rules`, `alert_instances` (Phase D)

```sql
CREATE TABLE IF NOT EXISTS alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, enabled boolean NOT NULL DEFAULT true,
  kind text NOT NULL,           -- dormant | trial_ending | failed_payment | sla_breach | usage_spike | churn_risk
  threshold jsonb NOT NULL,     -- {"days":14} | {"daysLeft":7} | {"grade":"red"}
  action text NOT NULL,         -- notify_operator | email_tenant | create_task
  created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS alert_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fired_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL DEFAULT 'open',   -- open | acknowledged | resolved
  payload jsonb, resolved_by uuid REFERENCES users(id), resolved_at timestamptz
);
```

Seeded rules = the playbooks CS platforms ship: dormant >14d → alert + operator task; trial ends ≤7d → alert; invoice past due → alert + tenant email; health grade → red alert; SLA breach on escalated ticket → alert. Jobs worker evaluates hourly (notify-once per rule+org per 7 days — the pattern from ticket SLA stamps).

### 3.6 CRM-lite — `tenant_notes`, `tenant_touchpoints` (Phase C)

```sql
-- notes: id, organization_id, body, pinned, created_by, created_at
-- touchpoints: id, organization_id, kind (call|email|meeting|demo), summary, occurred_at, created_by
```

Every operator interaction with a customer, logged next to usage/billing/support — the "360" glue. Broadcasts + emails sent (from `sendEmail` + notifications) feed `touchpoints` automatically (kind=email, source=system).

### 3.7 Platform team governance (Phase F)

`platform_operators` (user_id PK, role: viewer | operator | admin, created_at): viewer = read-only console, operator = can act (plans, impersonation, broadcasts), admin = can manage operators + entitlements + delete tenants. Enforced in `requirePlatform(ctx)` → `requirePlatform(ctx, "operator")`. Audit trail already covers actions; add viewer-role to reduce blast radius.

---

## 4. Screens (what the operator sees)

### 4.1 Tenant 360 (`/platform/tenants/[id]`) — the centerpiece

```
┌ Bruito Ltd · Growth · active ▏health 82 (green ↑) ▏10/50 seats ▏MRR $40
│ tabs: Overview · Usage · Billing · Support · Notes & Timeline · Access
│
│ Overview: created, onboarding state, owner (admin user), domain, region
│   sparkline: active users 30d · storage gauge · open support tickets
│   quick actions: [Open window (impersonate)] [Adjust plan] [Add credit]
│                 [Email tenant] [Suspend] [More ▾]
│ Usage:     per-module bars 30d (tickets 41 · leave 12 · payroll 3 · …)
│            DAU/WAU/MAU · seats utilization trend · last 10 logins
│ Billing:   subscription state, next invoice, invoice table (status chips,
│            dunning history), credits balance, [Manual invoice] [Record payment]
│ Support:   open escalated tickets (from Phase E queue), FRT, CSAT avg
│ Timeline:  merged chronological feed — notes · touchpoints · plan changes
│            · impersonation windows · broadcasts received · alerts
│ Access:    admins list, MFA status, SSO config (exists), consent grants
└
```

### 4.2 Revenue (`/platform/revenue`)

KPI cards: **MRR, ARPA, active trials, trial→paid (30d), churned MRR (30d), at-risk MRR (red-health × MRR)**. MRR movement waterfall (new/expansion/contraction/churn — computed from plan+seat snapshots in `tenant_usage_daily.seats_active` + billing rows). Invoice aging table (open/overdue with days). Renewal forecast (trials + contracts ending ≤30d). CSV export on every table.

### 4.3 Health & Alerts (`/platform/health`)

Red/yellow/green tenant list sorted by score, factor breakdown on hover ("billing 0/15 — cancelled"), trend vs 7d. Alert inbox (open instances → acknowledge/resolve → written to timeline). Rule editor (enable/disable, threshold, action).

### 4.4 Usage (`/platform/usage`)

Fleet table sortable by WAU, actions, storage, seats-utilization; module-adoption heatmap (rows=tenants, cols=modules, cell=users active in module/30d); "activated" definition wired to the Phase A KPI (setup complete + 3+ active members 7d).

---

## 5. Implementation phases (each gated: lint/typecheck/unit/isolation/build/smoke)

### Phase A — Usage metering & rollup engine (~3 days) · migration-0054

- `tenant_usage_daily` table + rollup job (`usage_rollup`, hourly) in `src/modules/platform/jobs.ts`: per org — users active yesterday (from `users.last_active_at`), logins/actions/by_module (audit_logs action→module prefix map), storage bytes (sum file columns), seats.
- Historical backfill script (`scripts/backfill-usage.mjs`, chunked, idempotent).
- Jobs-tab + health wiring: new job appears in ledger automatically.
- **Gate:** backfill over live DB matches spot-checks; rollup job idempotent (re-run = same numbers).

### Phase B — Billing ops (~4 days) · migration-0055

- `billing_invoices/payments/credits` + manual invoice form (line items, auto-numbering `INV-YYYY-####`, due date, PDF via print-CSS → storage key).
- Record-payment flow; overdue detection job (`billing_dunning`, daily) → dunning email day 3/7/14 (Brevo) + alert instance; credits applied to next manual invoice.
- Revenue tab v1: KPI cards + invoice aging + MRR (plan price × seats from usage rollup).
- Paddle webhook mirror (Phase 3 of enterprise plan) writes provider invoices into the same ledger — one code path for manual and provider billing.
- **Gate:** invoice → payment → aging → dunning email E2E; webhook replay idempotent.

### Phase C — Tenant 360 + CRM-lite (~4 days) · migration-0056

- `/platform/tenants/[id]` page + `tenant_notes`/`tenant_touchpoints`; timeline merges: notes, touchpoints, plan/billing audit rows (exist), impersonation ledger (exists), broadcasts received, alerts, status changes.
- Quick actions reuse existing services (plan ops, impersonation start, broadcast-to-one, suspend).
- **Gate:** every mutating action on the page appears in tenant timeline + platform audit.

### Phase D — Health scores, alerts & playbooks (~4 days) · migration-0057

- `tenant_health_scores` + daily `health_rollup` job; factor breakdown persisted.
- `alert_rules/instances` + evaluator job (hourly) with the five seeded playbooks + notify-once window.
- Health & Alerts tab: graded list, factor tooltips, alert inbox with acknowledge/resolve (audit each).
- "At-risk MRR" KPI = Σ MRR of red/yellow tenants.
- **Gate:** manufacturing a dormant trial tenant → alert fires once, acknowledges, doesn't refire inside window.

### Phase E — Revenue analytics (~3 days)

- MRR movement buckets (snapshot diffing from daily seats×price), cohort retention grid (signup-month × months-since, % still active), trial→paid funnel, ARPA/LTV-lite (churned MRR ÷ churned count).
- Churn-reason capture on cancel (existing cancel flow + one required select: too-expensive / missing-feature / switching / other) → feeds ChurnZero-style "churn by reason".
- **Gate:** numbers reconcile with the invoice ledger for a seeded synthetic year.

### Phase F — Controls & team governance (~3 days) · migration-0058

- `org_entitlements` + Controls tab (search, set on/off/numeric, audit); session load reads entitlements → module kill-switch + caps honored app-wide.
- `platform_operators` roles (viewer/operator/admin) enforced in `requirePlatform`.
- Ops checklist export (SOC 2 style): one-click zip of audit trail + access reviews + job ledger for a date range.
- **Gate:** viewer role cannot mutate anything (403s verified in isolation suite); kill-switch hides module for that tenant only.

---

## 6. KPIs the panel owns (definitions fixed here)

| KPI | Definition (source) |
| --- | --- |
| MRR | Σ active paid orgs: plan price × seats (billing ledger) |
| Trial→paid | trials converted ÷ trials ended (30d rolling) |
| Churn (logo/MRR) | cancelled ÷ active at period start, both counts |
| NRR proxy | (Σ MRR today of cohort active 90d ago) ÷ (same cohort MRR 90d ago) |
| Activation | setup-complete orgs with ≥3 active members in 7d (Phase A definition) |
| WAU/seats | usage rollup ÷ seats_active |
| Time-in-product | *proxy*: daily active users + actions/day (true duration tracking needs client pings — explicitly out of scope v1; revisit only if a customer asks) |
| At-risk MRR | Σ MRR of yellow/red health tenants |
| Support health | open escalations, median FRT, CSAT avg (platform tickets) |

---

## 7. What already exists (don't rebuild)

Tenant registry + plan/trial/cancel ops · fleet stats · risk board (dormancy/setup/trials) · audited consent-gated impersonation · broadcast · support queue with escalation SLAs · jobs worker + ledger · audit trail · structured request logs · health endpoint · backup/restore drills · billing plan columns + seat enforcement.

## 8. Sequencing & cost

A → B → C are the spine (metering → money → 360). D/E unlock the CS/revenue story. F closes governance. All self-built on existing tables + jobs worker; **$0 new monthly cost** (Paddle fee remains revenue-linked only). Estimated total: ~3 weeks of focused work for one engineer.

## 9. Edge cases designed-in

Webhook replay/race with manual edits (ledger last-writer-wins + source column) · tenant deleted → usage/health rows cascade, invoices kept (ON DELETE SET NULL on org FK where history must survive — invoices keep a denormalized org name) · clock/timezone (all day-buckets in org timezone? v1: UTC, documented) · rollup failure (ledger shows failure; next tick retries; health flags stale) · impersonation during billing ops (allowed, audited) · credit larger than invoice (carries balance forward) · operator offboarded (their notes/audit persist, `created_by` SET NULL).
