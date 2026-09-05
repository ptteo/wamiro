# Wamiro — Release-Candidate Readiness

Status date: Phase 1 identity (enterprise plan §3).

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

## Still open (not Phase 1)

1. Phase 2 — first-login tour, role checklists, help center.
2. Phase 3 — Paddle billing.
3. Phase 4 — R2 storage + RLS.

## How to resume

Suites: `npm run verify`, `node scripts/e2e-all.mjs`.
Next: Phase 2 in `docs/implementation-plan-enterprise.md`.
