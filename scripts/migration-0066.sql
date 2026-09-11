-- Migration 0066 — Admin panel plan completion: contract registry + panel saved views
-- Additive + idempotent per ADR-004.
--
--   platform.contracts          fold-in #3 — enterprise deals bought OUTSIDE
--                               Paddle become first-class revenue: start/end,
--                               annual value, PO number, auto-renew, payment
--                               method. Feeds the §4.2 renewal forecast.
--                               HISTORICAL class (§2.2): soft org ref + name
--                               snapshots — contract/renewal history survives
--                               tenant deletion.
--   platform.panel_saved_views  fold-in #9 — saved filter combos persisted per
--                               operator SERVER-SIDE (the localStorage version
--                               didn't survive devices). Operational class on
--                               users: views die with the operator account.

CREATE TABLE IF NOT EXISTS platform.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,                           -- soft ref (NULL after tenant deletion)
  org_name text NOT NULL,
  org_slug text NOT NULL DEFAULT '',
  start_date date NOT NULL,
  end_date date,                         -- NULL = evergreen until cancelled
  annual_value_cents bigint NOT NULL DEFAULT 0,
  currency char(3) NOT NULL DEFAULT 'USD',
  po_number text,
  auto_renew boolean NOT NULL DEFAULT true,
  payment_method text NOT NULL DEFAULT 'bank', -- card | bank
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contracts_org_idx ON platform.contracts(org_id);
CREATE INDEX IF NOT EXISTS contracts_end_idx ON platform.contracts(end_date);

CREATE TABLE IF NOT EXISTS platform.panel_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  query text NOT NULL,                   -- filter expression, e.g. 'plan=growth status=trial'
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
