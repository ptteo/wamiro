# Wamiro Provider Registry — R7

Authoritative mapping from product capability → provider, per
`docs/Wamiro_R&D_Master_Package/04_WAMIRO_OPEN_SOURCE_PROVIDER_REGISTRY.md`.
Code source of truth: `src/lib/providers/registry.ts`. Post-Phase-6 cutover,
HR and helpdesk are fully native (`active: null`, status `integrated`); the
Frappe/Zammad adapters and the admin status API were removed.

## Hard rules honored

- Core platform requires **no paid API / SaaS / trial / vendor free tier**.
- AI is **optional** and OpenAI-compatible — the product is fully functional with it disabled (E2E asserts clean 403/503 handling).
- No SendGrid/Resend/Twilio/Auth0/Algolia/Pinecone/Sentry-class dependencies in core. Email = self-hosted SMTP; search = Postgres.

## Capability map

| Capability | Built-in (core) | Optional external adapter | License to verify | Status |
|---|---|---|---|---|
| hr | wamiro-people (attendance, leave, payroll, shifts, corrections, documents, encashment) | — (Frappe adapter removed in Phase 6) | n/a | integrated |
| itsm | wamiro-support (tickets, SLA, catalog, IT records, email intake, groups, CSAT) | — (Zammad adapter removed in Phase 6) | n/a | integrated |
| storage | local-disk | MinIO (S3 API) at scale | AGPL-3.0 | integrated |
| search | postgres-ilike + permission-first ordering | Meilisearch for fuzzy/scale | MIT | integrated |
| email | SMTP | — | n/a | integrated |
| ai | none (feature-flagged) | OpenAI-compatible endpoint | provider ToS; never required | optional |
| identity | wamiro-auth (scrypt+TOTP) | Keycloak SSO adapter (future) | Apache-2.0 | integrated |
| projects | wamiro-work | — (OpenProject rejected: heavier than built-in per §29) | AGPL | integrated |
| documents | wamiro-documents | Paperless-ngx OCR (future) | GPL | integrated |
| analytics | wamiro-analytics | Metabase embed (evaluated later) | AGPL/edition check | integrated |
| calendar | planned D14 Workplace | Cal.com candidate | AGPL | planned |

## Abstraction rule (§5)

Feature code imports domain services (`people`, `support`, `finance`, …)
directly — every capability is a native module, so no config probes remain.
The registry stays as the single place a future adapter would be plugged in;
UI/admin surfaces read `registryStatus()` and never see secrets.

## Fallback contract (§6)

HR and helpdesk capabilities are native and always available — there is no
adapter to degrade. Optional capabilities (AI, email, storage at scale) still
degrade to their built-in implementation when unconfigured or unhealthy.
