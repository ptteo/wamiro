# Wamiro Platform — Vision, Tenant Lifecycle & Onboarding Blueprint

> **Status:** idea + analysis document (no implementation). **v2** — updated 2026-09-11 after a comparative review of the external spec *Wamiro Tenant, Subscription & Platform Administration Architecture* (82 sections; verdict and adopted/rejected ideas in §9).
> **Date:** 2026-09-11 · **Branch:** `saniya-phases`
> **Purpose:** describe how Wamiro works as a multi-company platform — from first sales contact, through subscription purchase and account provisioning, down to end-user onboarding — and analyze it against what is already built.
> **Related docs:** [platform-admin-panel-plan.md](./platform-admin-panel-plan.md) (panel build phases), [implementation-plan-enterprise.md](./implementation-plan-enterprise.md), [architecture.md](./architecture.md), [scaling-to-100-companies-plan.md](./scaling-to-100-companies-plan.md)

---

## 1. The idea, restated

**Wamiro is one platform that many different companies subscribe to.** Each subscribing company (a *tenant*) gets its own isolated workspace inside the same deployment. Wamiro's own team runs the business from a separate **admin panel**.

### 1.1 Wamiro team admin panel

1. The panel shows **every detail of every company** that bought a subscription — who they are, what they bought, how they use Wamiro, how healthy the relationship is.
2. The panel **tracks subscriptions**: when one is expiring or a payment fails, the system emails the company automatically.
3. The panel has **rich subscriber-management features** (billing, notes, support, access, controls).

### 1.2 Company onboarding flow

1. The tenant company **contacts Wamiro sales**.
2. Based on the subscription the company chooses, its **account is created from the admin panel** (sales-assisted, not self-serve).
3. An **admin account is created for the tenant company**.
4. The admin account's **ID and password are emailed** to the company's chosen mailbox; the tenant admin can change the password later.
5. The tenant admin then creates the company's other accounts — CEO, CTO, CFO, managers, HR, employees, custom types — and **sends each person an invitation link with a fixed ID and password**; the holder saves the password to log in.
6. On first login through the link, a **guide opens explaining every feature that particular account holder gets**.
7. Continuously improve the flow with more ideas (§8 of this doc).

---

## 2. Reality check — what Wamiro already has (as of 2026-09-11)

The codebase is further along than the idea doc assumes. Mapping each idea point to the current tree:

