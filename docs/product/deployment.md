# Wamiro — Deployment Guide

## Requirements

| Component | Requirement |
|---|---|
| Node.js | ≥ 20 LTS |
| PostgreSQL | ≥ 14 (managed RDS or self-hosted) |
| Object storage | S3-compatible bucket for document/knowledge attachments |
| Reverse proxy | TLS termination + HTTP→HTTPS redirect (Caddy/Nginx/ALB) |
| Email | SMTP credentials (invitations, notifications) |

## Environment variables

| Variable | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | yes |
| `SESSION_SECRET` | Session token signing secret (≥32 bytes random) | yes |
| `STORAGE_*` | Object storage endpoint/bucket/keys | if documents used |
| `SMTP_*` | Outbound email | if invitations used |
| `OPENAI_API_KEY` / provider key | AI chat + embeddings | optional |
| `FRAPPE_*` | Frappe HR integration | optional |
| `ZAMMAD_*` | Zammad helpdesk integration | optional |

Never commit `.env`. Provision secrets through your platform's secret store.

## First deployment

```bash
npm ci
npm run build          # compiles Next.js production bundle
node scripts/migrate.mjs   # applies pending migrations (idempotent)
npm start              # serves on $PORT (default 3000)
```

Health endpoints for your load balancer:

- `GET /api/v1/health/live` — process is up (no DB call)
- `GET /api/v1/health/ready` — DB reachable; returns version

## Updating

```bash
git pull
npm ci
npm run build
node scripts/migrate.mjs   # before switching traffic; additive-only migrations keep old code working during the switch
pm2 reload wamiro          # or your process manager's equivalent
node scripts/smoke-test.mjs --base-url https://your-host --email ... --password ...
```

## Rollback

Redeploy the previous release tag. Because migrations are additive and
idempotent, an older app version runs against a newer schema without data
loss. Destructive schema changes are split into two releases (expand then
contract).

## Backups

- **Database**: nightly automated snapshot + point-in-time window (RDS or
  `pg_dump` cron). Retain ≥ 30 days. Restore procedure: restore snapshot to a
  new instance, repoint `DATABASE_URL`, verify with the smoke test.
- **Object storage**: enable bucket versioning + replication per provider docs.
- **Verification**: a backup counts as real only after a tested restore. Run a
  restore drill quarterly; record the date and result.

## Monitoring

- Uptime probe against `/api/v1/health/ready`.
- Structured JSON logs on stdout (request id, tenant, user, route, status,
  duration, error category). Ship to your log aggregator.
- Audit trail inside the product: `/admin/audit` (exportable CSV).
