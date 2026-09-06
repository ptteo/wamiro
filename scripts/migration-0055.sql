-- Migration 0055 — Phase 2 sample-data flags
-- Additive + idempotent per ADR-004.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS demo boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS demo boolean NOT NULL DEFAULT false;
