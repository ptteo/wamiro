-- Migration 0062 — Admin panel Phase A: usage metering
-- Additive + idempotent per ADR-004.
--
--   platform.tenant_usage_daily  one row per org per day, rolled up from data
--                                Wamiro already writes (audit_logs, rate_limit_hits,
--                                memberships, file tables). Historical class:
--                                soft org reference + snapshots, so usage history
--                                survives tenant deletion.
--   plan / seat_price_cents      snapshot per row (fold-in #4) — makes the MRR
--                                waterfall exact from Phase A onward. Backfilled
--                                rows carry the org's CURRENT plan (historical
--                                plan changes before Phase A are unknowable).

CREATE TABLE IF NOT EXISTS platform.tenant_usage_daily (
  org_id uuid NOT NULL,
  org_name text NOT NULL DEFAULT '',
  org_slug text NOT NULL DEFAULT '',
  day date NOT NULL,
  plan text NOT NULL DEFAULT 'starter',
  seat_price_cents int NOT NULL DEFAULT 0,
  active_users int NOT NULL DEFAULT 0,      -- distinct audit actors that day (engagement proxy)
  logins int NOT NULL DEFAULT 0,            -- USER_LOGIN audit rows
  actions int NOT NULL DEFAULT 0,           -- audit rows that day
  by_module jsonb NOT NULL DEFAULT '{}',    -- {"tickets":12,"leave":5} action counts per feature area
  tickets_created int NOT NULL DEFAULT 0,
  leave_requests int NOT NULL DEFAULT 0,
  documents_stored int NOT NULL DEFAULT 0,  -- cumulative snapshot
  storage_bytes bigint NOT NULL DEFAULT 0,  -- cumulative snapshot
  mutations int NOT NULL DEFAULT 0,         -- Σ rate_limit_hits (org scope) that day; 0 before Phase A
  seats_active int NOT NULL DEFAULT 0,      -- cumulative snapshot
  PRIMARY KEY (org_id, day)
);
CREATE INDEX IF NOT EXISTS tenant_usage_daily_day_idx ON platform.tenant_usage_daily(day);
-- retention: job prunes rows older than 3 years
