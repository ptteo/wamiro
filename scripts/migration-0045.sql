-- Migration 0045 — Phase 5: HR & support analytics
-- employees.left_at (attrition source), index, and the tickets.sla_view
-- permission backfill for existing tenants. Additive + idempotent per ADR-004.

-- ---------- attrition source ----------
ALTER TABLE employees ADD COLUMN IF NOT EXISTS left_at date;
CREATE INDEX IF NOT EXISTS employees_left_at_idx ON employees (organization_id, left_at);

-- ---------- permission: tickets.sla_view (support analytics) ----------
-- Granted to the same roles that can manage tickets org-wide.
INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, 'tickets.sla_view', 'COMPANY'::permission_scope
FROM roles r
WHERE r.key IN ('admin', 'hr_admin', 'ceo') AND r.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission = 'tickets.sla_view'
  );