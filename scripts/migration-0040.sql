-- Migration 0040 — native helpdesk SLA engine + CSAT (implementation-plan Phase 1)
-- First-response / resolution SLA tracking, breach state, and CSAT on tickets.
-- Additive and idempotent per ADR-004.

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS first_response_due_at timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS first_response_at timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_state text NOT NULL DEFAULT 'ok';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_warning_notified_at timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS breach_notified_at timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS csat_score int;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS csat_comment text;

CREATE INDEX IF NOT EXISTS tickets_sla_state_idx ON tickets(organization_id, sla_state);
CREATE INDEX IF NOT EXISTS tickets_sla_due_idx ON tickets(organization_id, sla_due_date);

-- Backfill a best-effort sla_state for pre-existing rows. Derived state is
-- recomputed authoritatively on every read; this is only for dashboard
-- queries and the "notified once" guards to behave on old data.
UPDATE tickets SET sla_state = CASE
  WHEN status = 'closed' THEN 'ok'
  WHEN status = 'resolved' THEN
    CASE WHEN resolved_at IS NOT NULL AND resolved_at <= sla_due_date THEN 'ok' ELSE 'breached' END
  WHEN sla_due_date IS NULL THEN 'ok'
  WHEN now() >= sla_due_date THEN 'breached'
  ELSE 'ok'
END
WHERE sla_state = 'ok';