# Wamiro — From First Company to 100 Companies
## Implementation plan for shipping a multi-tenant "Company OS" without failure

**Status:** Roadmap. **Already shipped:** foundations (plans/subscriptions/seats, billing lifecycle, platform console, setup checklist — earlier session), **Phase A activation engine** (invite + welcome email via SMTP, /setup first-run wizard, activity tracking + 7-day activation KPIs on the platform console), **and Phase C enterprise trust pack** (OIDC SSO with JIT provisioning, SCIM 2.0 provisioning, signed webhooks, full tenant data deletion). Phases B/D/E/F/G/H are sequenced below.

---

## 1. What we are shipping

Wamiro is a **multi-tenant company operating system**: every customer is a company that signs up, invites its employees, and uses Wamiro as its internal work portal (people/HR, work, requests, support/ITSM, knowledge, finance, analytics). We replaced Frappe HR + Zammad with native modules; there is **no per-tenant infrastructure** — one instance serves every company with strict row-level tenant isolation (proven by the isolation test suite).

This document is the plan to take that from "works for a few tenants" to **100 paying companies running daily without a catastrophic incident**, covering sales→onboarding→usage→billing→support→retention and the platform operations underneath.

---

## 2. Competitive landscape & requirement calibration

Wamiro sits between three incumbent categories; buyers compare us to all of them:

| Category | Competitors | What they force Wamiro to match |
|---|---|---|
| Workforce comms / employee app | Connecteam, Workvivo, Happeo, Jostle, Staffbase, Oak Engage, Simpplr | Mobile-first employee app, announcements, shifts/scheduling, engagement, easy admin onboarding, per-user pricing with a **free tier ≤10 users** and a **14-day trial**, a guided **setup checklist** |
| HRIS / people | BambooHR, Zoho People, Keka | Employee master, leave, attendance, **payroll**, document vault, **company setup wizard**, employee self-service |
| ITSM / helpdesk | Zendesk, Jira Service Management, Zammad | Ticket workflows, SLA, CSAT, service catalog, **agent tooling**, reports |

**Commercial norms every competitor converges on (our tiering follows this):**
1. Free/starter tier with a small seat cap (Connecteam: free ≤10 users) → convert on team growth.
2. Per-seat-per-month pricing with plan-gated depth (analytics, payroll, SSO = higher tiers).
3. 14-day trial with an **in-app countdown and admin notification before expiry**.
4. Seat enforcement with clear upgrade messaging (never silent lockout).
5. **Onboarding is the #1 churn lever**: guided first-run setup, template content, and fast time-to-first-value.

---

## 3. Readiness audit — what exists today vs. what 100 companies requires

Legend: ✅ present and verified · ⚠️ partial / single point · ❌ missing

### 3.1 Multi-tenancy & isolation (the non-negotiable)
| Requirement | State | Where |
|---|---|---|
| Tenant provisioning (register → org + roles + seed data) | ✅ | `provisionOrganization`, register route, isolation tests |
| Strict tenant isolation on every query | ✅ | `ctx.user.organizationId` everywhere + cross-tenant isolation suite |
| Tenant suspend / reactivate (hard access stop) | ✅ | Platform console `setTenantStatus`; gated at session load + login |
| Identity across companies (join 2nd company) | ✅ | `organizationMemberships`, session tenant switch |
| **Subscription model, plans, seats** | ✅ **new** | `src/modules/billing`, migration-0047 (this session) |
| **Seat cap enforcement at invite** | ✅ **new** | `assertSeatAvailable` in invite path (this session) |
| **Billing lifecycle + trial sweep + cancelled gate** | ✅ **new** | `billing/service.ts`, session gate (this session) |

### 3.2 Company onboarding & activation
| Requirement | State | Where |
|---|---|---|
| **Guided setup checklist** | ✅ **new** | Home page checklist (this session): invite team, logo, first announcement, first KB article |
| First-run content templates (announcements, policies, leave calendar) | ❌ | Plan Phase A |
| Invite emails actually delivered (SMTP outbound) | ⚠️ | Invites return a temp password in the admin UI only; no email channel wired |
| Public marketing/landing + signup funnel | ❌ | Out of repo scope; needs product site |

