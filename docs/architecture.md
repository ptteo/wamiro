# Wamiro — Architecture (IAM, Tenancy, Data Flow)

**Status:** living document · created from the G-29 gap-analysis consolidation (2026-09-17).
Sources: `src/db/schema.ts`, `src/lib/session.ts`, `src/modules/iam/*`, `src/lib/ratelimit.ts`, `docs/project-gaps-and-issues.md`.

---

## 1. Account hierarchy

Who can exist, and how they nest. Platform operators are *outside* every tenant.

```
Platform (org slug '__platform', id NULL on platform roles/audits)
│
├── Platform operator (super admin)
│     └── holds NULL-org roles → /platform console only
│           - manages orgs, billing status, entitlements
│           - consent-gated impersonation ONLY (tenant must grant; ledgered)
│
└── Tenants (organizations.status: active | trial | past_due | suspended …)
      │
      ├── Org admin (roles: 'admin', holds users.manage / roles.manage / audit.view)
      │     ├── manages users, roles, overrides, security, storage, integrations
      │     └── grants consent for platform impersonation
      │
      ├── Manager (role 'manager' or permission-scoped)
      │     └── team-scoped access via scope families (employees.view@team …)
      │
      └── Member (base 'member' role; self-service only)
            └── requests, tickets, payslips, documents, notifications
```

Key rules:

- A **user row belongs to exactly one org** (`users.organization_id NOT NULL`). Cross-org identity
  (same email in two tenants) is a known long-term tension — see G-12 residual in the gap doc.
- **Roles** are org-scoped; the `roles_org_key` unique index is NULL-distinct (see G-23 note in
  `src/db/schema.ts`): one role per `(org, key)` per tenant, platform rows exempt.
- **Overrides** (`allow`/`deny` + scope + expiry) are temporary grants layered by the pure engine;
  `deny` wins over everything (deny-wins precedence).

## 2. Access computation (pure IAM engine)

`computeEffectiveAccess` in `src/modules/iam/engine.ts` — no DB, fully unit-tested:

```
        userRoles (org roles)          overrides (allow/deny, scope, expiry)
              │                                  │
              ▼                                  ▼
        base permission set ──────►  overlay: deny strips, allow adds
              │                                  │
              ▼                                  ▼
        scope widening (team/dept/company) ◄─ deny-wins
              │
              ▼
   effective access: permission → widest scope
   unknown permission requested → DENIED (hardening default)
```

`can(access, "perm")` and `widestScope(access, "perm.family")` are the only two predicates the
whole app uses to gate anything.

## 3. Request → response data flow (write path)

```
Browser ──fetch──► /api/v1/<route> route.ts
                    │
                    ├─ route() wrapper (src/lib/api.ts):
                    │    1. CSRF: Sec-Fetch-Site cross-site rejected (G-11);
                    │       Origin check fallback for non-browser clients
                    │    2. rate limit (G-04: 1s-aggregated DB writes,
                    │       per-instance local floor if DB down)
                    │    3. requireAuth → AuthContext (session cookie →
                    │       sessions JOIN users JOIN organizations; user must
                    │       be org member, status active)
                    │
                    ├─ service fn (src/modules/<m>/service.ts):
                    │    - can(ctx.access, …) permission gate
                    │    - org-scoped WHERE on every query
                    │    - mutation + audit(...) (G-01: bounded retry →
                    │      DLQ file → 15-min replay job; never throws)
                    │    - post-commit side effects: notify(), emit(),
                    │      webhooks (G-08: ledger + retry sweep)
                    │
                    └─ withTenantScope(ctx.org.id, tx) around raw multi-tenant
                         SQL when used: sets app.org_id GUC → RLS policies
                         enforce; connection destroyed on error (no GUC leaks)
```

## 4. Page-render data flow (read path)

```
GET /<page> ──► RSC page.tsx
                 ├─ requireAuthPage() → AuthContext (same as API path)
                 ├─ Promise.all of module service reads (G-21: one RTT)
                 ├─ every read org-scoped at the module layer
                 │    (pages render OUTSIDE the ALS scope — RSC streaming —
                 │     so RLS second wall applies to API writes; page reads
                 │     rely on module discipline, guarded by the CI wall
                 │     src/tests/page-db-guard.test.ts — G-05)
                 └─ serialize props → client islands (instant local filtering;
                    server search via ?q= for big tables — G-20)
```

## 5. Audit & retention pipeline

```
mutation ──► audit() ─► INSERT audit_logs ─┬─► /admin/audit (keyset pages, G-03)
                                           ├─► CSV export (current page only, G-27)
                                           └─► retention_sweep (12h, G-02):
                                                 archive to JSONL month files
                                                 → THEN bounded delete (5000/run)
failure ─► retry ─► DLQ file ─► audit_dlq_replay job (15 min) ─► re-INSERT
```

## 6. Background jobs

One worker (`npm run jobs:worker`) ticks a registry (`src/modules/platform/jobs.ts`);
every run lands in `platform_job_runs` and health checks read it (stalled scheduler
= alerting condition). Current registry: sla_sweep, trial_sweep, dunning_sweep,
request_escalation, governance_sweep, mailbox_poll, usage/health rollups, alert
evaluator, email/operator digests, retention_sweep, deletion_sweep, cleanup_orphans,
attendance/documents/assets/work/announcements sweeps, audit_dlq_replay (G-01),
webhook_retry_sweep (G-08), access_review_cadence (G-18).

All sweeps are idempotent and bounded — overlapping ticks are harmless.

## 7. Storage layer

- Primary: S3-compatible (R2) when `S3_*` env set; fallback: local disk under
  `WAMIRO_DATA_DIR` (`tenant/{orgId}/{category}/{uuid}-{name}` keys).
- `resolveLocalKey()` (G-22) proves every key resolves inside ROOT via
  `resolve` + `path.relative` — no `..` escapes, absolute keys rejected.
- Usage listing bounded at `USAGE_LIST_CAP` with honest `truncated` flag (G-09).

## 8. Time & payroll

- Orgs carry `timezone` + `workweek_start` (G-17, migration 0069).
- Proration CTE generates per-day rows in org-local time and masks working days
  via `src/modules/payroll/workweek.ts` (Mon–Fri default, Sunday-start supported).
- All user-supplied dates (time logs, bookings) pass `src/lib/date-bounds.ts`
  (G-30): real calendar dates, floor 2000-01-01, max ~2y future.
