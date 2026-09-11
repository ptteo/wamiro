-- Migration 0063 — Admin panel Phase C: CRM-lite (notes + touchpoints)
-- Additive + idempotent per ADR-004.
--
-- CRM-lite tables are OPERATIONAL class (§2.2): hard FK ON DELETE CASCADE —
-- notes and touchpoints belong to the tenant relationship and die with it.
-- The Tenant 360 timeline merges them with platform-side audit events
-- (plan changes, impersonation windows, status changes) into one feed.
-- Tenant-facing surfaces never read the platform schema.

CREATE TABLE IF NOT EXISTS platform.tenant_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  body text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenant_notes_org_idx
  ON platform.tenant_notes(org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS platform.tenant_touchpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind text NOT NULL,                      -- call | email | meeting | demo
  summary text NOT NULL,
  source text NOT NULL DEFAULT 'operator', -- operator | system
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenant_touchpoints_org_idx
  ON platform.tenant_touchpoints(org_id, occurred_at DESC);
