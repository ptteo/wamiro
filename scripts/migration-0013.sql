-- Wamiro migration 0013: policy acknowledgements (e-sign-lite).
-- Idempotent-ish: safe to re-run.

CREATE TABLE IF NOT EXISTS acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS acknowledgements_org_idx ON acknowledgements USING btree (organization_id, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS acknowledgement_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acknowledgement_id uuid NOT NULL REFERENCES acknowledgements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signature_name text NOT NULL,
  ip text,
  signed_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ack_signature_key ON acknowledgement_signatures USING btree (acknowledgement_id, user_id);
CREATE INDEX IF NOT EXISTS ack_signature_user_idx ON acknowledgement_signatures USING btree (user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS favorites (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  ref_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS favorites_key ON favorites USING btree (user_id, kind, ref_id);
CREATE INDEX IF NOT EXISTS favorites_user_idx ON favorites USING btree (user_id);
