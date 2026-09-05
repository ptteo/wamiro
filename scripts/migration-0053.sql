-- Migration 0053 — Phase F: reliability & observability
-- Additive + idempotent per ADR-004.
--
--   platform_job_runs   one row per background job (SLA sweep, trial sweep,
--                       request escalation, governance sweep, mailbox poll).
--                       The jobs worker upserts on every run; /api/v1/health
--                       reads it to report worker freshness, so a stalled
--                       scheduler surfaces in uptime monitoring.

CREATE TABLE IF NOT EXISTS platform_job_runs (
  job text PRIMARY KEY,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  ok boolean NOT NULL DEFAULT false,
  detail jsonb
);
