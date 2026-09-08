# Phase 5 — Platform ops completion

**Status:** Core shipped (GlitchTip ingest, `/status`, jobs card, My activity).  
**Error tracker:** **GlitchTip self-hosted.** No paid error SaaS.  
**Gate:** lint · typecheck · unit · isolation vs live DB · build · smoke. Additive migrations only (ADR-004).

## Goal

Operators see errors, worker health, and job last-runs without SSH. Customers see a public status page. Users see their own activity. Core product stays fully usable when GlitchTip is unset.

## Already in the product (do not rebuild)

| Piece | Where | Use as |
|---|---|---|
| Component health (`database` / `storage` / `jobs`) | `GET /api/v1/health` | Status page + UptimeRobot **component** probe |
| Process liveness | `GET /api/v1/health/live` | UptimeRobot **availability** probe |
| DB-only ready | `GET /api/v1/health/ready` | Orchestrator ping only — **does not** include storage/jobs today. Do not pretend it does. |
| Jobs ledger (last run **per job name**) | `platform_job_runs` PK `job`, upsert in `withLedger` | Console card. There is **no** run history table — do not invent “last N runs” without a new migration. |
| Per-org failures | `detail.failures` on `sla_sweep`, `request_escalation`, `governance_sweep` | Show as a list on those jobs only |
| Structured request logs | `src/lib/api.ts` | 5xx grep source; GlitchTip capture of unhandled 500s |
| Admin audit page + CSV | `/admin/audit`, `admin/export.ts` dataset `audit` | Leave as-is |
| Deploy uptime note | `docs/deploy-lightsail.md` §7, `docs/ops/reliability.md` §3 | Formalize paths; do not duplicate a second health API |
| `JOBS_HEALTH_REQUIRED` | health route | Status page honors the same rule |

## Locked decisions

1. **GlitchTip only.** Wamiro sends events to our GlitchTip URL when `GLITCHTIP_DSN` is set. Unset DSN → no-op, same pattern as unset `PADDLE_API_KEY`.
2. **Release string:** `GLITCHTIP_RELEASE` if set, else `wamiro@<package.json version>`. Deploy docs set it to that plus short git SHA when known.
3. **Public `/status` is dynamic**, server-rendered, calls the same component model as `GET /api/v1/health`. Show aggregate (operational / degraded / down) + three components. **Do not** dump `jobs.detail` (per-job internals) to the public internet.
4. **UptimeRobot:** one monitor on `/api/v1/health/live` (is the process up?) and one on `/api/v1/health` (200 vs 503 = components). 5xx watch stays the journalctl cron in `reliability.md` plus GlitchTip events. Do not invent a third health URL.
5. **Jobs card** = current ledger rows (one per job). “Failures per org” = `detail.failures` when present; global jobs show summary counts only. No history migration in this phase.
6. **My activity** = signed-in user’s own `audit_logs` (`actor_user_id = me`, same org). Friendly labels. Not the raw admin table.

## RAM / hosting (GlitchTip)

GlitchTip’s web process can sit around **~256 MB**. Official compose also wants Redis + Postgres. **Do not put the full stack on a 2 GB Lightsail next to `next build`.**

Preferred: **new database on existing RDS** + one Redis container + one GlitchTip container on the **4 GB** box, or a tiny second instance. 2 GB Wamiro-only box → GlitchTip lives elsewhere; Wamiro only gets `GLITCHTIP_DSN`.

Wamiro itself does not embed GlitchTip. It only sends events.

---

## Build

### 1. Error tracking — GlitchTip

**Env** (`.env.example`, never required):

```
# GlitchTip. Unset = errors stay in journald only.
GLITCHTIP_DSN=
GLITCHTIP_RELEASE=          # optional; default wamiro@package.json version
GLITCHTIP_ENVIRONMENT=production
```

**Code:**

