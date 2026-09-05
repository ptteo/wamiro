-- Migration 0048 — Activation analytics (Phase A)
-- Additive + idempotent per ADR-004.
--
-- users.last_active_at powers platform activation KPIs (7-day active users
-- and companies) without a dedicated analytics event stream. It is bumped
-- lazily and throttled (see session.ts) so per-request cost stays negligible.

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

CREATE INDEX IF NOT EXISTS users_last_active_idx ON users(last_active_at);