-- Migration 0035 — D14 Workplace core (resources + bookings)
CREATE TABLE IF NOT EXISTS workplace_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'room',
  name text NOT NULL,
  location text,
  capacity integer,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wp_resources_org_idx ON workplace_resources (organization_id, kind);

CREATE TABLE IF NOT EXISTS workplace_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES workplace_resources(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'booked',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wp_bookings_resource_idx ON workplace_bookings (resource_id, starts_at);
CREATE INDEX IF NOT EXISTS wp_bookings_user_idx ON workplace_bookings (user_id);

-- Workplace module + permissions for existing tenants
UPDATE organizations SET modules = COALESCE(modules, '{}'::jsonb) || '{"workplace": true}'::jsonb
WHERE modules IS NULL OR modules ? 'workplace' = false;

INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, g.permission, g.scope::permission_scope
FROM roles r
CROSS JOIN (VALUES ('workplace.view', 'COMPANY'), ('workplace.manage', 'COMPANY')) AS g(permission, scope)
WHERE r.key IN ('admin', 'hr_admin') AND r.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission = g.permission
  );

INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, 'workplace.book', 'SELF'
FROM roles r
WHERE r.key = 'employee' AND r.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission = 'workplace.book'
  );