- `src/instrument.ts` (or Next.js `instrumentation.ts`) — init the GlitchTip client when `GLITCHTIP_DSN` is set.
- Client init only if DSN present; no SDK calls on the hot path when unset.
- Hook the `api.ts` **unhandled** catch (the `internal_error` / 500 branch) → capture the exception. Pass `requestId`, `path`, `orgId`/`userId` when known.
- **Do not** send `ApiError` (4xx/expected 403/429) to GlitchTip.
- **Do not** send probes: ignore `/api/v1/health`, `/live`, `/ready`.
- Filter: drop `level:info` request logs; only exceptions + explicit captures for true 500s.

**Ops:** GlitchTip project alert → email on new **unhandled** issues. Document one-time Docker/RDS setup in `docs/ops/glitchtip.md` (compose, Caddy host `errors.example.com`, create project, copy DSN). Wamiro deploy: paste DSN, restart systemd.

**Quota:** unlimited on self-host. Still do not flood: no 429s, no health, no expected auth failures.

### 2. Status page — `/status`

- Public App Router page (no auth), no index of tenant data.
- Fetch `/api/v1/health` on the server (loopback or in-process helpers — prefer calling `pingDb` / `storageHealth` / `jobHealth` **once** rather than HTTP-to-self if easier; keep semantics identical to the JSON body).
- UI: overall pill + Database / Storage / Jobs. Jobs: `healthy | stale | unknown` only.
- `unknown` jobs + `JOBS_HEALTH_REQUIRED` unset → overall still operational (same as API).
- Link from login footer and Help (“System status”).
- No GlitchTip, no job failure strings, no org ids.

Optional tightening (same phase if cheap): make `/api/v1/health/ready` return 503 when `/health` would, so orchestrators and UptimeRobot “ready” match. If not done, docs must say **watch `/health` not `/ready` for component freshness**.

### 3. Uptime + 5xx — document, do not rebuild the endpoint

Update `docs/ops/reliability.md` and `docs/deploy-lightsail.md`:

| Monitor | URL | Alert |
|---|---|---|
| Availability | `GET /api/v1/health/live` | non-200 |
| Components | `GET /api/v1/health` | 503 (db/storage/jobs stale) |
| 5xx spike | journalctl cron (already written) | >20 status 5xx / 10 min |
| Exceptions | GlitchTip email | new issue |

UptimeRobot does **not** see a 500 that was turned into a handled 4xx. Real 500s are JSON `internal_error` with HTTP 500 — those hit both journald and GlitchTip.

### 4. Jobs dashboard — platform console

- `GET /api/v1/platform/jobs` — `platform.admin` only. `SELECT` all `platform_job_runs` (small, one row per job).
- Platform page card: job name, ok, started/finished, age vs `JOBS.*.everyMs`, `detail` summary. If `detail.failures` is a non-empty array, list it (truncated).
- Stale highlight using the same lag rule as `jobHealth()`.
- No SSH. No new table.

### 5. My activity

- Page: `/settings/activity` (next to Security). Any signed-in user.
- Query: `audit_logs` where `actor_user_id = ctx.user.id` and (`organization_id = ctx.org.id` OR both null only if we never mix — **never** show another org’s rows). Isolation test: user in A cannot see B.
- Cap 100 recent rows. Friendly map for a **subset**: logins, password/MFA, invites, leave apply/review, ticket create/reply, request review, clock in/out. Unknown actions: show a short generic line, do not dump JSON blobs to the UI.
- Admin export stays the system of record for full audit.

---

## Out of scope

- Paid error SaaS, wrapping every `console.error`.
- Job run **history** table / graphs.
- Public per-job internals on `/status`.
- Replacing UptimeRobot with GlitchTip uptime (GlitchTip is errors, not ICMP).
- Phase 6 motion, Phase 7 sidebar.

## Gate

- Unset `GLITCHTIP_DSN`: app boots, `/status` works, jobs card works, activity works.
- Set DSN: a thrown 500 in a test route (or forced `internal_error`) appears in GlitchTip with release tag; `/health` traffic does not.
- Isolation: activity query org-scoped.
- `GET /api/v1/platform/jobs` 403 without `platform.admin`.
- Docs list the two UptimeRobot URLs. Cost table: GlitchTip self-host.
