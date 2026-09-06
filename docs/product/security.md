# Wamiro — Security Overview

This document states only controls that exist in the code and were verified
by the automated suites. Anything not listed here is not claimed.

## Verified in this release

| Control | Implementation | Verification |
|---|---|---|
| Transport | HTTPS enforced at reverse proxy; HSTS at proxy layer | deployment config |
| Password storage | scrypt with per-user random salt | `src/lib/password.test.ts` |
| Sessions | 256-bit random token; SHA-256 hash stored server-side; httpOnly + SameSite=Lax cookie; 14-day expiry; IP/UA recorded | `src/lib/session.ts` |
| Session revocation | Per-session and per-user revoke (admin); suspend deletes all user sessions immediately | `/admin/users/[id]`, `/admin/security` |
| MFA | TOTP (RFC 6238), ±30s skew, pending-token two-step login | `src/lib/totp.test.ts` |
| CSRF | Mutations require same-origin (`Origin` header check) | `src/lib/api.ts` route wrapper |
| Authorization | Central IAM engine: role grants + allow/deny overrides, scopes SELF→GLOBAL, deny > override > role | `src/modules/iam/engine.test.ts` (14 tests) |
| Tenant isolation | Every business table carries `organization_id`; all queries filter by session org; FK cascades for teardown | `src/tests/isolation.test.ts` (live cross-tenant suite) |
| SQL injection | Drizzle parameterized queries throughout; no string-built SQL with user input | code review + integration suite |
| Rate limiting | DB-backed fixed windows (`rate_limit_hits`) on login, register, and mutating APIs — shared across instances | `src/lib/ratelimit.ts` |
| SSO | OIDC + SCIM (org-level); password + TOTP remains the default | `/admin/security`, `src/modules/sso` |
| Secrets at rest | Mailbox IMAP passwords AES-256-GCM (`SECRET_KEY`); decrypt accepts legacy plaintext | `src/lib/secrets.ts` |
| Audit trail | Append-only `audit_logs` with actor, action, entity, old/new values, IP, request id; admin UI + CSV export | `/admin/audit` |
| Error hygiene | API errors return safe codes/messages; stack traces stay server-side; structured logs carry request id + tenant but never secrets | `src/lib/api.ts` |
| Module gating | Disabled modules remove rail/sidebar entries AND block routes/APIs server-side | `isModuleEnabled` checks |

## Platform-level authority

There is no hidden super-admin account. Platform operators use documented
roles inside a platform organization; every privileged action is auditable
through the same audit trail as customers.

## Known limitations (honest list)

- Email verification on invitation depends on SMTP being configured.
- Client IP is the first `X-Forwarded-For` hop — firewall port 3000 to Caddy
  only (see `docs/deploy-lightsail.md` / `docs/deploy-oracle.md`).
- `SECRET_KEY` is required in production to store new mailbox passwords.

## Reporting

Report suspected vulnerabilities to your Wamiro operator. Do not open public
tickets for security issues.
