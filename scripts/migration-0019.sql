-- Wamiro migration 0019: employee-level custom fields.
-- Idempotent-ish: safe to re-run.

CREATE TABLE IF NOT EXISTS custom_field_defs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  type text NOT NULL DEFAULT 'text',
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS custom_field_defs_org_key ON custom_field_defs USING btree (organization_id, key);
--> statement-breakpoint
ALTER TABLE employees ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}';
