-- Wamiro migration 0010: company holidays for the calendar.
-- Idempotent-ish: safe to re-run.

CREATE TABLE IF NOT EXISTS holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  date date NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS holidays_org_date_key ON holidays USING btree (organization_id, date);
