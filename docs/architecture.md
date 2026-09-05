# Wamiro architecture

How the blueprint maps to this codebase, and where v1 deliberately deviates.

## Structure (modular monolith, single deployable)

```
src/
  app/                 # Next.js App Router
    (app)/             # authenticated shell: home, people, attendance, leave, admin
    api/v1/            # versioned API: auth/*, me, people, attendance/clock, leave/*
    login/, register/  # unauthenticated
  components/          # design-system primitives + client islands
  lib/                 # env, db pool, session, password, audit, API wrapper, errors
  modules/
    iam/               # permission catalog + pure engine (+ unit tests)
    org/               # tenant provisioning
    people/            # directory (scope-filtered)
    attendance/        # HR-lite clock in/out
    leave/             # balances, apply, approve/reject
    home/              # aggregated dashboard queries
  db/                  # drizzle schema + seed
docs/                  # deployment + architecture
```

This is the blueprint's `apps/web + apps/api + packages/*` collapsed into one
Node process — approved for v1 because the target is a single Lightsail box.
Domain boundaries are the `modules/` folders; promoting any of them to a
service later means moving a folder, not rewriting it.

## Tenancy

- `organizations` is the tenant root; every business table carries
  `organization_id` with FK + index.
- Tenant context resolution: session token → sessions → users → organization.
  Client input can never set organization context (blueprint §17).
- All module queries take `AuthContext` and filter by
  `ctx.user.organizationId`. There are no repository escape hatches; raw SQL
  fragments interpolate the same id from ctx.
- Platform-level rows (platform roles, platform audits) use NULL
  organization_id and live behind `platform.admin`.

## Authorization

- Catalog: `modules/iam/catalog.ts` — permission keys, scopes, system role
  templates. Roles/grants are DB rows seeded per tenant, so tenants get custom
  roles without code changes (blueprint §11).
- Engine (`engine.ts`) is pure: deny > allow override > role grant, expired
  overrides ignored, unknown permission keys never grant. Unit-tested.
- Scopes resolve data filters per domain (e.g. attendance list SELF vs TEAM vs
  COMPANY). TEAM = direct reports via `employees.manager_user_id`.
- Enforcement points: UI nav (cosmetic), page guard `requireAuthPage()`, API
  wrapper `route({permission})`, and scope-filtered queries (defense in depth,
  blueprint §93).

## Sessions & auth

scrypt (node stdlib) passwords; 256-bit random tokens stored as SHA-256;
httpOnly/SameSite=Lax/Secure cookies; origin check on mutations (CSRF);
per-instance rate limiting on login/register; audit on logins, org creation,
leave lifecycle, attendance.

## Deviations from blueprint (v1, all reversible)

| Blueprint              | v1 reality                          | Why                          | Seam back |
| ---------------------- | ----------------------------------- | ---------------------------- | --------- |
| Next.js + NestJS       | Single Next.js app, `/api/v1` routes | One Lightsail box           | Extract modules/ to NestJS |
| Keycloak identity      | Built-in sessions                   | JVM won't fit small instance | Swap loadAuthContext for OIDC callback |
| Frappe HR + Zammad     | Fully native HR/support modules (people, attendance, leave, payroll, shifts, tickets, SLA, email intake) | No second hosting dependency; adapters removed in the Phase 6 cutover | Registry (`src/lib/providers/registry.ts`) if a future adapter is ever wanted |
| Meilisearch/MinIO/etc. | Not yet                             | Phased per blueprint §88     | Add when phase reached |

## Known v1 limits (tracked)

- In-memory rate limits (single-instance assumption) — move to shared store
  before horizontal scaling.
- DEPARTMENT scope treated as COMPANY for attendance listing until department
  subtree filtering ships with the Access Control Center phase.
- No notifications/announcements yet (next phase); no MFA yet — schema-ready,
  add TOTP at the Access Control Center phase.
