-- Migration 0070 — G-18: system-generated governance obligations
-- Additive + idempotent per ADR-004.
--
-- source_key deduplicates obligations created by scheduled jobs (access-review
-- cadence): one open obligation per unique key, so re-running the sweep never
-- duplicates. Manual obligations keep NULL.

ALTER TABLE gov_obligations ADD COLUMN IF NOT EXISTS source_key text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS gov_obligations_source_key_idx
  ON gov_obligations USING btree (organization_id, source_key);
