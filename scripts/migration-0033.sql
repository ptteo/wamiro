-- Migration 0033 — R8: SLA + escalation on the generic request workflow
ALTER TABLE request_types ADD COLUMN IF NOT EXISTS sla_hours integer;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS sla_due_at timestamptz;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS escalated_at timestamptz;