### 3.3 Billing & revenue (the business)
| Requirement | State | Where |
|---|---|---|
| Self-serve upgrade (card, checkout) | ❌ | Adapter stub exists; Stripe/Paddle wiring is Plan Phase B |
| Invoices / receipts / tax handling | ❌ | Provider (Paddle = merchant of record) decides |
| Trial-end dunning emails | ❌ | Needs mail channel + worker (Phase B) |
| Seat overage handling (block vs. soft-limit vs. auto-bill) | ⚠️ | Hard-block at invite today; soft-grace + auto-bill later |

### 3.4 Enterprise trust features (needed before larger logos)
| Requirement | State | Where |
|---|---|---|
| SSO (OIDC) per company | ✅ | `migration-0049/0050`; `sso_configs` per org; PKCE authorization-code flow; JWKS-verified ID tokens (RS256/ES256/HS256, zero-dep node:crypto); JIT provisioning; password login rejects SSO identities; Admin → Integrations UI |
| SCIM user provisioning | ✅ | SCIM 2.0 Users/Groups CRUD + deactivate-on-delete; bearer token hashed at rest; Admin → Integrations UI (token generate/revoke) |
| Audit export per company | ✅ | Audit log + export datasets |
| Data export / GDPR erasure per company | ✅ | Typed-confirmation full tenant delete (`DELETE /api/v1/org`; transaction: users then org cascade; audit survives) |
| Outgoing webhooks | ✅ | Signed (HMAC-SHA256) org-scoped events (user/leave/request/task/document/announcement); Admin → Integrations UI + test delivery |
| Custom domains / white-label | ❌ | Phase D (nice-to-have) |
| Compliance (SOC 2 / ISO 27001 evidence) | ⚠️ | Audit trail is strong; policy pack needed |

### 3.5 Platform operations (the "without fail" part)
| Requirement | State | Where |
|---|---|---|
| Backups + restore drill | ⚠️ | `scripts/restore-drill.mjs` exists; needs scheduled enforcement |
| Migration safety (idempotent, additive) | ✅ | Migration runner, ADR-004 pattern |
| Health/observability (logs, metrics, uptime) | ❌ | Phase F — the biggest ops gap |
| Background workers (SLA sweep, mail, trial sweep) | ⚠️ | Services exist; no scheduler/queue infra |
| Support inbox for customer companies | ✅ | Native tickets can dogfood as the platform's own helpdesk |
| Single instance vs. regional instances | ⚠️ | Design decision in Phase G (data residency) |

### 3.6 The product surface itself (feature completeness)
- **Native HR + support + work + finance modules**: implemented across Phases 1–7 (see `implementation-plan-native-hr-support.md`).
- Mobile app (Connecteam/Happeo parity) is the largest product gap for the employee-app segment; responsive web exists but a **PWA / mobile shell** is recommended.

---

## 4. Commercial model (recommended)

```
Starter  — free · up to 10 seats · core comms + HR + requests + tickets
Growth   — $4/seat/mo · ≤50 seats · + attendance, leave, payroll, analytics, advances
Scale    — $7/seat/mo · unlimited · + agent toolkit depth, mailboxes, SSO (roadmap)
Trials   — Growth/Scale trials are 14 days; admin sees a live countdown
Dunning  — trial end → past_due (7-day grace, read-mostly + banner) → cancelled (hard stop)
Seats    — hard cap at invite with an upgrade prompt; platform can raise the cap on demand
```
All of this is now representable in code (`PLANS`, org columns, lifecycle transitions). Payment capture is the only missing wiring.

---

## 5. Phased plan

Each phase ships with its own verification gate (typecheck · lint · unit · isolation suite vs live DB · build · smoke) plus a **platform drill** where relevant. The phases are ordered to de-risk revenue first, then enterprise, then scale.

### Phase A — Activation engine (first-run → daily use) ✅ IMPLEMENTED (core)
Goal: a new company reaches "daily-use" in under 15 minutes.

