-- Wamiro migration 0025: support-agent + executive visibility grants.
-- tickets.manage was defined in the catalog but seeded by no system role,
-- leaving tenants without any ticket agent. CEO gains analytics.view_company
-- (executive people overview) and the agent permission.
-- Idempotent: WHERE NOT EXISTS guards.

INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, g.permission, g.scope::permission_scope
FROM roles r
JOIN (VALUES
  ('hr_admin', 'tickets.manage', 'COMPANY'),
  ('admin', 'tickets.manage', 'COMPANY'),
  ('ceo', 'tickets.manage', 'COMPANY'),
  ('ceo', 'analytics.view_company', 'COMPANY')
) AS g(key, permission, scope) ON g.key = r.key
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions rp
  WHERE rp.role_id = r.id
    AND rp.permission = g.permission
    AND rp.scope::text = g.scope
);
