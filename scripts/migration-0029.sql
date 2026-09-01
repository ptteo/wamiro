-- Migration 0029 — admin role gains leave.approve (manage did not imply approve)
INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, 'leave.approve', 'COMPANY'::permission_scope
FROM roles r
WHERE r.key = 'admin' AND r.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission = 'leave.approve'
  );