**Delivered:**
1. **First-run wizard** `/setup` (gated to setup-capable admins): brand (reuses the real branding UI) → invite teammates (name/email/role with live seat counter) → publish a welcome announcement. Every step writes through the normal APIs, so Home's setup checklist reflects progress automatically; wizard shows a completion state when 4/4 are done. Home checklist card now links **Continue setup → /setup**.
2. **Email delivery**: `migration-0048`; `src/lib/mailer.ts` gained `renderBrandedEmail` (shared Wamiro mail shell, action buttons, one-time-password block) + exported `escapeHtml`/`appUrl`. New `src/lib/mail/activation.ts`: **invite email** (temp password + sign-in CTA, sent to the invitee) and **welcome email** (registering admin → finish-setup CTA). Fire-and-forget + silent no-op when `SMTP_URL` is unset (admin-seen temp password remains the fallback). Notification emails now use the same branded shell. `.env.example` documents `SMTP_URL`, `MAIL_FROM`, `APP_URL`, `BILLING_UPGRADE_URL`.
3. Template content: leave types + service catalog already seeded at provision; the wizard publishes the welcome announcement with a sensible default body.
4. **Activation analytics**: `users.last_active_at` stamped lazily + throttled (≤1 UPDATE/5min/user) on session load; platform console shows **companies active 7d / users active 7d** (north-star cards) and per-tenant **last active** so dormant or stalled-setup companies are visible for proactive success calls.

**Remaining from plan:** measure cohort activation (% of companies completing setup with ≥3 members active within 7 days) — needs a cohort view (Phase E console). Providers: any SMTP endpoint (Resend/Postmark/Mailgun expose one); DKIM/SPF set-up is a domain step.

Verification: typecheck clean · lint 0 errors · unit 33/33 · isolation suite PASS vs live DB (migration 0048 applied) · build green · smoke 14/14 · live E2E (register → /setup renders 3 steps → invite returns temp password fallback → welcome announcement published → steps flip to Complete → seats 2 → platform stats 403 for non-platform admin).

### Phase B — Self-serve billing (revenue)  [provider: Stripe or Paddle]
1. Provider decision (Gravity Index search recommended): **Stripe** (default, richest docs, US-centric) vs **Paddle** (merchant-of-record: handles global VAT/sales tax + invoicing — attractive if selling internationally from day one).
2. Implement the adapter in `src/modules/billing/` (interface already shaped: `getCheckoutUrl`, `syncSubscription`, `cancel`):
   - Checkout → webhook → create/update org `billing_customer_id` / `billing_subscription_id`; map provider status → our `trial|active|past_due|cancelled`.
   - Seat changes: charge per active seat on a monthly cycle (recompute via `activeSeatCount`); overage = auto-bill or soft-cap per operator flag.
   - Invoice & receipt emails via provider; cancel/refund flows.
3. Dunning: on `past_due` (provider-driven), send day 1/3/7 emails; day 7+ → org gate soft (banner) then hard stop.
4. Settings → Plan & Billing page already built; add payment method + invoice history UI.
5. Gate: **a tenant can upgrade with a card and be on Growth within 60 seconds**; downgrade path works; refund-safe cancel.

### Phase C — Enterprise trust pack (larger logos)  ✅ IMPLEMENTED
1. **SSO (OIDC)** ✅ — per-org `sso_configs`; authorization-code + PKCE (S256); ID-token signature verified against the provider's JWKS via `node:crypto` (RS256 + ES256 P-256 + HS256 fallback), nonce/issuer/audience checked; JIT provisioning to `default_role_key`; SSO identities stamped `auth_method='sso'` and **rejected by the password login**; per-org enable switch; Admin → Integrations UI; callback URL `/api/v1/auth/sso/callback`. SAML remains future (stored `provider='saml'`, execution needs an IdP bridge).
2. **SCIM 2.0 provisioning** ✅ — bearer token (sha256 at rest, shown once), `ServiceProviderConfig`/`Schemas`/`ResourceTypes`/`Users`/`Groups` endpoints, create/update/deactivate-on-DELETE, filter `userName eq`/`active eq`, group membership; Admin UI generates/revokes the token.
3. **Full tenant delete** ✅ — `DELETE /api/v1/org` with exact-name typed confirmation; transaction deletes the org's users first then the org row (all tenant tables cascade); the session dies with the users cascade; audit event survives org deletion (no FK) as a platform-level record. (Org-level audit CSV export existed via the audit log export datasets.)
4. **Webhooks** ✅ — org-scoped endpoints with HMAC-SHA256 `sha256=…` signatures + `x-wamiro-event` header; subscribed to domain events (`user.created`/`invited` now emitted by the invite flow, plus leave/request/task/document/announcement events); per-webhook pause/resume/test-delivery and last-delivery status surfaced in Admin → Integrations UI.
5. Gate: two reference enterprise companies run SSO + SCIM in a pilot — **open** (needs real IdP tenants: Okta/Entra/Google).

