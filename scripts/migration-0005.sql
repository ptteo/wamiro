-- Wamiro migration 0005: analytics permission grants for existing tenants.
-- No schema changes. Idempotent.

INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, g.permission, g.scope::permission_scope
FROM roles r
JOIN (VALUES
  ('employee', 'analytics.view_self', 'SELF'),
  ('manager', 'analytics.view_self', 'SELF'),
  ('manager', 'analytics.view_team', 'TEAM'),
  ('hr_admin', 'analytics.view_self', 'SELF'),
  ('hr_admin', 'analytics.view_company', 'COMPANY'),
  ('admin', 'analytics.view_self', 'SELF'),
  ('admin', 'analytics.view_company', 'COMPANY'),
  ('ceo', 'analytics.view_self', 'SELF'),
  ('ceo', 'analytics.view_company', 'COMPANY')
) AS g(key, permission, scope) ON g.key = r.key
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions rp
  WHERE rp.role_id = r.id
    AND rp.permission = g.permission
    AND rp.scope::text = g.scope
);
