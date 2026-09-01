# Wamiro — Release-Candidate Readiness (post R0–R15 program)

Status date: end of goal window `goal-b89fc3dc…` (rounds 1–22).

## Closing verification (round 30)

| Gate | Result |
|---|---|
| lint | 0 errors (12 style warnings) |
| typecheck | clean |
| unit tests | 25/25 |
| cross-tenant integration | PASS (extended suite) |
| E2E feature journey | **59/59 PASS** on production build |
| restore drill | PASSED r28 (WAL_LOG clone parity x9 tables) |
| migrations | 0001-0038 applied |
## What is certified

| Area | Evidence |
|---|---|
| Feature completeness (functional) | `scripts/e2e-all.mjs` **55/55 PASS** on production build — every module's create→decide→consume flow incl. multi-org switch, suspend/reactivate, SLA sweep, workplace booking conflict, AI citations path, security negatives |
| Tenant isolation | isolation suite green (15 surfaces) + sim leak assertions 0/120 checks across runs |
| Authorization | precedence contract tests (11) + engine catalog-lock; route/service dual enforcement |
| Performance evidence | sim N=10→25: search p95 731ms flat; /me p95 ~268ms; indexes via migrations 0034 |
| Migrations | 0001–0035 applied to live DB, replay-idempotent style |
| Build/lint/types | verify battery GREEN at close of round 22 |

## Blockers still open before GA (honest list, updated r30)

1. ~~Backup restore drill~~ **DONE r28** (WAL_LOG clone verified). Artifact-level pg_dump drill pending PG18 client tools.
2. **D14 Workplace**: visitors DONE r24; facilities issues + calendar UI remain.
3. ~~D15 Governance core~~ **DONE r23+controls r29**. Legal matters/contracts remain.
4. Workflow: parallel branches + automated retry/timeout runner.
5. AI per-tool scope narrowing for cross-tenant resources.
6. Per-route mutation rate limits beyond auth endpoints.
7. Restore `02_WAMIRO_END_TO_END_MASTER_BLUEPRINT_V2.md` into the R&D package (missing doc).

## RC checklist to exit the above

- [x] Restore drill: WAL_LOG clone of live DB verified with row-parity across 9 core tables (`scripts/restore-drill.mjs`) — **PASSED r28**; artifact-level pg_dump drill pending PG18 client tools
- [ ] D14 visitors/facilities schema+APIs (pattern: copy bookings slice) — visitors DONE r24; facilities issues + calendar UI remain
- [ ] D15 policies/risks/evidence minimal tables + admin surface
- [ ] Parallel approval branches in requests review()
- [ ] Load pass at N=100 tenants on prod-like host
- [ ] Tag `rc-1.0.0` after all boxes tick

## How to resume

Goal tool continues this program; the forensics ledger
(`docs/audit/R0-forensics.md`) is the single source of truth for status and
evidence pointers. Suites: `npm run verify`, `node scripts/e2e-all.mjs`,
`npm run sim -- --tenants N`.
