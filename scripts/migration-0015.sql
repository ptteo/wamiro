-- Wamiro migration 0015: asset inventory (GLPI-lite).
-- Idempotent-ish: safe to re-run.

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  serial_number text,
  notes text,
  assigned_to_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS assets_org_idx ON assets USING btree (organization_id);
CREATE INDEX IF NOT EXISTS assets_assignee_idx ON assets USING btree (assigned_to_user_id);
--> statement-breakpoint

-- Grants: everyone sees own assets; HR/Admin manage the inventory.
INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, g.permission, g.scope::permission_scope
FROM roles r
JOIN (VALUES
  ('employee', 'assets.view_self', 'SELF'),
  ('manager', 'assets.view_self', 'SELF'),
  ('hr_admin', 'assets.view_self', 'SELF'),
  ('hr_admin', 'assets.manage', 'COMPANY'),
  ('admin', 'assets.view_self', 'SELF'),
  ('admin', 'assets.manage', 'COMPANY'),
  ('ceo', 'assets.view_self', 'SELF')
) AS g(key, permission, scope) ON g.key = r.key
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions rp
  WHERE rp.role_id = r.id
    AND rp.permission = g.permission
    AND rp.scope::text = g.scope
);
