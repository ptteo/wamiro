-- Wamiro migration 0014: data.export grants for Admins (blueprint §103).
-- Idempotent.

INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, 'data.export', 'COMPANY'
FROM roles r
WHERE r.key = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id
      AND rp.permission = 'data.export'
      AND rp.scope::text = 'COMPANY'
  );