### Phase D — White-label & channels  ✅ IMPLEMENTED
1. **Custom domains + white-label branding** ✅ — per-org custom domain (`Settings → Organization`) with validation (`isValidCustomDomain`), uniqueness, and **lazy self-verification**: the first request that actually arrives on a CNAME'd host marks it verified (`custom_domain_verified`) and serves the tenant — platform host, `<slug>.{app}` subdomain, or custom CNAME are all resolved by `src/modules/org/host.ts` (10s per-host cache). Login page is branded per tenant (name, color, logo, SSO availability) on tenant hosts; `X-Api-Version` header added to all API responses. Public API versioning doc: `docs/product/public-api.md`.
2. **PWA + web push** ✅ — org-aware installable shell: `app/manifest.ts` serves a tenant-branded manifest (name/color/icon per host), generated PNG icon set (`scripts/gen-pwa-icons.mjs`, zero deps), `public/sw.js` service worker (precache + offline fallback with cached announcement feed), and a `PwaClient` registered in the root layout. **Web Push**: `src/lib/push.ts` implements the full Web Push spec with **zero dependencies** — VAPID ES256 JWT signing + RFC 8291 `aes128gcm` encryption (HKDF per §3.3/3.4, verified against the RFC pseudocode in unit tests and a live decrypt); `push_subscriptions` table, subscribe/unsubscribe/status API, and `notify()` fans out to every device of the user (VAPID config from env; dead endpoints pruned on 404/410). Notifications page gains an opt-in/status card.
3. **Rate limiting (tenant-scale)** ✅ — shared DB-backed limiter `src/lib/ratelimit.ts` (holds across instances, rolling-window per key) wired into the request wrapper and the auth routes (register/login); register rate configurable via env (`REGISTER_RATE_LIMIT_PER_HOUR`) so bulk customer onboarding stays possible; `.env.example` documents VAPID keys, `PLATFORM_HOSTS`, and limiter envs.
   - Migration 0051 + schema: `organizations.custom_domain(_verified)`, `push_subscriptions`, `rate_limit_hits`.
   - Verification: unit 48/48 (incl. push crypto round-trip + VAPID verify, host classification); isolation suite PASS; build green; live E2E — custom-domain/subdomain branding on login, push delivered to a live receiver and **decrypted to plaintext as the user agent** (`{"title":"Your leave was approved by PD Admin",…}`), register/login rate limit returns 429 at the configured ceiling.
   - Gate (open): real-browser PWA install + native push-service (FCM/Web Push prod endpoint) pilot on 2–3 companies.

### Phase E — Platform console v2 (operate 100 companies)
1. The console (this session) lists tenants + subscription ops + fleet stats. Add:
   - Cohort/activation board (setup %, DAU/WAU per tenant), churn risk list (dormant >14d), trial pipeline.
   - Impersonation *with consent + full audit* for support.
   - Announcement broadcast to all tenants (product updates).
   - Support: route tenant support tickets into a platform queue; escalation SLAs.
2. Gate: an operator can answer "which companies are at risk this week?" in one screen.

