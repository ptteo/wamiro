-- Wamiro migration 0006: requests.manage grants (request-type administration).
-- No schema changes. Idempotent.

INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, g.permission, g.scope::permission_scope
FROM roles r
JOIN (VALUES
  ('hr_admin', 'requests.manage', 'COMPANY'),
  ('admin', 'requests.manage', 'COMPANY')
) AS g(key, permission, scope) ON g.key = r.key
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions rp
  WHERE rp.role_id = r.id
    AND rp.permission = g.permission
    AND rp.scope::text = g.scope
);
