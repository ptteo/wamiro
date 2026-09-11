-- Migration 0059 — Phase 3: Paddle self-serve billing
-- Additive + idempotent per ADR-004.
--
-- Seat overage policy, dunning clocks, webhook replay log, and invoice
-- history so Settings → Plan & Billing can upgrade, pay, and cancel
-- without a platform operator.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS seat_overage_policy text NOT NULL DEFAULT 'hard';
--> statement-breakpoint
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS billing_status_changed_at timestamptz;
--> statement-breakpoint
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS dunning_stage integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS billing_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS billing_events_org_idx
  ON billing_events (organization_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_invoice_id text NOT NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'paid',
  hosted_url text,
  billed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS billing_invoices_provider_key
  ON billing_invoices (provider_invoice_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS billing_invoices_org_billed_idx
  ON billing_invoices (organization_id, billed_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS organizations_past_due_idx
  ON organizations (billing_status, billing_status_changed_at)
  WHERE billing_status = 'past_due';
