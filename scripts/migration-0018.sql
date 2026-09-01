-- Wamiro migration 0018: automation rules (event-triggered notifications).
-- Idempotent-ish: safe to re-run.

CREATE TABLE IF NOT EXISTS automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  event_type text NOT NULL DEFAULT 'request.created',
  request_type_id uuid REFERENCES request_types(id) ON DELETE CASCADE,
  condition_field text,
  condition_op text NOT NULL DEFAULT 'gt',
  condition_value numeric(14,2),
  notify_emails text[] NOT NULL DEFAULT ARRAY[]::text[],
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS automation_rules_org_idx ON automation_rules USING btree (organization_id);
--> statement-breakpoint

-- Grants: Admins manage automations.
INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, 'automations.manage', 'COMPANY'
FROM roles r
WHERE r.key = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id
      AND rp.permission = 'automations.manage'
      AND rp.scope::text = 'COMPANY'
  );