### Phase F — Reliability & observability (the "without fail" backbone)  [do not defer past 30 companies]
1. **Scheduled workers**: move SLA sweep, mail polling, trial sweep, payroll auto-actions onto a real scheduler (systemd timers or a job queue with retries). Idempotency keys already exist for ingest.
2. **Observability**: structured request logs (org id, route, status, latency), error tracking, health endpoint `/healthz` (db + storage + queue), uptime + alerting (page on 5xx spike or restore-drill failure).
3. **Backups**: automated daily Postgres backups with point-in-time recovery + the existing `restore-drill.mjs` on a **scheduled** (not ad hoc) cadence; document RPO (≤24h) / RTO (≤2h) and run a quarterly game-day.
4. **Rate limiting + abuse**: tenant-level limits on auth and mutation endpoints; invite spam protection.
5. **Zero-downtime deploys**: migrations are additive/idempotent (ADR-004) — formalize expand→migrate→contract for the few destructive cases.
6. Gate: **game-day**: kill the DB host and prove recovery within RTO without data loss; then and only then pass 50-company mark.

### Phase G — Scale to 100+ (capacity & residency)
1. Load model: pick a target (e.g., 100 tenants × ~40 users × daily 10 req/user). Verify current single Postgres + Next.js instance headroom with load tests at 5× that; add PgBouncer + read replicas if needed; move sessions/notifications to a shared cache only when >1 app instance (documented "ponytail" assumptions).
2. Storage: attachments/docs/logo through the storage adapter — move to S3-compatible object storage before 50 companies (local disk is a single point + backup bloat).
3. Data residency (EU customers): regional instance option → org `region`; isolation is already tenant-scoped so a region split is additive.
4. Multi-instance session handling: sessions are DB-backed today (good) — ensure the register rate-limiter moves to a shared store (it is currently in-memory per instance; flagged in code).

### Phase H — Growth & support operating model (people + process)
1. **Customer success playbook**: week-0 welcome + setup assist, week-4 check-in, quarterly business review for Scale.
2. **In-app support as a feature**: every company's users reach the platform helpdesk (native tickets already); add a "Help & feedback" entry that creates a platform-side ticket with tenant context.
3. **Champion program**: admin newsletter, feature request portal (existing Requests engine can dogfood), webinars.
4. North-star metrics: weekly active companies (WAC) / seats activated / setup completion / trial→paid conversion / churn < 2%/mo.

---

## 6. Release gates & "ship without fail" rules
- **Every migration is additive + idempotent** (pattern proven across 0040–0047). Destructive SQL only via expand/migrate/contract.
- **Isolation suite is release-blocking** and runs against a live DB before any production deploy.
- **No tenant can ever be silently locked out**: trial expiry without payment → graceful Starter downgrade (implemented); past_due keeps read access until a hard stop at cancelled.
- **Restore drill is scheduled**, not optional.
- A change that touches auth, provisioning, billing lifecycle or migrations requires a **platform drill checklist item** in the PR.

---

## 7. What was implemented in this session (already in the tree)
- `migration-0047` + schema: `organizations.plan / billing_status / trial_ends_at / seat_limit / billing_provider / billing_customer_id / billing_subscription_id`.
- `src/modules/billing/`: `plans.ts` (Starter 10 / Growth 50 / Scale unlimited, 14-day trials), `service.ts` (subscription view, seat enforcement, lifecycle transitions, trial sweep, cancelled gate).
- Seat caps enforced at invite; cancelled orgs blocked at session load + login.
- `Settings → Plan & Billing` page (plan, seats progress, status, trial countdown, upgrade CTA) + account-menu entry.
- Platform console: fleet stats (tenants, seats, by-plan, trials ≤7d), per-tenant plan select / grant trial / cancel, subscription columns.
- Company setup checklist on Home (admins only, until complete).
- Isolation suite extended (plans default, seat cap invite rejection + recovery, cross-tenant billing view isolation, trial sweep both branches, cancelled gate) — PASS vs live DB. Build green, smoke 14/14, live E2E verified.

## 8. Suggested next step
Run **Phase A** (activation engine: SMTP invite email is the single highest-leverage missing piece — invites today require the admin to copy a temp password) and **Phase B** (self-serve billing) in that order.
