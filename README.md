# Wamiro

**Wamiro** is a multi-tenant Company Operating System — one login, one home,
one workspace per organization. Howdy Analytics is tenant #1; the platform is
product-independent (blueprints: see the two `company_os_*.md` documents in
this repository).

## Stack

| Layer      | Choice                                                        |
| ---------- | ------------------------------------------------------------- |
| App        | Next.js 15 (App Router) + React 19 + TypeScript strict        |
| Styling    | Tailwind CSS v4, minimal in-house design system (`components/ui`) |
| Database   | PostgreSQL (AWS RDS) + Drizzle ORM                            |
| Auth       | Built-in sessions: scrypt password hashing, httpOnly cookies, DB-backed sessions |
| AuthZ      | RBAC engine — deny > direct grant > role grant, scopes SELF→GLOBAL |
| Validation | Zod at every trust boundary                                    |

Deliberate v1 deviations from the blueprint (documented in
`docs/architecture.md`): single Next.js app instead of Next+NestJS split,
built-in auth instead of self-hosted Keycloak, Wamiro-owned HR-lite instead of
Frappe HR. All three keep a clean seam for the blueprint systems later.

## Quick start

```bash
npm install          # check npm audit / outdated first (blueprint §24)
cp .env.example .env # set DATABASE_URL
npm run db:generate  # emit SQL migrations from the Drizzle schema
npm run db:migrate   # apply them to your database
npm run db:seed      # optional: Howdy Analytics demo data
npm run dev
```

Seed creates demo logins (password `Wamiro-Demo-2026!`, change immediately):
`ceo@howdy.test`, `hr@howdy.test`, `manager@howdy.test`, `employee@howdy.test`.

## Verification

```bash
npm run verify       # lint + typecheck + unit + integration tests
npm run build        # production build
```

Unit tests are hermetic. Integration tests (`test:integration`) provision two
throwaway tenants against DATABASE_URL and assert zero cross-tenant leakage
across directory, attendance, leave review, search, admin ops and permission
overrides — they auto-skip when no database is configured.

## Deployment (AWS Lightsail)

See **docs/deploy-lightsail.md** for the full runbook (Node 22, Caddy TLS,
systemd, backups).

## Security model summary

- Tenant context is derived server-side from the session row only; no client
  organization id is ever trusted.
- Every API route goes through the `route()` wrapper: error model, request-id,
  origin check on mutations, session load, permission gate.
- Every page uses `requireAuthPage()`; every module query filters by the
  session's `organizationId`.
- Login/register are rate-limited; sensitive actions write to `audit_logs`.
- Sessions: 256-bit random token, SHA-256 stored, httpOnly + SameSite=Lax +
  Secure in production, 14-day expiry.

## Roadmap

Blueprint phases, in order: Access Control Center UI → announcements &
notifications → request/approval framework → documents/knowledge → analytics
dashboards → AI layer (permission-aware tools only).
