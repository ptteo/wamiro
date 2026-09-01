# ADR set — Wamiro

Lightweight records of the significant architectural decisions made during
the MVP → Phase 1 evolution. Each is immutable; supersede with a new ADR
rather than editing.

---

## ADR-001: Single Next.js full-stack monolith (no separate API service)

**Status:** Accepted · **Supersedes:** blueprint §22/§126 two-service target

**Context:** Deployment target is a single Oracle Always Free VM (12 GB)
alongside optional Frappe HR and Zammad. The team is small.

**Decision:** One Next.js App Router process serves UI, Server Components,
and `/api/v1` route handlers over Drizzle/Postgres. Domain logic lives in
`src/modules/*` services with no UI imports, keeping future extraction to a
standalone API possible without rewrites.

**Consequences:** One deploy, one process to monitor. API extraction remains
possible because route handlers are thin wrappers around module services.

---

## ADR-002: Built-in session auth instead of Keycloak

**Status:** Accepted

**Context:** Blueprint names Keycloak for identity, but a JVM identity
provider does not fit the free-tier memory budget and MNC SSO is not yet a
requirement.

**Decision:** scrypt password hashing + DB-backed opaque session tokens
(14-day, httpOnly) + RFC 6238 TOTP MFA. Login supports a second step via an
HMAC pending token keyed on the password hash (self-revoking). An OIDC
adapter can replace credential checks later without touching session consumers.

**Consequences:** No enterprise SSO/SAML today. When needed, Keycloak/OIDC
slots in at the auth boundary (`src/lib/session.ts`, login routes).

---

## ADR-003: Local-disk object storage behind an adapter

**Status:** Accepted

**Context:** Documents and tenant logos need storage; MinIO is the blueprint
target but adds a service.

**Decision:** `WAMIRO_DATA_DIR` local disk with tenant-prefixed keys
(`tenant/{orgId}/...`), served only through authenticated routes. Swap to
MinIO/S3 by reimplementing `src/lib/storage.ts` / `org/branding.ts`.

**Consequences:** Backups must include the data directory (cron in
docs/deploy-oracle.md); multi-VM deployments require shared storage first.

---

## ADR-004: Hand-rolled SQL migrations instead of drizzle-kit generate

**Status:** Accepted

**Context:** drizzle-kit generate requires snapshot state that was lost;
the production DB predates it.

**Decision:** Numbered hand-written SQL files (`scripts/migration-*.sql`)
applied in order by `scripts/migrate.mjs`, which prefers the official pg
driver and falls back to a bundled zero-dependency client. Statements are
idempotent-style (IF NOT EXISTS / ON CONFLICT / DO-block guards) so re-runs
skip cleanly.

**Consequences:** Migrations are reviewable diffs; no snapshot drift.
Trade-off: schema.ts must be kept in sync manually — verified by running
verify after each migration cycle.

---

## ADR-005: Domain events table before any event bus

**Status:** Accepted

**Context:** Automation, analytics, and integrations all want "what happened"
data, but no event bus fits the free-tier constraint.

**Decision:** Append-only `domain_events` table written through
`src/lib/events.ts` alongside audit entries. Future consumers (workers,
webhooks, AI indexing) read from the table; a bus can be introduced behind
the same emit function.

**Consequences:** Event volume grows unbounded — add partitioning or pruning
when it matters. Emit is best-effort (never throws into request flow).
