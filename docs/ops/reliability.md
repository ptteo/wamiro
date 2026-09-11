# Wamiro reliability & observability (Phase F)

The operating contract for running Wamiro "without fail": scheduled workers,
backups with scheduled restore drills, health-based alerting, and the
deploy/migration discipline that keeps deploys zero-downtime.

## 1. Targets

| Target | Value | Verified by |
| --- | --- | --- |
| RPO (max data loss) | ≤ 24 h | RDS automated backups + WAL; nightly `pg_dump` belt-and-braces |
| RTO (max recovery time) | ≤ 2 h | Quarterly game-day (§5) |
| Background sweep cadence | ≤ 5 min lag | `/api/v1/health` jobs component + uptime alert |
| Deploy downtime | 0 | additive migrations (ADR-004) + systemd rolling restart |

## 2. Background jobs worker

One process runs every scheduled sweep against **all tenants**:

```
npm run jobs:worker        # loop, tick every JOBS_TICK_SECONDS (default 60)
npm run jobs:once          # run every job once and exit (cron/timer mode)
```

| Job | Cadence | Purpose |
| --- | --- | --- |
| `mailbox_poll` | 60 s | IMAP → tickets (skips cleanly if `imapflow` is absent) |
| `sla_sweep` | 5 min | ticket SLA recompute + one-time at-risk/breach notifications |
| `request_escalation` | 5 min | overdue request SLAs → escalated + manager notified |
| `trial_sweep` | 60 min | trial expiry → past_due (dunning) or starter downgrade |
| `governance_sweep` | 60 min | overdue compliance obligations → escalated + notified |

Every run is recorded in `platform_job_runs` (job, started/finished, ok,
detail). All sweeps are idempotent (notify-once stamps), so repeated or
overlapping runs are harmless. Per-org failures are logged and collected in
`detail.failures` — one broken tenant never blocks the fleet.

systemd unit `/etc/systemd/system/wamiro-jobs.service`:

```ini
[Unit]
Description=Wamiro background jobs
After=network.target wamiro.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/wamiro
EnvironmentFile=/opt/wamiro/.env
ExecStart=/usr/bin/npm run jobs:worker
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

`sudo systemctl enable --now wamiro-jobs`. **Replacing the old mail worker:**
this unit subsumes `npm run mail:worker` (mailbox_poll runs here) — disable the
old unit if it was enabled.

## 3. Health & alerting

`GET /api/v1/health` (unauthenticated) reports component statuses:

- `database` — hard gate (503 when down)
- `storage` — `WAMIRO_DATA_DIR` exists/writable (hard gate)
- `jobs` — `healthy | stale | unknown`; **stale fails readiness** once the
  worker has ever run on this DB (a stalled scheduler pages you). A DB where
  the worker has never run reports `unknown` (warn-only) unless
  `JOBS_HEALTH_REQUIRED=1` is set.

Alerting (free tier):

1. **UptimeRobot** — two monitors, 5-minute interval, alert on non-200:
   - Availability: `https://<host>/api/v1/health/live`
   - Components: `https://<host>/api/v1/health` (503 = db/storage/jobs stale)
   Public status page: `https://<host>/status` (same component model; no job internals).
2. **5xx spike watch** — example cron on the VM:
   ```bash
   */10 * * * * journalctl -u wamiro --since "-10 min" | grep -c '"status":5' | awk '$1>20{exit 1}' || echo "5xx spike on wamiro" | mail -s alert ops@example.com
   ```
3. **Unhandled exceptions** — GlitchTip email on new issues (`docs/ops/glitchtip.md`).
4. **Structured logs** — every request logs one JSON line (requestId, orgId,
   userId, status, durationMs); job runs log `job_finished` lines. Ship
   journald to any log sink; grep-able fields are stable.

## 4. Backups & restore drills

- **Nightly dump**: `scripts/backup.sh` → `/etc/cron.daily/wamiro-backup`
  (14-day local retention; copy off-box weekly, e.g. to R2 via `rclone`).
- **RDS automated backups**: enable + 7-day retention; WAL gives PITR.
- **Restore drill**: `node scripts/restore-drill.mjs` clones the live DB
  server-side (PG15 `STRATEGY WAL_LOG`) and verifies row-count parity across
  key tables. Run it **monthly, scheduled — not ad hoc**:

```
/etc/cron.d/wamiro-restore-drill
──────────────────────────────
0 4 3 * * ubuntu cd /opt/wamiro && /usr/bin/node --import tsx scripts/restore-drill.mjs >> /opt/backups/restore-drill.log 2>&1
```

A drill failure is an alert condition (pipe to mail/webhook like §3.2).

## 5. Game-day (quarterly) — the Phase F release gate

Do not pass the 50-company mark until a full game-day passes:

1. Announce window; snapshot current state (`platform_job_runs`, row counts).
2. **Kill the DB host**: stop/terminate the RDS instance (or detach network).
3. Restore: PITR to a new instance (or latest dump + WAL replay).
4. Repoint `DATABASE_URL`, restart `wamiro` + `wamiro-jobs`.
5. Verify: `/api/v1/health` 200; isolation suite against restored DB; login +
   create ticket + clock-in work; `platform_job_runs` resumes advancing.
6. Measure RTO and data-loss window against targets (§1); log findings.
7. Rollback plan: if restore fails, original instance is stopped (not
   deleted) — restart it and treat as a drill failure with a follow-up ticket.

## 6. Zero-downtime deploys

Migrations are **additive + idempotent** (ADR-004) — applied via
`npm run db:migrate:raw` before the new code starts, so old and new code both
work during the switch. For the rare destructive change:

1. **Expand** — additive migration adds the new column/table (shipped default
   keeps old code working).
2. **Migrate** — deploy code that writes both shapes; backfill via sweep.
3. **Contract** — only after N+1 release, a migration drops the old shape.

Never mix contract into the expand release. Update flow unchanged:
`git pull && npm ci && npm run build && npm run db:migrate:raw && systemctl restart wamiro wamiro-jobs`.

## 7. Abuse controls (Phase F summary)

- Shared DB-backed rate limiters (`rate_limit_hits`) — per-org envelope on all
  mutations (600/min default, `RATE_LIMIT_ORG_PER_MIN`), per-IP + per-account
  windows on login, per-IP on register.
- Invite spam guard: per-org invite window (`INVITE_RATE_LIMIT_PER_HOUR`,
  default 100/h) enforced before seat checks in the invite path.
- All counters survive restarts and are shared across instances (single-
  instance assumption no longer required for correctness).
