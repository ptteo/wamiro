-- Migration 0047 — Multi-tenant commercialization & scale foundations
-- Additive + idempotent per ADR-004.
--
-- Adds the plan/subscription model to organizations so Wamiro can onboard and
-- operate many companies as a SaaS:
--   plan               starter | growth | scale (seat/entitlement tier)
--   billing_status     trial | active | past_due | cancelled
--   trial_ends_at      when the current trial period ends
--   seat_limit         override of the plan's seat limit (NULL = use plan)
--   billing_provider   provider key once payments are wired (stripe, paddle…)
--   billing_customer_id / billing_subscription_id  provider references
--
-- Existing tenants keep working: default plan 'starter', billing 'active'.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS seat_limit integer,
  ADD COLUMN IF NOT EXISTS billing_provider text,
  ADD COLUMN IF NOT EXISTS billing_customer_id text,
  ADD COLUMN IF NOT EXISTS billing_subscription_id text;

CREATE INDEX IF NOT EXISTS organizations_billing_status_idx ON organizations(billing_status);
CREATE INDEX IF NOT EXISTS organizations_trial_ends_idx ON organizations(trial_ends_at);