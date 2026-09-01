-- Wamiro migration 0009: teams.manage grant for HR Admins.
-- No schema changes (teams/team_members tables exist from 0001). Idempotent.

INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, g.permission, g.scope::permission_scope
FROM roles r
JOIN (VALUES
  ('hr_admin', 'teams.manage', 'COMPANY')
) AS g(key, permission, scope) ON g.key = r.key
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions rp
  WHERE rp.role_id = r.id
    AND rp.permission = g.permission
    AND rp.scope::text = g.scope
);
