# Release Notes

Each production release records: version, date, highlights, migration notes,
known issues, rollback guidance. Newest first. Copy this template for new
entries.

## Template

```markdown
## vX.Y.Z — YYYY-MM-DD

### Highlights
- ...

### Migration notes
- (schema changes? run `node scripts/migrate.mjs`; any manual steps?)

### Known issues
- ...

### Rollback guidance
- Redeploy previous tag. Schema is additive → old code runs on new schema.
```

## v0.2.0 — R0–R15 productization program

### Highlights
- **Multi-organization identity**: one person, many companies. Memberships table, session-scoped active tenant, org switcher APIs; identity-link invitations (same email joins a second company without a new account).
- **Role experiences**: persona engine derives CEO/HR/Manager/Admin/Employee from effective permissions; materially different homes; identity + department always visible in the shell.
- **Authorization contract**: precedence tests (deny > override > role > default-deny), engine refuses non-catalog keys, documented manage≠approve.
- **Personalization**: global vs tenant-scoped user preferences with merged read API; theme persisted from shell.
- **Platform services**: domain-event bus with isolated consumers (approvals notify managers); provider capability registry + admin integrations status.
- **Workflow**: SLA deadlines + idempotent escalation sweep on requests; sequential approval chains verified.
- **AI trust**: answers carry citations ("Sources" deep-links); read-only tool posture confirmed.
- **Finance & procurement** (D12) and **People ops / HR lifecycle** (D13): expenses→reimburse, purchase order flow, budgets with warnings, vendors; recruitment pipeline, onboarding/offboarding journeys, performance cycles, learning, recognition, HR change approvals.
- **Governance** (D15 core) and **Workplace** (D14 core): policies/risks/controls/obligations with overdue sweep; rooms/desks booking with conflict handling; visitors check-in/out.
- **Scale & reliability**: 10–25 tenant simulation harness (0 cross-tenant leaks in 120+ checks); hot-path indexes; structured logs now include cause-chains.

### Migration notes
- Apply migrations 0026–0038 via `node scripts/migrate.mjs` (idempotent).
- `REGISTER_RATE_LIMIT_PER_HOUR` env now tunes signup throttling (default 20/h).

### Known issues
- D14 facilities issues & calendar UI, D15 controls-testing UX/legal-contracts: pending.
- Parallel workflow branches and automated retry runner: pending.
- pg_dump artifact drill requires PostgreSQL 18 client tools locally.

### Rollback guidance
- Redeploy previous tag. All migrations through 0038 are additive.

## v0.1.0 — initial tracked release

### Highlights
- Full workspace product: Home, People, Work, Requests, Knowledge, Documents,
  Company, Assets, Analytics, AI, Admin.
- Built-in auth with TOTP MFA; session revoke per-device or per-user.
- IAM engine: roles + scoped permissions + allow/deny overrides + delegations.
- Administration suite: users, roles, security center, audit log (searchable),
  access reviews, custom fields, CSV exports (employees/attendance/leave/audit).
- Cross-product finalization pass: unified search across five entity types,
  loading skeletons, token-based theming (light/dark), mobile shell.

### Migration notes
- Apply all migrations via `node scripts/migrate.mjs` (idempotent).

### Known issues
- SSO not yet implemented (password + MFA only).
- Rate limiting is per-instance; front horizontal deployments with a proxy limiter.

### Rollback guidance
- Redeploy previous tag; migrations through this release are additive.
