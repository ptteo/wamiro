# Wamiro — API Guide

Base URL: `<your-host>/api/v1`. All endpoints are JSON over HTTPS unless noted.

## Authentication

Session-cookie based. `POST /auth/login` sets an httpOnly session cookie;
subsequent requests include it automatically. Two-factor accounts complete a
second step with `mfaToken` + `totpCode`.

```bash
curl -c jar.txt -X POST https://host/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"you@company.com","password":"..."}'
curl -b jar.txt https://host/api/v1/me
```

## Conventions

- **Errors**: non-2xx responses carry `{ "error": { "code", "message", "request_id" } }`.
  Codes are stable (`unauthorized`, `forbidden`, `not_found`, `bad_request`,
  `conflict`, `rate_limited`, `internal_error`). `request_id` is what support
  asks for when investigating.
- **Permissions**: every endpoint declares the permission it needs; missing
  permission → `403 forbidden`.
- **Tenancy**: every request is scoped to the caller's organization. There is
  no tenant parameter — the session decides.
- **Idempotency**: `POST /requests` accepts an `Idempotency-Key` header to make
  retries safe.
- **Rate limits**: login is limited per IP and per account. Other mutations
  rely on same-origin enforcement.

## Endpoint map

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/logout`, `POST /auth/register` |
| Profile | `GET /me`, `GET/POST /me/mfa` |
| People | `GET /people`, `GET /people/:id/fields`, `GET /departments`, `GET /teams` |
| Work | `GET/POST /projects`, `GET/POST /tasks`, `PATCH/DELETE /tasks/:id`, `POST /tasks/:id/time`, `GET/POST /goals`, `POST /goals/:id/progress` |
| Requests | `GET/POST /requests`, `POST /requests/:id/review`, `GET/POST /request-types` |
| Attendance & leave | `POST /attendance/clock`, `GET/POST /leave`, `POST /leave/:id/review`, `GET /holidays` |
| Knowledge & docs | `GET/POST /knowledge`, `GET/PUT/DELETE /knowledge/:id`, `GET/POST /documents`, `GET/DELETE /documents/:id`, `GET /documents/:id/download` |
| Support | `GET/POST /tickets`, `GET/PATCH /tickets/:id`, `POST /tickets/:id/replies` |
| Communication | `GET/POST /announcements`, `GET/POST /discussions`, replies, acknowledgements, surveys, notifications read-all |
| Analytics & AI | `GET /analytics`, `GET /dashboards`, `POST /ai/chat` |
| Search | `GET /search?q=` — people, articles, documents, announcements, discussions |
| Administration | users (+ detail, roles, session revoke), roles, overrides, delegations, audit, access-reviews, custom-fields, export datasets, branding |
| Health | `GET /health/live`, `GET /health/ready` (no auth) |

## Versioning

The `/v1` prefix is the contract. Breaking changes ship under `/v2` with v1
kept for a deprecation window; additive fields may appear within v1 without
notice. Check `version` in `/health/ready` against your release notes.
