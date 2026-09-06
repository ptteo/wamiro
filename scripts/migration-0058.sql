-- Migration 0058 — Phase 4 GDPR: staged company deletion
-- Additive + idempotent per ADR-004.
--
-- delete-my-company becomes a two-step process: the admin requests deletion
-- (typed-confirm), the tenant is queued, and a jobs-worker sweep purges it
-- after the 7-day undo window unless the request was cancelled.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;
--> statement-breakpoint
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS deletion_requested_by uuid REFERENCES users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS deletion_confirm_text text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS organizations_deletion_due_idx
  ON organizations (deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL;