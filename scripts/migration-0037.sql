-- Migration 0037 — D14 Workplace visitors
CREATE TABLE IF NOT EXISTS workplace_visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  host_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visit_date date NOT NULL,
  status text NOT NULL DEFAULT 'invited',
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wp_visitors_org_date_idx ON workplace_visitors (organization_id, visit_date);
