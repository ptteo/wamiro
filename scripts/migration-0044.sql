-- Migration 0044 — Phase 4: payroll engine
-- Salary components library, per-employee salary structures, monthly payroll
-- runs with computed payslips, employee bank details for remittance.
-- Additive and idempotent per ADR-004.

-- ---------- employee bank details (F4.4) ----------
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_account_no text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS ifsc_code text;

-- ---------- F4.1 salary components library ----------
CREATE TABLE IF NOT EXISTS salary_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'earning',        -- earning | deduction
  amount_type text NOT NULL DEFAULT 'fixed',   -- fixed | percent_of_basic
  default_amount numeric(14,2) NOT NULL DEFAULT 0,
  is_taxable boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS salary_components_org_name_type_key
  ON salary_components(organization_id, lower(name), type);
CREATE INDEX IF NOT EXISTS salary_components_org_idx ON salary_components(organization_id);

-- ---------- salary structures (per employee, versioned) ----------
CREATE TABLE IF NOT EXISTS salary_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  base numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft',        -- draft | active | superseded
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS salary_structures_org_idx ON salary_structures(organization_id);
CREATE INDEX IF NOT EXISTS salary_structures_org_status_idx ON salary_structures(organization_id, status);

CREATE TABLE IF NOT EXISTS salary_structure_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  structure_id uuid NOT NULL REFERENCES salary_structures(id) ON DELETE CASCADE,
  component_id uuid NOT NULL REFERENCES salary_components(id) ON DELETE RESTRICT,
  amount numeric(14,2),
  percent_of_basic numeric(6,2)
);

CREATE INDEX IF NOT EXISTS salary_structure_lines_structure_idx ON salary_structure_lines(structure_id);

-- ---------- F4.2 monthly payroll runs + payslips ----------
CREATE TABLE IF NOT EXISTS payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_label text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft',        -- draft | submitted | approved | paid
  currency text NOT NULL DEFAULT 'USD',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  paid_by uuid REFERENCES users(id) ON DELETE SET NULL,
  paid_at timestamptz
);

CREATE INDEX IF NOT EXISTS payroll_runs_org_idx ON payroll_runs(organization_id);
CREATE INDEX IF NOT EXISTS payroll_runs_org_status_idx ON payroll_runs(organization_id, status);

CREATE TABLE IF NOT EXISTS payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_code text,
  earnings jsonb NOT NULL DEFAULT '[]',
  deductions jsonb NOT NULL DEFAULT '[]',
  gross numeric(14,2) NOT NULL DEFAULT 0,
  total_deductions numeric(14,2) NOT NULL DEFAULT 0,
  net numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payslips_run_employee_key ON payslips(run_id, employee_user_id);
CREATE INDEX IF NOT EXISTS payslips_org_idx ON payslips(organization_id);
CREATE INDEX IF NOT EXISTS payslips_employee_idx ON payslips(employee_user_id);

-- ---------- permission backfill ----------
-- payroll.view_self → every org role (an employee always sees their own payslips)
-- payroll.manage   → hr_admin + admin (company-wide payroll administration)

INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, 'payroll.view_self', 'SELF'::permission_scope
FROM roles r
WHERE r.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission = 'payroll.view_self'
  );

INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, 'payroll.manage', 'COMPANY'::permission_scope
FROM roles r
WHERE r.key IN ('admin', 'hr_admin') AND r.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission = 'payroll.manage'
  );
