# Wamiro Design-Phase Audit & Checkpoint — Phase D11

Companion to `docs/checkpoint-d9-d10.md`. Covers
`wamiro_phase_d11_enterprise_launch_customer_readiness.md` (63 sections,
1,502 lines), read in full in this session.

Verification at time of writing:

| Gate | Result |
|---|---|
| `npm run lint` | 0 errors (6 pre-existing unused-import warnings) |
| `npm run typecheck` | clean |
| Unit tests | 14/14 pass |
| Integration (`test:integration`, live RDS) | PASS — extended suite incl. cleanup |
| `npm run build` | GREEN — 52 routes, all authed pages ƒ dynamic |
| Smoke (`scripts/smoke-test.mjs`) | **14/14 PASS** vs production server |

## What was built this round

1. **Smoke test + acceptance journey** — `scripts/smoke-test.mjs`:
   self-provisions a throwaway tenant through the public register API
   (§52 provisioning), then walks every major workspace (§51) and the
   admin surfaces. Fixed three of its own bugs en route: invalid ESM
   import syntax (`{strict: assert}` → `{strict as assert}`),
   un-awaited promises passed to assertion helpers, and plain-object
   fetch bodies (must be `JSON.stringify`-ed).
2. **Health endpoints** — `/api/v1/health` now reports app version +
   per-component status; `/health/live` and `/health/ready` existed.
3. **Observability** — structured access logs now carry tenant + user
   ids and an error-category field on API errors (§21), alongside the
   existing request-id/safe-error model.
4. **Audit export** — new `audit` dataset in `/api/v1/admin/export/[dataset]`
   (gated by `audit.view`, audited like every export); added to Admin home.
5. **Documentation set** (`docs/product/`): `getting-started.md`,
   `admin-guide.md`, `deployment.md` (env vars, first deploy, updates,
   rollback, backups, monitoring), `security.md` (verified-controls-only
   baseline + honest limitations), `api.md` (auth, conventions, error
   model, endpoint map, versioning), `troubleshooting.md`,
   `release-notes.md` (template + v0.1.0 entry).
6. **Release tooling** — `npm run smoke`; release pipeline documented
   (build → tests → migrate → deploy → health → smoke).
7. **Extended tenant-isolation suite** — now also asserts: B admin gets
   404 on A user detail, cannot suspend A users, session tables list
   only own-org users, cross-tenant session revoke fails 404, audit
   trails never mirror each other, tickets and announcements are
   org-scoped. PASS against live database.

## Per-section matrix

**Implemented (this round unless noted):**

| § | Section | Evidence |
|---|---|---|
| 16/17 | Customer/admin documentation | `docs/product/*` (7 files) |
| 18 | Production deployment | deployment.md; env var table; update+rollback |
| 19 | Health checks | version + component statuses; live/ready split |
| 20/21 | Observability / error context | JSON logs w/ requestId/orgId/userId/category; no secret leakage |
| 22 | Release process | documented pipeline + `npm run smoke` |
| 23 | Migrations | pre-existing versioned idempotent runner (verified) |
| 24 | Zero-downtime | additive-migration policy documented |
| 25/26 | Backups / DR | documented w/ explicit "restore drill required" caveat |
| 27 | Security baseline | security.md lists only code-verified controls |
| 28 | Tenant isolation (BLOCKER) | extended integration suite PASS vs live DB |
| 32 | Customer export | audit CSV dataset added (permission-gated, audited) |
| 39 | API DX | api.md |
| 48 | Versioning | health payload + release-notes.md |
| 51 | Smoke after release | 14/14 PASS vs production build |
| 52 | Customer provisioning | exercised end-to-end by smoke test |

**Pre-existing from D1–D10, verified this round:** §4–6 (tenant identity/
branding), §10 (module activation gates routes AND APIs), §44 (strong
defaults via provisioning seed), §46 (EmptyState primitives everywhere),
§47 (safe error states), §55–56 (one codebase; configuration over forking).

**Not implemented (honest gaps):**

| § | Section | Note |
|---|---|---|
| 7–9 | Guided onboarding wizard + first-admin checklist UI | Admin home has sections but no stepwise setup checklist card |
| 11/43 | Module dependency validation | e.g. Support→Knowledge not enforced |
| 12–14 | Demo environment/journey/story | no synthetic demo seed |
| 15 | Unified help surface | knowledge + support exist separately |
| 29 | Full role × workspace security matrix | isolation covers employee/manager/admin paths, not all 6 roles × 9 workspaces |
| 30/31 | Break-glass procedure | platform orgs API exists; runbook unwritten |
| 33 | Retention configuration | not implemented |
| 34/35 | Tenant deletion/offboarding runbook | cascades proven by test cleanup; operator doc missing grace-period flow |
| 36 | Custom domains | single-host deployment only |
| 37 | Tenant-branded email identity | SMTP present; branding of emails not done |
| 38 | Escalation flows | priority + SLA due dates exist (D6); escalation automation absent |
| 40 | Webhooks | none — roadmap item |
| 41/42 | Integration test-connection UX / abstraction | Frappe/Zammad exist; generic connect-test pattern partial |
| 49 | Feature flag hygiene | no flag system exists (nothing accumulated) |
| 50 | Staging/prod separation | documented; no infra provisioned |
| 53 | Deprovisioning automation | sessions die via cascade; jobs/storage sweep manual |
| 54 | Visual productization QA harness | token system enforced; no screenshot diffs |
| 57 | Write-path E2E journey | covered by isolation test (apply→approve etc.), not by smoke |
| 58 | Blocker: unverified backup restore | restore drill NOT yet performed — remains open |

## Release-blocker status (§58)

- Cross-tenant leakage: **PASS** (extended suite).
- Auth/session invalidation: **PASS** (D9 suspend/revoke, audited).
- Permission bypass via API/search/AI: **PASS** (engine tests + scoped services).
- Unprotected documents/downloads: **PASS** (404 cross-tenant download asserted).
- Core navigation: **PASS** (smoke walks all workspaces).
- Backup verification: **OPEN** — no tested restore yet. Do not claim DR readiness.

## Verification commands

```powershell
$env:DATABASE_URL = (Get-Content .env | Where-Object { $_ -match '^DATABASE_URL=' }) -replace '^DATABASE_URL=',''
npm run verify          # lint + typecheck + unit + integration
npm run build           # production build
npm start               # serve production bundle
node scripts/smoke-test.mjs --base-url http://127.0.0.1:3000 --email <unique@example.com>
```
