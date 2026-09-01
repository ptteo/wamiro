-- Wamiro migration 0020: domain events + idempotency keys (Phase 1 §50/§51).
-- Idempotent-ish: safe to re-run.

CREATE TABLE IF NOT EXISTS domain_events (
  id bigserial PRIMARY KEY,
  organization_id uuid,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  actor_user_id uuid,
  payload jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS domain_events_org_idx ON domain_events USING btree (organization_id, created_at);
CREATE INDEX IF NOT EXISTS domain_events_type_idx ON domain_events USING btree (event_type);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response_status integer NOT NULL,
  response_body jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idempotency_created_idx ON idempotency_keys USING btree (created_at);
