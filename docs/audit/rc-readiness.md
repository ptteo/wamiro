# Wamiro — Release-Candidate Readiness

Status date: Phase 6 UX system & micro-interactions — shipped.

## Closing verification (Phase 6)

| Gate | Result |
|---|---|
| typecheck | clean |
| lint | 0 errors |
| unit tests | 99/99 (no new unit deps; Phase 6 is UI-only) |
| isolation | unchanged — Phase 6 touched no API/service/db code paths |
| build | `next build` |
| a11y | contrast audit: primary/secondary/danger pass ≥4.5:1; tertiary (4.29) + brand-on-subtle (3.7–3.85) used only at large/semibold sizes (AA large-text); disabled exempt per WCAG 1.4.3. Skip-link, focus-visible rings, aria-live toasts verified. |
| reduced-motion | global `prefers-reduced-motion` override collapses every new animation (toasts, stagger, confetti, check-draw, palette) |
| path | any page: ⌘K or `/` → palette; Home → clock in (toast + first-time check); mobile <768px → bottom nav 5 workspaces ≥44px; notifications → optimistic read w/ rollback; payroll (paid slip) → once-only confetti |

New primitives (feature code SHOULD use these, not ad-hoc patterns):
- `toast.success/error/info/undoable/retryable` (`components/toaster.tsx`)
- `usePendingAction` / `OptimisticToggle` (`components/feedback.tsx`)
- `ListLoading` / `StatGridLoading` / `BoardLoading` (`components/loading.tsx`)
- `lift` / `press` / `stagger-enter` / `badge-pop` CSS classes + `--dur-*`/`--ease` tokens (`globals.css`)
- `shouldCelebrate` / `burstConfetti` / `CheckBurst` (`components/delight.tsx`) — once-per-user only

## Closing verification (Phase 7)

| Gate | Result |
|---|---|
| typecheck | clean |
| lint | 0 errors |
| build | `next build` |
| isolation | unchanged — nav model only; no API/service/db changes |
| path | sidebar: Knowledge → Articles/Documents/HR Docs; Facilities & IT → Rooms + Assets; Admin → GRC → Governance; ⌘K → "Ask AI" prefills the assistant composer |
| rail | 12 workspaces declared, 14→11-12 visible depending on permissions (was 14) |

## Closing verification (Phase 5)

| Gate | Result |
|---|---|
| unit | glitchtip parse/store URL + activity labels |
| isolation | `src/tests/phase5-isolation.test.ts` — activity A≠B; `listJobLedger` 403 for tenant admin |
| path | `/status`; Platform → Background jobs; Settings → My activity; `GET /api/v1/platform/jobs` |
| GlitchTip | unset DSN = no-op; see `docs/ops/glitchtip.md` |

## Closing verification (Phase 3)

| Gate | Result |
|---|---|
| lint | 0 errors on billing files (pre-existing unused-import warnings on Home) |
| typecheck | no errors in billing modules (pre-existing S3 types until `@aws-sdk/client-s3` is installed) |
| unit tests | 94/94 including Paddle signature + status map |
| cross-tenant integration | PASS — `src/tests/billing-isolation.test.ts` (replay, A≠B, invoices, soft vs hard seats, dunning). Full `isolation.test.ts` still fails on a pre-existing payroll net assertion on main (`275 !== 850`) before billing |
| build | not run this pass |
| smoke | `/api/v1/health/live` 200, `/ready` 200; Settings → Plan & Billing shows Starter, comparison, invoices empty, Talk to sales (Paddle unset) |
| migrations | `0059` applied (events, invoices, overage, dunning) |
| path | Settings → Plan & Billing; webhook `POST /api/v1/billing/webhook` |

Sandbox purchase is **not** claimed without Paddle credentials. Adapter stub works with unset `PADDLE_API_KEY` (Talk to sales).

## Closing verification (Phase 2)

