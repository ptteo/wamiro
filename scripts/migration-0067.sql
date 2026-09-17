-- Migration 0067 — G-08 webhook delivery ledger + retries
-- Additive + idempotent per ADR-004.
--
-- Per-delivery rows give outgoing webhooks a retry schedule and a delivery
-- history (previously: failures overwrote webhook.last_status and were gone).
-- The jobs worker's webhook_retry_sweep drains pending rows with exponential
-- backoff; retention prunes the tail.

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  webhook_id uuid NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  delivery_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_status integer,
  last_error text,
  next_attempt_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  delivered_at timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS webhook_deliveries_due_idx
  ON webhook_deliveries USING btree (status, next_attempt_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS webhook_deliveries_org_idx
  ON webhook_deliveries USING btree (organization_id, created_at);
