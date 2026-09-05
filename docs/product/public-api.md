# Wamiro Public API — versioning & rate limits

Phase D brings a *platform-grade* API envelope: every response and error is
versioned, and every tenant gets predictable shared rate limits that hold
across multiple app instances (the counters live in Postgres, not per-process
memory).

## Versioning

- **One live version today: `v1`.** All routes are namespaced under
  `/api/v1/…`.
- Every response (success **and** error) carries an explicit
  `X-Api-Version: 1` header so clients can assert the contract they are
  speaking before parsing the body.
- **Evolution policy**
  - *Additive* changes (new fields, new endpoints, new optional query
    params) land inside `v1` and are documented here.
  - *Breaking* changes (renamed fields, removed endpoints, changed status
    semantics) are introduced as `v2`; `v1` keeps working for at least one
    quarter after `v2` ships.
  - Migrations between versions are announced on the platform console and by
    email to workspace admins.

### Endpoint categories

| Path prefix | Auth | Purpose |
|---|---|---|
| `/api/v1/auth/*` | none (login/register/SSO) | session entry points — IP rate limited |
| `/api/v1/org/*`, `/api/v1/admin/*` | session | workspace administration |
| `/api/v1/{module}/*` | session | authenticated product APIs (people, leave, payroll, tickets, …) |
| `/api/v1/webhooks` + `/api/v1/scim/v2` | per-org secret | integrations (webhook receipts, SCIM provisioning) |

## Rate limits (per tenant)

The `/api/v1` envelope applies **fixed-window, per-tenant** limits on
mutating calls (POST/PUT/PATCH/DELETE) so no single company can starve the
instance — and the counters are DB-backed, so limits hold when the app is
scaled horizontally.

| Bucket | Scope | Default | Window | Env override |
|---|---|---|---|---|
| Org mutations | per `organization_id` | 600 | 60 s | `RATE_LIMIT_ORG_PER_MIN` |
| Login attempts | per IP | 40 | 15 min | `RATE_LIMIT_AUTH_PER_15MIN` |
| Registrations | per IP | 20 | 1 h | `REGISTER_RATE_LIMIT_PER_HOUR` |

A limit hit returns:

```json
{ "error": { "code": "rate_limited", "message": "Too many requests. Try again shortly.", "request_id": "…" } }
```

with HTTP `429` and `Retry-After` implied by the window. Reads (GET/HEAD) are
not counted against the org bucket to keep the hot path cheap; abuse controls
for reads are part of the Phase F observability work.

> Internal APIs that are not yet safe for third parties (they are session- and
> origin-bound) stay under `/api/v1` but are documented as *private* until the
> Phase E "public API" hardening (typed keys, webhook-style signatures).
