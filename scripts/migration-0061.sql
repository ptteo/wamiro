-- Migration 0061 — Admin panel B-fix: `platform` schema + unified billing ledger
-- Additive + idempotent per ADR-004.
--
-- The admin panel's own data moves into a dedicated `platform` schema,
-- physically namespaced apart from all tenant tables (panel never writes
-- tenant tables; tenants never read panel tables).
--
--   platform.billing_invoices  unified ledger (Paddle mirror + manual
--                              invoices): soft org reference + name/slug
--                              snapshots so revenue history survives tenant
--                              deletion; nullable provider_invoice_id lets
--                              manual invoices exist; number unique.
--   platform.billing_events    webhook idempotency log (moved from public).
--   platform.billing_payments  payment rows against invoices.
--   platform.billing_credits   goodwill credits (applied to manual invoices).
--   platform.destructive_ops   two-person rule: paid-subscription cancellation
--                              needs a second platform operator's approval.
--
-- The old public.billing_* tables are intentionally NOT dropped — the raw
-- runner replays every migration, and dropping would let 0059 resurrect them
-- empty on the next run. They become inert mirrors after the code cutover.
-- The INSERT..SELECT copies below are idempotent on replay.

CREATE SCHEMA IF NOT EXISTS platform;

-- ---------- unified invoice ledger (historical class: survives tenant deletion) ----------
CREATE TABLE IF NOT EXISTS platform.billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,                          -- soft reference (NULL if tenant later deleted)
  org_name text NOT NULL DEFAULT '',
  org_slug text NOT NULL DEFAULT '',
  number text NOT NULL,
  provider_invoice_id text,             -- nullable: manual invoices have none
  period_start date,
  period_end date,
  amount_cents bigint NOT NULL DEFAULT 0,
  currency char(3) NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'open',  -- draft | open | paid | void | uncollectible
  source text NOT NULL DEFAULT 'manual',-- manual | paddle
  hosted_url text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  paid_at timestamptz,
  lines jsonb NOT NULL DEFAULT '[]',
  pdf_key text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_invoices_number_key
  ON platform.billing_invoices(number);
CREATE UNIQUE INDEX IF NOT EXISTS billing_invoices_provider_key
  ON platform.billing_invoices(provider_invoice_id);
CREATE INDEX IF NOT EXISTS billing_invoices_org_issued_idx
  ON platform.billing_invoices(org_id, issued_at);

-- one-time copy from the shipped Paddle mirror (idempotent on replay)
INSERT INTO platform.billing_invoices
  (org_id, org_name, org_slug, number, provider_invoice_id, amount_cents, currency, status, source, hosted_url, issued_at, paid_at)
SELECT i.organization_id, o.name, o.slug, 'PDL-' || i.provider_invoice_id, i.provider_invoice_id,
       i.amount_cents, i.currency, i.status, 'paddle', i.hosted_url,
       COALESCE(i.billed_at, i.created_at),
       CASE WHEN i.status = 'paid' THEN COALESCE(i.billed_at, i.created_at) END
FROM public.billing_invoices i
JOIN public.organizations o ON o.id = i.organization_id
WHERE NOT EXISTS (
  SELECT 1 FROM platform.billing_invoices p WHERE p.provider_invoice_id = i.provider_invoice_id
);

-- ---------- webhook event log (moved; idempotent copy) ----------
CREATE TABLE IF NOT EXISTS platform.billing_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  org_id uuid,
  org_name text,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform.billing_events (event_id, event_type, org_id, payload, created_at)
SELECT e.event_id, e.event_type, e.organization_id, e.payload, e.created_at
FROM public.billing_events e
WHERE NOT EXISTS (
  SELECT 1 FROM platform.billing_events p WHERE p.event_id = e.event_id
);

-- ---------- payments + credits ----------
CREATE TABLE IF NOT EXISTS platform.billing_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES platform.billing_invoices(id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL,
  method text NOT NULL DEFAULT 'card',
  received_at timestamptz NOT NULL DEFAULT now(),
  provider_ref text,
  status text NOT NULL DEFAULT 'succeeded', -- succeeded | failed | refunded
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_payments_invoice_idx ON platform.billing_payments(invoice_id);

CREATE TABLE IF NOT EXISTS platform.billing_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  org_name text NOT NULL,
  amount_cents bigint NOT NULL,
  reason text NOT NULL,
  expires_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_credits_org_idx ON platform.billing_credits(org_id);

-- ---------- two-person rule for destructive subscription ops ----------
CREATE TABLE IF NOT EXISTS platform.destructive_ops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,                   -- cancel_subscription | delete_tenant
  org_id uuid NOT NULL,
  org_name text NOT NULL,
  org_slug text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  reason text NOT NULL,
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | approved | rejected | expired
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS destructive_ops_status_idx ON platform.destructive_ops(status, created_at);
CREATE INDEX IF NOT EXISTS destructive_ops_org_idx ON platform.destructive_ops(org_id);