| # | Idea point | Current state in code |
|---|-----------|----------------------|
| 0 | Many companies on one platform | ✅ Full multi-tenancy: `organizations` table (`src/db/schema.ts`) with plan, billing status, seats, branding, module toggles; every service filters by `ctx.user.organizationId`; RLS hardening shipped. |
| 1 | Panel shows every detail of subscribers | ✅ Largely built: platform console (`src/app/(app)/platform/`) with risk board, global tenant search, **Tenant 360** (`platform-tenant-360.tsx` — Overview / Usage / Billing / Support / Access + CRM timeline), fleet usage heatmap, health scores (0–100, explainable), revenue analytics (MRR, churn, renewals), unified billing ledger. |
| 2 | Track subscriptions; mail before expiry | ⚠️ **Half built.** Reactive side is done: dunning sweep emails billing contacts on day 1/3/7 of `past_due` (`src/modules/billing/dunning.ts`), trial expiry sweep, `trial_ending` / `failed_payment` alert rules. **Proactive renewal reminders (T-30/T-14/T-7 before a subscription ends) do not exist yet.** |
| 3 | Many subscriber-management features | ✅ Built: billing ledger with manual invoices / payments / credits, entitlements & module kill-switches, consent-gated audited impersonation, broadcast, support queue, two-person rule for destructive ops, alerts & playbooks, CSV exports, operator roles (viewer/operator/admin). |
| 4-step 1 | Company contacts sales | ❌ **No lead/sales pipeline exists.** `platform/crm.ts` is post-sale CRM (notes, touchpoints on tenants), not a pre-sales deal pipeline. |
| 4-step 2 | Account created from admin panel | ❌ **Panel cannot create a tenant.** Today a company self-registers at `POST /api/v1/auth/register` → `provisionOrganization()` (`src/modules/org/service.ts`). Operators can suspend/reactivate but not provision. |
| 4-step 3 | Admin account for the tenant | ✅ `provisionOrganization()` creates the org + first `admin` user + system roles + seed data in one transaction. |
| 4-step 4 | Credentials emailed | ⚠️ Existing flow is *better*: activation **link** (7-day hashed token in `invitation_tokens`) where the admin sets their own password; welcome email on registration; self-service reset. A "fixed password mailed out" mode is NOT how it currently works (see §6 for why that's the right call). |
| 4-step 5 | Tenant admin creates CEO/CTO/CFO/… accounts via link | ✅ Built: invitations service (`src/modules/invitations/service.ts`) — `users.manage` / `team.invite` permissions, seat-cap enforcement, allowed email domains, CSV import up to 1,000 rows, resend/revoke. Roles: 5 system roles (`employee`, `manager`, `hr_admin`, `ceo`, `admin`) **plus per-tenant custom roles** (roles CRUD, ~80 permission keys, 5 scopes, per-user allow/deny overrides). For companies that truly want admin-controlled passwords there is an org setting `passwordMode: "managed"` — changes become approval requests the admin approves. |
| 4-step 6 | Guide on first login explaining that user's features | ⚠️ **Partially built.** Versioned per-page product tours (`src/lib/tour.ts`), first-week checklists for manager/employee (`src/modules/onboarding/checklists.ts`), setup checklist on Home, role-filtered help catalog. **No generated "everything your role gets" guide on first login.** |

**Bottom line:** roughly 70–80% of the idea is already implemented. The missing 20–30% is exactly the part that makes the model *sales-led* instead of *self-serve*: a sales pipeline, panel-driven tenant provisioning, proactive renewal comms, and the role-based welcome guide.

---

## 3. Gap analysis

| # | Gap | Why it matters |
|---|-----|----------------|
| **G1** | **Panel-side "Create tenant" provisioning** (sales closes a deal → operator creates the company account with the chosen plan/seats from the panel) | The idea's core flow. Today a company must self-register and an operator would have to fix the plan afterwards. |
| **G2** | **Lead / deal pipeline** (contacted → demo → quote → won/lost) | Without it, "company contacts sales" lands in an inbox, not in the system of record. The existing mailbox→ticket poller could auto-create leads from a `sales@` inbox. |
| **G3** | **Credential-delivery policy** (link vs. fixed password in email) | Emailing working passwords is an anti-pattern (§6). Needs a deliberate decision, not an accident. |
| **G4** | **Proactive renewal/expiry reminders** (subscription end-date warnings) + an expiry board in the panel | Idea point 2 says "if getting expired mail will be sent" — today only *failed-payment* dunning and *trial-ending* alerts exist; normal renewals are silent. |
| **G5** | **First-login role guide** ("every feature your account gets") | Needs to be generated from the IAM catalog + org module toggles so it stays true as features change. |
| **G6** | **Onboarding-visibility for Wamiro team** | `onboardingState` (`pending → admin_done → employees_seeded → complete`) already exists on the org — the panel should surface and alert on it so the team can help stalled tenants. |
| **G7** | **Customer ≠ tenant separability** | Plan/subscription/billing all live directly on the `organizations` row, so one customer with subsidiaries, sandboxes or regional entities cannot be modeled. Additive fix (panel convention-compliant): a `platform.customers` control-plane record + a soft `customer_id` reference on the org. |
| **G8** | **No consistency reconciliation** | Nothing verifies that subscription state, org status, entitlements and module toggles agree; drift (subscription suspended but tenant active and fully entitled) is invisible until it bites. A reconciliation sweep feeding the risk board closes this. |
| **G9** | **No "all tenant admins lost access" recovery path** | Today the only fix is manual DB surgery. Needs a documented, two-person, customer-verified break-glass flow — the `destructive_ops` two-person pattern already exists to build on. |

---

## 4. Proposed end-to-end architecture

### 4.1 Actors

```
                         ┌──────────────────────────────────────────┐
                         │              WAMIRO TEAM                 │
                         │  sales  ·  ops/support  ·  engineering   │
                         │  (platform operators: viewer/operator/   │
                         │   admin, via platform.platform_operators)│
                         └───────────────┬──────────────────────────┘
                                         │ admin panel (/platform)
      lead → deal → provision            │ impersonate (consent-gated),
      invoice / credit / dunning         │ support queue, broadcast
                                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        WAMIRO PLATFORM (single deployment)          │
│   Next.js 15 monolith · Postgres RDS Mumbai · `platform` schema =   │
│   panel-owned tables · tenant tables isolated per organization      │
│                                                                     │
│  ┌────────────┐   ┌────────────┐   ┌────────────┐                   │
│  │ Tenant A   │   │ Tenant B   │   │ Tenant C … │  ← each with its  │
│  │ admin+users│   │ admin+users│   │ admin+users│     own roles,    │
│  └────────────┘   └────────────┘   └────────────┘    modules, data  │
└─────────────────────────────────────────────────────────────────────┘
```

- **Platform operators** are gated by `requirePlatform` (IAM `platform.admin`) plus the viewer/operator/admin levels in `platform_operators`.
- **Panel convention:** panel-owned tables live in the `platform` Postgres schema with soft org references + name/slug snapshots (history survives tenant deletion); the panel never writes tenant tables; tenant surfaces never read `platform`.
- **Customer layer (forward-looking):** *customer* and *tenant* should be separate control-plane concepts from day one of the sales motion — a customer account (legal entity, billing/primary/technical contacts, sales owner, CS/renewal owner) groups one or more provisioned tenants. At current scale the mapping is 1:1 and that is fine; the record just has to exist so a customer's second tenant (subsidiary, sandbox, region) never forces a billing-model rebuild.

### 4.2 Tenant lifecycle (the full arc)

```
 Stage 0        Stage 1         Stage 2          Stage 3
 LEAD    →      DEAL      →     PROVISION   →    TENANT-ADMIN
 sales@          plan chosen     panel creates     activates account,
 mailbox →       seats, cycle,   org + admin       runs /setup wizard
 lead pipeline   price/trial     account           + invites team
                                                        │
                                                        ▼
 Stage 7        Stage 6         Stage 5          Stage 4
 RENEW /        HEALTH &        ACTIVE USE  ←    MEMBER
 EXPAND /       SUPPORT         adoption,        ONBOARDING
 CHURN          health score,   productivity     invite link →
 renewal board, support queue,  tracked          password set →
 upsell, win-back alerts                          ROLE GUIDE opens
```

### 4.3 Stage-by-stage flow

#### Stage 0 — Lead (company contacts sales)  *(gap G2 — to build)*
- Company reaches Wamiro via website contact form, `sales@` email, or referral.
- Every lead becomes a row in a new **leads/deals pipeline** in the admin panel (status: `new → contacted → demo → quote → won/lost`).
- The existing IMAP mailbox poller (already turns mailboxes into support tickets) can watch `sales@` and auto-create leads — zero new infrastructure.
- On **won**, the deal carries: chosen plan (`starter`/`growth`/`scale`), seat count, billing cycle, trial or paid, billing contact email, agreed notes — and creates/links the **customer account** record (legal name, contacts, sales owner) that the tenant will attach to (G7).

#### Stage 1 — Deal → provisioning decision
Two supported paths, both ending in the same `provisionOrganization()` core:
- **Sales-assisted (the idea's default):** operator clicks **"Create tenant"** in the panel *(to build, G1)*, fills org name/slug, plan, seats, billing cycle, tenant-admin name + email, optional branding, optional manual invoice (offline/PO payment).
- **Self-serve (keep it):** company registers at `/api/v1/auth/register` → gets `growth`/`scale` **14-day trial** automatically. Sales later "adopts" the tenant in the panel (links it to the won deal).

#### Stage 2 — Panel provisions the company account  *(gap G1 — to build)*
Proposed flow (reuses existing primitives; nothing new to invent):
1. Operator submits the provisioning form → backend calls the same transactional core as `provisionOrganization()` (org in `pending` onboarding state, admin user, system roles, EMP-001, leave types, service catalog).
2. Plan/seats applied; if paid-offline, a **manual invoice** is recorded in `platform.billing_invoices` (already supported) and `billingStatus` set accordingly; if via Paddle, a checkout/portal link is generated and sent.
3. The tenant-admin account is created with status `invited` and an **activation email** is sent to the mailbox the company chose — a one-time, 7-day link that lets the admin set their own password (see §6 for why this replaces "fixed password in the email").
4. Everything lands automatically in Tenant 360 (the CRM timeline logs the touchpoint), and the new tenant is linked to the customer account created at deal close (G7).

#### Stage 3 — Tenant admin activation + setup
1. Tenant admin clicks the link → sets password (10+ char policy) → lands on `/setup`.
2. The 4-step setup checklist (invite team, logo, first announcement, first KB article) drives configuration; `onboardingState` advances as real data appears.
3. Admin configures: modules on/off, roles (5 system + **custom roles** for CTO/CFO or anything else), policies (MFA mode, password mode, allowed email domains, seat overage policy), branding/white-label.

#### Stage 4 — Member invitations + first-login role guide
1. Tenant admin invites people individually or via CSV (up to 1,000 rows); seat cap enforced; invite is a 7-day magic link; the invitee **sets their own password** at `/invite/accept`. (Companies that insist on admin-issued fixed passwords flip the org's `passwordMode` to `managed` — then password changes require admin approval; see §6.)
2. **First-login role guide** *(gap G5 — to design, §7)*: generated from the role's permission set + the org's enabled modules → a "What you can do in Wamiro" walkthrough, the role's first-week checklist, and per-page product tours. CEO sees goals/finance/approvals; HR sees people/payroll/leave; employee sees attendance/leave/requests — each guide is derived from data, not hand-written.

#### Stage 5 — Active use
Usage rolls up hourly into `platform.tenant_usage_daily`; seat counts sync; tours/checklists progress in-app.

#### Stage 6 — Health & support (Wamiro team side)
- Daily 0–100 health score (recency, adoption, breadth, support, billing) with explanations.
- Alert rules: `dormant`, `trial_ending`, `failed_payment`, `sla_breach`, `churn_risk` → notify operator / email tenant / create task.
- Support queue pulls tenant `platform`-category tickets; consent-gated impersonation for debugging; broadcast for announcements.
- **New (G6):** an *Onboarding board* card listing tenants stuck in `pending`/`admin_done` > N days so the team can reach out.

#### Stage 7 — Renewal / expansion / churn  *(gap G4 — partially to build)*
- **Proactive renewal reminders (to build):** a sweep that emails **configurable recipients** (billing contact, primary contact, tenant admin) on a **configurable schedule** — default T-30/T-14/T-7/T-1/expiry-day plus one post-expiry follow-up (90/60-day windows are overkill for a $4–7/seat SMB motion, but the schedule should be a table, not code) — with every send recorded to a **notification history** the operator can inspect (what was sent, when, to whom, delivery outcome). A "Renewals due" board rides on the revenue module's existing renewal forecast.
- **Reactive (exists):** dunning day 1/3/7 on `past_due`, then downgrade/cancel.
- **Expansion:** seat increases (Paddle quantity sync already wired), plan upgrades with proration, add-on entitlements, credits (`platform.billing_credits` + panel UI).
- **Churn/offboarding:** suspend → export → 7-day undo → GDPR staged deletion (already built and ledger keeps historical snapshots).

---

## 5. Admin panel design — subscriber management

### 5.1 What exists today (inventory)

| Area | Capability |
|------|-----------|
| **Visibility** | Global tenant search, risk board, Tenant 360 (Overview/Usage/Billing/Support/Access + CRM timeline), fleet usage heatmap, per-tenant notes & touchpoints |
| **Billing** | Unified ledger (manual + Paddle invoices, INV-YYYY-#### numbering, payments, credits), revenue KPIs (MRR, ARPA, trial conversion, churn, NRR-proxy, aging, renewal forecast), destructive-ops two-person rule for cancelling paying tenants |
| **Control** | Entitlements: module kill-switches, seat caps, API limits, feature flags (60-s cache); operator management (viewer/operator/admin) |
| **Support** | Support queue over tenant tickets, escalate/reply, consent-gated time-boxed impersonation with full ledger, broadcast announcements |
| **Automation** | 18-job registry (dunning, trials, usage rollup, health rollup, alert evaluator, digests, retention, deletion…) with `platform_job_runs` ledger and a jobs health card |
| **Governance** | Exports with reason prompts, audit trails, alert rules & inbox |

### 5.2 Proposed additions (the gaps)

1. **"Create tenant" provisioning wizard** (G1) — the single most important addition; form → provision → activation email → invoice, all from one screen. Guard: require reason; two-person approval not needed for *creation* (it's additive, not destructive).
2. **Leads/deals pipeline** (G2) — lightweight kanban/table, `sales@` auto-ingest, link won deals to tenants ("adopted self-serve tenant" path).
3. **Renewals board + reminder sweep** (G4) — T-30/14/7/1 emails; panel card listing renewals due in 30/60/90 days; reuses the revenue renewal forecast.
4. **Onboarding board** (G6) — tenants by `onboardingState` with "stuck > 7 days" alerts and a one-click "send getting-started nudge" action.
5. **Lifecycle email center** — templates + send-log for the whole journey (activation, welcome drip, dunning, renewal, win-back) so ops can edit copy without deploys; start with a simple template table + preview.
6. **Credits write path polish** — `platform.billing_credits` schema and ledger UI exist; ensure create/apply-credit flows carry mandatory reason prompts (recent work on this branch covers most of it).
7. **Customer layer** (G7) — `platform.customers` table + soft `customer_id` on organizations + a Customers view (list + Customer 360-lite: legal name, industry, region, primary/billing/technical/security contacts, contract state, subscriptions, tenants, sales owner, renewal/CS owner; filters on plan / billing status / renewal window / onboarding state / health). Build the record cheaply now; build the multi-tenant-per-customer UX only when the first such deal appears.
8. **Reconciliation sweep + drift issues** (G8) — a job in the registry checking billing vs org status vs entitlements vs modules; discrepancies surface as operator-visible issues in the risk board (e.g. "billing cancelled, tenant active", "entitlement grants module the org plan doesn't include").
9. **Break-glass tenant-admin recovery** (G9) — for a tenant with no working admins: customer-authority verification → two-person approval (reuse the `destructive_ops` pattern) → time-boxed recovery grant → forced credential + MFA re-setup → full audit → auto-expiry. Document the runbook before it's needed at 2 a.m.
10. **Plan-change impact preview** — before a downgrade (tenant-facing `/settings/billing` and operator-side), show features that will stop working, data above the new limits, seat impact and effective date; never silently destroy anything.
11. **Sales demo tenants** — "create demo tenant" from a template: synthetic seed data (`seedDemo` primitives exist), clearly marked, automatic expiry job, never real customer data.
12. **Subscription operations completeness** — the billing surface should cover the full operator set: change plan, **extend expiry**, suspend/resume, cancel, **reactivate**, change seats, **schedule a future change** (a dated entitlement change picked up by a sweep), with renewal owner + notification history + change history visible on the subscription view. Most primitives exist (Paddle adapter, `status.ts`, entitlements); this is mostly UI + one dated-changes table.

---

## 6. Credential & security policy — the "fixed password by email" question

The idea mails **fixed IDs + passwords** (both for the tenant admin and for invited members). Recommendation: **send one-time activation links instead; never email working passwords.** This is what the code already does, and it should stay.

**Why fixed-password-by-email is an anti-pattern:**
- Email is not a confidential channel: mailboxes retain mail forever, get forwarded, get read by IT/ESP scanners; a leaked password is a *permanent* credential until someone rotates it.
- Wamiro holds payroll, finance, and HR data — shared/static passwords destroy the audit trail (actions can't be attributed to a person).
- Users can't rotate a password they were mailed without breaking "admin-only changes"; NIST SP 800-63B and OWASP's forgot-password guidance explicitly advise against sending passwords by email ("do not send the password in the email!") and require reset/activation tokens to be cryptographically random, single-use, user-bound and expiring — exactly the properties `invitation_tokens` already has (Microsoft Entra B2B and Auth0 Organizations use the same invitation-redeem pattern for B2B access).
- Wamiro stores only password hashes — a "fixed password" flow means generating and handling plaintext secrets that a credential database should never hold in the first place.
- Deliverability + spam risk (Brevo shared IP): a password email that never arrives = a support ticket; a link can be resent and expires safely.

**Recommended policy per actor (all supported by existing code):**

| Actor | Delivery | Password control |
|-------|----------|------------------|
| Tenant admin (created by Wamiro team) | One-time 7-day activation link to the company's chosen mailbox | Admin sets own password at first login; can change anytime; self-reset by email |
| Members invited by tenant admin | One-time 7-day invitation link (individual or CSV) | Invitee sets own password |
| Companies that *require* admin-controlled passwords | Org setting `passwordMode: "managed"` | Changes become `password_change_requests` the tenant admin approves; admins can reset/set any user's password |

This preserves the *intent* of the idea (company's chosen mailbox receives what it needs to get in; tenant admin controls accounts) while keeping the audit trail, zero plaintext secrets in inboxes, and self-healing access (forgot-password with 30-min tokens). Layered on top already: TOTP MFA modes, login lockout (10 fails/15 min → 30-min lock + admin notice), session revocation, allowed email domains, access reviews, full audit log.

**If the fixed-password experience is still wanted for some tenants:** implement it as *temporary* password + **forced change on first login** (flag on the user row), never as a permanent credential. That keeps the idea's UX ("save the password we sent") but closes the security hole.

---

## 7. First-login role guide (design)

Goal: when a user first logs in, they see **"Everything your account gets"** — generated, per-role, per-org.

**How it derives itself (no hand-maintained copy):**
1. Load the user's role → permission set from the IAM catalog (~80 keys across 20 groups).
2. Load the org's enabled modules (`organizations.modules`) and entitlements.
3. Intersect → the modules this user can actually see.
4. Render: a welcome modal + a persistent "Getting started" page with, per module: what it does, 3–5 key actions, links (deep links into each page), and the role's first-week checklist.
5. First-week checklist + per-page tours (already built for manager/employee) extend to `hr_admin`/`ceo`/custom roles using the same checklist framework.
6. The help catalog (role-filtered) is linked from every guide entry, with the "file a ticket" escape hatch.

Extras worth adding: a tenant-admin-facing **"Features by role"** printable page (useful when the company's HR explains Wamiro to staff), and a "guide version" stamp so returning users see "what's new in your role" when entitlements change.

---

## 8. Suggestions to make it the best workflow

Prioritized. "Exists" = already in code to build on.

### P0 — the model itself
1. **Panel-side tenant provisioning** (G1) — the idea's step 2; reuses `provisionOrganization` internals.
2. **Renewal reminders + renewals board** (G4) — the idea's step "expiring → mail". Small job + board; biggest visible win for subscribers.
3. **Leads pipeline + `sales@` auto-ingest** (G2) — closes the top of the funnel into the system of record.
4. **Onboarding board + stuck-tenant alerts** (G6) — Wamiro team sees who needs help before they churn.
5. **Role guide on first login** (G5) — the idea's step 6, generated from IAM data.

### P1 — making the team efficient
6. **Lifecycle email center** — editable templates + send log (activation, welcome drip day 0/2/7, dunning, renewal, win-back).
7. **Trial→paid playbook** — trial-ending alert already exists; add an operator task auto-created 3 days before trial end with a suggested talk track.
8. **Scheduled revenue report** — monthly MRR/churn/aging CSV emailed to the team (exports infra exists).
9. **Plan-tiered support SLAs** — growth/scale tenants get faster SLA in the support queue; display promise in-app.
10. **Adopted-tenant flow** — link a self-serve signup to a won deal so sales attribution is clean.
11. **Require MFA for all platform operators** — TOTP MFA already exists; make it a hard policy gate for `platform.admin`, individual operator identities only, no shared accounts (internal staff security).
12. **Plan-change impact preview** (§5.2 #10) — protects both the customer and Wamiro from accidental-loss claims.
13. **Break-glass recovery flow + runbook** (§5.2 #9) — write the "all tenant admins lost access" process down before it's needed.

### P2 — growth & polish
14. **Annual billing** with discount + the renewal-reminder sweep reused for anniversary notices (Paddle supports both periods).
15. **Add-on modules / feature flags as upsell** — entitlements table already models `module.*` / `cap.*` / `limit.*`; sell depth (payroll, AI) per tenant.
16. **Soft seat overage** — `seatOveragePolicy: soft` exists; add overage review card + billing instead of hard block for trusted tenants.
17. **Win-back + exit flow** — cancel reason capture, optional pause (suspend exists), win-back email at T+30.
18. **Referral program** — credits (`platform.billing_credits`) as the payout mechanism.
19. **Deliverability hardening** — SPF/DKIM/DMARC per docs/ops/smtp-dns.md, transactional subdomain, per-tenant white-label sender option for branded mail.
20. **Compliance positioning** — DPDP Act (India) readiness, data residency statement (RDS Mumbai), SOC-2-style controls doc for enterprise deals; SSO/SCIM (already built) as the enterprise-plan gate.
21. **Role template gallery** — offer CTO / Finance Approver / IT Admin / Support Agent starting points when a tenant creates custom roles (derived from the existing permission catalog; tenant can edit before saving).
22. **Email delivery/open tracking** — Brevo event webhooks → per-message delivery history in the notification center (feeds the renewals board and the email center).
23. **Explainable-access helper** — "why can this user see X?" view derived from role grants, per-user overrides and module toggles (access reviews already exist; this is the UI over them).
24. **Sales demo tenant with auto-expiry** (§5.2 #11).
25. **Incident communications** — platform-incident tenant emails folded into the lifecycle email center with an approval step.
26. **Plan → versioned entitlement set** — plans today are price + seats + trial; define each plan as a template that expands into the `platform.org_entitlements` rows it grants (so a plan change recalculates entitlements in one place, and future pricing changes never touch product code).
27. **Verified company domains** — extend `allowedEmailDomains` with explicit domain-ownership verification (DNS TXT) for SSO routing and invite controls.
28. **Activation polish** — a terms/privacy acknowledgement step on first activation, and a richer invite form that shows the **effective access** the invitee will receive before sending.
29. **User & membership lifecycle + employment events** — verify and complete user/membership states (invited → active → suspended → removed) in the admin UI, and make promotion/transfer real events that drive role/scope/manager updates (aligns with docs/implementation-plan-native-hr-support.md).

### KPIs the panel should surface (mostly exists)
Time-to-activate (provision → admin setup done) · time-to-first-invite · seat fill rate · trial→paid conversion · MRR / churn / NRR · health-score trend · dunning recovery rate · renewal on-time rate · support first-response time.

---

## 9. Comparative review — external architecture spec (2026-09-11)

Reference reviewed: **Wamiro Tenant, Subscription & Platform Administration Architecture** (82 sections — a generic B2B SaaS control-plane spec grounded in OWASP / Microsoft Entra B2B / Auth0 Organizations patterns; OWASP's forgot-password guidance was verified directly against cheatsheetseries.owasp.org).

**Verdict:** strong generic spec with the right security instincts — but it must be filtered through Wamiro's actual state. A large share of it is *already implemented*; a third of it is genuinely new and **adopted** below; several recommendations are over-engineered for a monolith at solo-operator scale and are **rejected with reasons**. A complete section-by-section disposition of **all 82 sections** is in the appendix coverage matrix (§11).

### 9.1 Adopted — integrated into this doc (§§3–8)

| Idea from the spec | Where it landed |
|---|---|
| Customer ≠ Subscription ≠ Tenant separability (spec §4/§7) | G7, §4.1 customer layer, §5.2 #7, phase I |
| Explicit subscription/tenant lifecycle state machines (§10–11) | Documented mapping onto existing fields — appendix §11 (`past_due` ≡ GRACE; renewal-due derivable; no new columns needed) |
| Reconciliation of subscription vs tenant vs entitlements (§51) | G8, §5.2 #8 |
| Break-glass / all-admins-lost recovery (§57–58) | G9, §5.2 #9, P1 #13 |
| Configurable renewal notification schedule + notification history (§30–31) | Stage 7, §5.2 #3 |
| Onboarding-stall signals as operator alerts (§34) + onboarding progress % (§16) | G6 extension — new alert rules `admin_not_activated`, `onboarding_stalled`; progress shown on the onboarding board |
| Plan-downgrade impact preview (§54) | §5.2 #10, P1 #12 |
| Stronger activation definition / time-to-value (§61) | Onboarding board: activation = admin activated + company configured + users invited + users activated + core module used |
| Demo tenants with auto-expiry; never demo with customer data (§62–63) | §5.2 #11, P2 #24 |
| MFA + individual identities for platform staff (§72) | P1 #11 |
| Risk-tiered admin actions (§52) | Already partially built (two-person rule, reason prompts) — extend the two-person rule to break-glass recovery |
| Invitation rejection matrix (§20) | Matches current invitations-service behavior — recorded here as the acceptance checklist |
| Tenant-switch refresh checklist (§40) | QA gate: switching orgs must refresh branding / role / permissions / nav / modules / cached data |
| Control-plane nav as an operational control center (§24, §64–66) | Panel IA grouping as it grows — extend in place, do not rebuild routes |
| Usage metering independent of plan UI (§71) | Already true (`platform.tenant_usage_daily`) — kept as a standing design rule |

### 9.2 Already satisfied by the current build

- **Entitlement-driven access instead of scattered plan checks (§9)** — `platform.org_entitlements` + module kill-switches + caps/limits/flags, 60-s cache.
- **Global identity + memberships + tenant switcher (§14, §40)** — users are global; `me/orgs` switching exists.
- **Explicit support-access model (§35)** — Wamiro's impersonation is *stronger* than the spec's generic ask: it requires tenant-admin consent, is time-boxed, fully ledgered, with an explicit stop path.
- **Offboarding with retention/export + deletion verification (§59–60)** — GDPR staged deletion, 7-day undo, deletion sweep, exports.
- **Enterprise identity readiness (§43–44)** — OIDC SSO (PKCE) + SCIM shipped; allowed email domains exist.
- **Invitation security (§20)** — hashed single-use 7-day tokens, expiry/revocation, suspended-org rejection, duplicate invite → membership linking.
- **Data isolation with a release-blocking isolation suite; platform vs tenant search separation; AI authorization boundary; durable jobs; audit trails; `deny` > allow user overrides (§75's hierarchy).**

### 9.3 Rejected or deferred — with reasons

| Spec recommendation | Why not (for Wamiro now) |
|---|---|
| Central event bus + ~30 domain events (§49) | Monolith + jobs registry + audit/billing event tables already give those guarantees; revisit at multi-node scale. |
| Durable async provisioning job instead of one transaction (§12) | `provisionOrganization()` is a single atomic DB transaction — atomicity gives idempotency for free at current scale. Adopt job-based provisioning only when steps gain external side effects that can't be transactional. |
| 14-step setup wizard with save/resume (§16) | Keep the server-measured 4-step checklist + role checklists; grow the checklist rather than adding wizard machinery. |
| 90/60/30/…/1-day renewal windows (§30) | SMB motion; 90/60 is noise. Default 30/14/7/1 + expiry-day + follow-up — but configurable (taken). |
| Email Delivered/Opened invitation states (§19) | Requires Brevo event webhooks — deferred to P2 #22. |
| New `/platform/customers\|subscriptions\|plans\|…` route tree (§66) | Panel pages already exist; extend the IA in place instead of rebuilding routes. |
| 11-role platform-operator taxonomy (§5.1) | viewer/operator/admin levels + IAM cover a 1–5 person team; finer granularity is naming, not enforcement. Revisit when staff grows. |
| "Never treat tenant created = customer activated" (§61) | Agreed in spirit — adopted via the activation definition — but `onboardingState` already encodes most of it. |

### 9.4 The spec's principle worth adopting verbatim

> Wamiro staff administer the customer account and tenant lifecycle; the tenant admin administers the people, roles and configuration inside the tenant — and platform access must never become a silent backdoor into customer business data.

This is already enforced structurally (panel never writes tenant tables; consent-gated impersonation; soft refs + snapshots). It is recorded here as the rule every future panel feature must cite.

---

## 10. How this maps to the existing plan docs

- **platform-admin-panel-plan.md** phases A–F: A (usage rollup) done; B-fix done; C (Tenant 360 + CRM-lite), D (health/alerts), E (revenue), F (entitlements + operator roles) are present in the working tree on this branch (recent, uncommitted at the time of writing). **This doc's P0 items are new scope on top of F** — natural follow-on phases (G: provisioning + leads; H: renewals + lifecycle email center; I: customer layer + reconciliation sweep + break-glass recovery, per §9).
- **implementation-plan-enterprise.md**: identity (invitations, resets, managed passwords), Paddle billing, RLS, GDPR deletion, SSO/SCIM — all shipped; these are the primitives §4 relies on.
- **Conventions to keep when implementing** (per repo conventions): everything through the `route()` wrapper with permissions; additive idempotent migrations; panel tables in the `platform` schema with soft org refs; jobs registered in the jobs registry; isolation suite extended.

---

## 11. Appendix

### Lifecycle state mapping (spec §10–11 → Wamiro fields today)

| Spec stage | Wamiro today | Gap |
|---|---|---|
| Subscription ACTIVE | `billingStatus = active` | — |
| Subscription RENEWAL_DUE | derivable from renewal date / `trialEndsAt` | reminder sweep + renewals board (G4) |
| Subscription GRACE | `billingStatus = past_due` + `dunningStage` (1/3/7) | — |
| Subscription SUSPENDED / CANCELLED | `billingStatus = cancelled`, org `status = suspended` | — |
| Tenant PROVISIONING | synchronous transaction — fails loudly, no partial state | none while provisioning stays synchronous |
| Tenant READY / ONBOARDING | `onboardingState`: pending → admin_done → employees_seeded | panel visibility + stall alerts (G6) |
| Tenant ACTIVE | `status = active` + `onboardingState = complete` | formal activation definition (§9.1) |
| Tenant OFFBOARDING / ARCHIVED | GDPR staged deletion + 7-day undo + retention sweep | — |
| PROVISIONING_FAILED / SECURITY_LOCKED | n/a | rejected until async provisioning exists (§9.3) |

### Full coverage of the external spec — all 82 sections dispositioned

Every section of *Wamiro Tenant, Subscription & Platform Administration Architecture* maps to exactly one disposition here: **Covered** (this doc describes it), **Built** (already in the codebase — verified), **Adopted** (new idea, integrated into this doc), **Rejected/Deferred** (with reason in §9.3), or **Partial**.

| Spec § | Topic | Disposition |
|---|---|---|
| 1–3 | Two planes; tenant data domains; current-direction analysis | Covered — §4.1, §2 (every listed tenant data domain exists as a Wamiro module) |
| 4, 7, 26–28 | Customer/subscription/tenant separation; customer record; customer list; Customer 360 | Adopted — G7, §4.1, §5.2 #7 (full field set incl. technical/security contacts, contract state, filters) |
| 5 | Control-plane roles & capabilities | Partial — viewer/operator/admin built; finer taxonomy deferred (§9.3); capabilities in §5.1 |
| 6, 76 | 19-step commercial workflow; final diagram | Covered — §4.2/§4.3 stages 0–7 map every step |
| 8 | Plan as multi-dimensional model → entitlement set | Adopted — P2 #26 |
| 9 | Entitlement-driven access | Built — `platform.org_entitlements` + module toggles (§9.2) |
| 10, 11, 29 | Subscription/tenant lifecycles; subscription operations | Mapping — §11 table; operations gap adopted — §5.2 #12 |
| 12 | Async provisioning job | Rejected — §9.3 (atomic transaction gives idempotency now) |
| 13 | Initial-admin activation link | Built — invitation tokens; §6 (OWASP-verified) |
| 14, 40 | Global identity + memberships; tenant switcher | Built — `me/orgs`; switch-refresh QA gate adopted (§9.1) |
| 15, 16 | Admin first-login flow; setup wizard; progress % | Checklist kept (§9.3); progress % + stall alerts adopted (G6); terms-ack adopted (P2 #28) |
| 17 | Person ≠ job title ≠ role | Built — users/employees/roles distinct; permission engine |
| 18 | Role templates | Adopted — P2 #21 |
| 19, 56 | Invitation states; duplicate handling | Built (membership linking, resend/revoke); Delivered/Opened deferred (P2 #22); effective-access review adopted (P2 #28) |
| 20 | Invitation security matrix | Adopted as acceptance checklist (§9.1) — current service satisfies it |
| 21–23 | End-user first login; role onboarding; progressive onboarding | Covered — §7 |
| 24, 25 | Panel navigation; overview metrics | Built (risk board, stats); IA grouping adopted (§9.1); renewals metric via §5.2 #3 |
| 30, 31 | Renewal notification schedule; notification service | Adopted — Stage 7, §5.2 #3/#5; delivery tracking P2 #22 |
| 32–34 | Needs-attention queue; health model; onboarding signals | Built (risk board, health score, 5 alert rules); onboarding alerts adopted (G6) |
| 35 | Support access model | Built, stronger — consent-gated impersonation (§9.2) |
| 36, 37 | Platform/tenant audit | Built — audit trail, impersonation ledger, destructive-ops records |
| 38, 39 | User/membership lifecycle; employment events | Partial — completion adopted (P2 #29) |
| 41, 42 | Tenant URLs; branding | Built — custom domains + white-label branding |
| 43, 44 | SSO/SCIM readiness; verified domains | SSO/SCIM built; verified domains adopted (P2 #27) |
| 45 | Data isolation + test matrix | Built — release-blocking isolation suite, RLS |
| 46, 47 | Platform vs tenant search; AI boundary | Built |
| 48 | Durable background jobs | Built — 18-job registry + worker |
| 49, 50 | Event bus; idempotency | Bus rejected (§9.3); idempotency satisfied (atomic provisioning, notify-once stamps, idempotent migrations) |
| 51 | Reconciliation | Adopted — G8, §5.2 #8 |
| 52 | Risk-tiered admin actions | Partial — two-person rule built; extension adopted (§9.1) |
| 53–55 | Plan upgrade/downgrade; seat management | Built (Paddle change/cancel/quantity sync, caps, overage policy); downgrade preview adopted (§5.2 #10) |
| 57, 58 | Account recovery; break-glass | Adopted — G9, §5.2 #9 |
| 59, 60 | Offboarding; data export | Built — GDPR staged deletion, exports, retention sweep |
| 61 | Activation definition / time-to-value | Adopted — §9.1 |
| 62, 63 | Demo tenants; environment separation | Adopted — §5.2 #11 |
| 64–67 | Panel vs tenant UI; context labels; route trees | Built; route-tree rebuild rejected (§9.3) — extend in place |
| 68, 69 | Communication center; incident comms | Adopted — §5.2 #5, P2 #25 |
| 70, 71 | Infra health; usage metering | Built — /health gates, `platform.tenant_usage_daily` |
| 72 | Staff identity security | Adopted — P1 #11 |
| 73, 75 | Authorization separation; policy hierarchy | Built — `platform.admin` GLOBAL only; deny > allow (§9.2) |
| 74 | Role creation; explainable access | Partial — roles CRUD + access reviews built; helper adopted (P2 #23) |
| 77, 78 | Keep/Change list; minimum control-plane screens | Covered — §§1–5 |
| 79 | Release acceptance criteria | Covered — §10 conventions/gates + isolation suite |
| 80 | Final architecture principle | Adopted verbatim — §9.4 |
| 81, 82 | Research references; source-of-truth alignment | This blueprint is the repo-verified true-up (§2); references in §9/§6 |

### Reference data

**Plans** (`src/modules/billing/plans.ts`): `starter` — free, 10 seats · `growth` — $4/seat/mo, 50 seats, 14-day trial · `scale` — $7/seat/mo, unlimited seats, 14-day trial. `seatLimit` per-org override; seat overage policy hard/soft.

**System roles seeded per tenant:** `employee`, `manager`, `hr_admin`, `ceo`, `admin` (+ per-tenant custom roles). Platform side: `super_admin` with `platform.admin`; operator levels viewer/operator/admin in `platform.platform_operators`.

**Transactional emails today:** activation/invite link, legacy invite (temp password), password reset, org welcome, dunning day 1/3/7, alert `email_tenant`, weekly digest. All rendered through the shared branded HTML shell (`src/lib/mailer.ts`) over Brevo SMTP; unconfigured SMTP = silent no-op.

**Key jobs already running:** `trial_sweep`, `dunning_sweep`, `usage_rollup`, `health_rollup`, `alert_evaluator`, `sla_sweep`, `mailbox_poll`, `email_digest`, `deletion_sweep`, `retention_sweep` (full list in `src/modules/platform/jobs.ts`).
