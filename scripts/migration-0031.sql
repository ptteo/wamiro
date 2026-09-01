-- Migration 0031 — R2: an employee record is per (organization, person),
-- not per person globally. Same founder/employee across tenants must work.
DROP INDEX IF EXISTS employees_user_key;
CREATE UNIQUE INDEX IF NOT EXISTS employees_org_user_key ON employees (organization_id, user_id);
