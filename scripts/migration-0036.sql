-- Migration 0036 — D15 Governance core
CREATE TABLE IF NOT EXISTS gov_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  effective_at date,
  review_at date,
  article_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gov_policies_org_idx ON gov_policies (organization_id, status);

CREATE TABLE IF NOT EXISTS gov_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text,
  impact text NOT NULL DEFAULT 'medium',
  likelihood text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  mitigation text,
  review_at date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gov_risks_org_idx ON gov_risks (organization_id, status);

CREATE TABLE IF NOT EXISTS gov_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'planned',
  result text NOT NULL DEFAULT 'not_tested',
  last_tested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gov_controls_org_idx ON gov_controls (organization_id);

CREATE TABLE IF NOT EXISTS gov_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  due_at date,
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gov_obligations_org_idx ON gov_obligations (organization_id, status);

-- Governance module + admin permissions for existing tenants
UPDATE organizations SET modules = COALESCE(modules, '{}'::jsonb) || '{"governance": true}'::jsonb
WHERE modules IS NULL;

INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, g.permission, g.scope::permission_scope
FROM roles r
CROSS JOIN (VALUES ('governance.view', 'COMPANY'), ('governance.manage', 'COMPANY')) AS g(permission, scope)
WHERE r.key = 'admin' AND r.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission = g.permission
  );