| Gate | Result |
|---|---|
| lint | 0 errors (pre-existing style warnings) |
| typecheck | clean |
| unit tests | 71/71 (added tour + email-prefs) |
| cross-tenant integration | PASS — demo seed/purge org-scoped; help ticket in A invisible to B; tour prefs session-scoped; employee accept → `/home`; invite → clock in |
| build | `next build` succeeded |
| smoke | `/api/v1/health/live` 200, `/ready` 200 |
| migrations | `0055` applied (`projects.demo`, `tickets.demo`) |
| path | invite → accept → Home (`/home` for employees) → clock in |

## Closing verification (Phase 1)

| Gate | Result |
|---|---|
| lint | 0 errors (pre-existing style warnings) |
| typecheck | clean |
| unit tests | 64/64 (added email-domain + password-policy) |
| cross-tenant integration | PASS — token single-use, cross-org resend 404, manager line, domain lock, lockout |
| build | `next build` succeeded |
| smoke | `/api/v1/health/live` 200, `/ready` 200 |
| migrations | `0054` applied (invite tokens, lockout, org policies) |

## Phase 1 — shipped

| Item | Evidence |
|---|---|
| Invitation token links (no password in email) | `invitation_tokens`, `/invite/accept`, `createInvitation` |
| Legacy temp-password fallback | `inviteUser(..., { legacy: true })` / `?legacy=1` (ponytail, one release) |
| Self-service password + reset | `/settings/security`, `/forgot-password`, `/reset-password` |
| Managed password mode | org `password_mode` + admin approve/reject |
| Account lockout | 10 fails / 15 min → `users.locked_until` 30 min + admin notify |
| Cascading invites | `team.invite`, manager line only, CSV dry-run + commit |
| Corporate email lock | `allowed_email_domains` on invite + login |
| Your sessions | `GET/DELETE /api/v1/me/sessions` |
| MFA policy | `mfa_mode` optional / required_admins / required_all |
| Onboarding gate | `onboarding_state`; daily modules interstitial; platform force-complete |
| Existing orgs | stay `onboarding_state=complete`; new orgs start `pending` |

## Phase 2 — shipped

| Item | Evidence |
|---|---|
| First-login tour (5 pages) | `src/components/product-tour.tsx`, prefs `tourState` |
| Role checklists | `src/modules/onboarding/checklists.ts` on Home |
| Sample work | `/setup` + `demo` flag, org-scoped purge |
| Help + AI | `/help`, `help_search`, `create_support_ticket` → `category=platform` |
| Empty-state CTAs | Attendance, Leave, Tickets, Requests |
| Email prefs + digest | `deliverEmail` honors kinds/quiet hours; `email_digest` job; `docs/ops/smtp-dns.md` |
| Onboarding complete | brand + team + announce (KB is a Home nudge) |
| Invite landing | employees → `/home`; setup admins → `/setup` if incomplete |

## Phase 3 — shipping

| Item | Evidence |
|---|---|
| Paddle adapter (fetch, no SDK) | `src/modules/billing/adapter.ts`; stub when API key unset |
| Webhook signature | `paddle-sign.ts` HMAC of `${ts}:${rawBody}`, 5-minute skew |
| Webhook apply | `POST /api/v1/billing/webhook`, idempotent `billing_events.event_id` |
| Checkout / portal / cancel | `/api/v1/billing/{checkout,portal,cancel}` (`settings.manage`) |
| Soft vs hard seats | `organizations.seat_overage_policy`; quantity sync after invite |
| Settings UI | plan comparison, invoices, portal, cancel + retention copy |
| Dunning | job `dunning_sweep` day 1/3/7; `past_due` banner in app shell |
| Platform overrides | grant trial / set plan / cancel / overage policy still work |

## Still open

1. Phase 3 sandbox E2E purchase (needs Paddle credentials).
2. Phase 4 leftovers if any (R2/RLS already partial).

## How to resume

Phase 5 core is in tree. Next product phase: **6** (UX) or **7** (sidebar) after sign-off.
GlitchTip host setup is ops (`docs/ops/glitchtip.md`), not more app code.
