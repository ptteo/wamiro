-- Migration 0027 — E2E audit fixes:
-- 1) admin role gains people-ops + data.export (self-service admin parity with hr_admin)
-- 2) guarantee survey_votes unique key exists in every environment (drizzle schema declares it;
--    older DBs provisioned before that index get 42P10 on vote upsert)

INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, g.permission, g.scope::permission_scope
FROM roles r
CROSS JOIN (VALUES
  ('recruitment.manage', 'COMPANY'),
  ('lifecycle.manage', 'COMPANY'),
  ('performance.manage', 'COMPANY'),
  ('learning.manage', 'COMPANY'),
  ('hr.change_manage', 'COMPANY'),
  ('data.export', 'COMPANY')
) AS g(permission, scope)
WHERE r.key = 'admin' AND r.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission = g.permission
  );

CREATE UNIQUE INDEX IF NOT EXISTS survey_votes_key ON survey_votes (survey_id, user_id);
