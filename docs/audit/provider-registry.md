# Wamiro Provider Registry — R7

Authoritative mapping from product capability → provider, per
`docs/Wamiro_R&D_Master_Package/04_WAMIRO_OPEN_SOURCE_PROVIDER_REGISTRY.md`.
Code source of truth: `src/lib/providers/registry.ts` (booleans-only status at
`GET /api/v1/admin/integrations`, gated `settings.manage`).

## Hard rules honored

- Core platform requires **no paid API / SaaS / trial / vendor free tier**.
- AI is **optional** and OpenAI-compatible — the product is fully functional with it disabled (E2E asserts clean 403/503 handling).
- No SendGrid/Resend/Twilio/Auth0/Algolia/Pinecone/Sentry-class dependencies in core. Email = self-hosted SMTP; search = Postgres.

## Capability map

| Capability | Built-in (core) | Optional external adapter | License to verify | Status |
|---|---|---|---|---|
| hr | wamiro-people | Frappe HR sync (existing) | GPL obligations on integration | optional |
| itsm | wamiro-support | Zammad (existing) | AGPL — server-side API only, no client redistribution | optional |
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

Feature code imports domain services (`people`, `support`, `finance`, …) which
own their provider calls behind config probes (`frappeConfig()`,
`zammadConfig()`). The registry is now the single place a new adapter gets
plugged in; UI/admin surfaces read `registryStatus()` and never see secrets.

## Fallback contract (§6)

Every optional adapter degrades to its built-in implementation when
unconfigured or unhealthy (proven by E2E: Zammad-unconfigured returns a clean,
explained 400; AI unconfigured returns 503 with user-safe copy). Health/retry/
reconciliation land with each adapter's hardening pass.
