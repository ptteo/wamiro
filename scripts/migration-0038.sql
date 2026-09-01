-- Migration 0038 — D15 obligations: owner + escalation marker
ALTER TABLE gov_obligations ADD COLUMN IF NOT EXISTS escalated_at timestamptz;
