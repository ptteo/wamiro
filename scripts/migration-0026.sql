-- Migration 0026 — D12 Finance & procurement + D13 People ops / HR lifecycle
-- Idempotent: CREATE TABLE IF NOT EXISTS + WHERE NOT EXISTS backfills.

-- ============ D12 ============

CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  contact_name text,
  contact_email text,
  status text NOT NULL DEFAULT 'pending',
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vendors_org_idx ON vendors (organization_id, name);

CREATE TABLE IF NOT EXISTS vendor_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  kind text NOT NULL DEFAULT 'other',
  expires_at date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vendor_docs_vendor_idx ON vendor_documents (vendor_id);

CREATE TABLE IF NOT EXISTS budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  period_label text NOT NULL,
  amount_cents bigint NOT NULL DEFAULT 0,
  currency char(3) NOT NULL DEFAULT 'USD',
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  spent_cents bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS budgets_org_idx ON budgets (organization_id, status);

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  amount_cents bigint NOT NULL,
  currency char(3) NOT NULL DEFAULT 'USD',
  incurred_at date NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  cost_center text,
  budget_id uuid REFERENCES budgets(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  travel_request_id uuid,
  receipt_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  reimbursed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expenses_org_status_idx ON expenses (organization_id, status);
CREATE INDEX IF NOT EXISTS expenses_submitter_idx ON expenses (submitted_by);

CREATE TABLE IF NOT EXISTS purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  justification text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  estimated_cents bigint NOT NULL DEFAULT 0,
  currency char(3) NOT NULL DEFAULT 'USD',
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  budget_id uuid REFERENCES budgets(id) ON DELETE SET NULL,
  needed_by date,
  po_number text,
  status text NOT NULL DEFAULT 'draft',
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchases_org_status_idx ON purchase_requests (organization_id, status);

CREATE TABLE IF NOT EXISTS travel_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  destination text NOT NULL,
  purpose text,
  depart_at date,
  return_at date,
  estimated_cents bigint NOT NULL DEFAULT 0,
  currency char(3) NOT NULL DEFAULT 'USD',
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS travel_org_status_idx ON travel_requests (organization_id, status);

-- ============ D13 ============

CREATE TABLE IF NOT EXISTS job_openings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  location text,
  employment_type text,
  openings integer NOT NULL DEFAULT 1,
  hiring_manager_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX IF NOT EXISTS jobs_org_status_idx ON job_openings (organization_id, status);

CREATE TABLE IF NOT EXISTS candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  opening_id uuid REFERENCES job_openings(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text,
  source text,
  stage text NOT NULL DEFAULT 'applied',
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidates_org_stage_idx ON candidates (organization_id, stage);

CREATE TABLE IF NOT EXISTS candidate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'note',
  payload jsonb,
  scheduled_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidate_events_candidate_idx ON candidate_events (candidate_id);

CREATE TABLE IF NOT EXISTS journeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  due_date date,
  status text NOT NULL DEFAULT 'open',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS journeys_org_kind_idx ON journeys (organization_id, kind, status);

CREATE TABLE IF NOT EXISTS journey_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  journey_id uuid NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'task',
  assignee_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  payload jsonb
);
CREATE INDEX IF NOT EXISTS journey_items_journey_idx ON journey_items (journey_id);

CREATE TABLE IF NOT EXISTS review_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  period_label text NOT NULL,
  self_due_at date,
  manager_due_at date,
  status text NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS review_cycles_org_idx ON review_cycles (organization_id, status);

CREATE TABLE IF NOT EXISTS review_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES review_cycles(id) ON DELETE CASCADE,
  employee_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  manager_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  self_achievements text,
  self_challenges text,
  self_goals text,
  manager_feedback text,
  manager_rating integer,
  outcome text,
  status text NOT NULL DEFAULT 'pending',
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS review_entries_cycle_idx ON review_entries (cycle_id);
CREATE INDEX IF NOT EXISTS review_entries_employee_idx ON review_entries (employee_user_id);

CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text,
  required boolean NOT NULL DEFAULT false,
  duration_mins integer,
  description text,
  status text NOT NULL DEFAULT 'published',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS courses_org_idx ON courses (organization_id, status);

CREATE TABLE IF NOT EXISTS course_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'assigned',
  due_at date,
  completed_at timestamptz,
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS enrollments_user_idx ON course_enrollments (user_id);
CREATE INDEX IF NOT EXISTS enrollments_course_idx ON course_enrollments (course_id);

CREATE TABLE IF NOT EXISTS recognitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message text NOT NULL,
  badge text NOT NULL DEFAULT 'thanks',
  visibility text NOT NULL DEFAULT 'company',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recognitions_org_created_idx ON recognitions (organization_id, created_at);

CREATE TABLE IF NOT EXISTS job_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  effective_at date,
  note text,
  status text NOT NULL DEFAULT 'proposed',
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_changes_user_idx ON job_changes (user_id);

CREATE TABLE IF NOT EXISTS profile_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  current_value text,
  requested_value text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profile_changes_user_idx ON profile_change_requests (user_id, status);

-- ============ Permission backfills for EXISTING tenants ============
-- New tenants get these via SYSTEM_ROLES templates; existing tenants via:
-- admin role gets finance management set; ceo gets finance visibility+approve;
-- hr_admin gets people-ops management set.

INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, p.permission, p.scope::permission_scope
FROM roles r
CROSS JOIN (VALUES
  ('finance.view_company', 'COMPANY'),
  ('finance.approve', 'COMPANY'),
  ('finance.reimburse', 'COMPANY'),
  ('finance.manage_vendors', 'COMPANY'),
  ('finance.manage_budgets', 'COMPANY'),
  ('finance.manage_procurement', 'COMPANY'),
  ('finance.export', 'COMPANY')
) AS p(permission, scope)
WHERE r.key = 'admin' AND r.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission = p.permission
  );

INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, p.permission, p.scope::permission_scope
FROM roles r
CROSS JOIN (VALUES
  ('finance.view_company', 'COMPANY'),
  ('finance.approve', 'COMPANY')
) AS p(permission, scope)
WHERE r.key = 'ceo' AND r.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission = p.permission
  );

INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, p.permission, p.scope::permission_scope
FROM roles r
CROSS JOIN (VALUES
  ('recruitment.manage', 'COMPANY'),
  ('lifecycle.manage', 'COMPANY'),
  ('performance.manage', 'COMPANY'),
  ('learning.manage', 'COMPANY'),
  ('hr.change_manage', 'COMPANY')
) AS p(permission, scope)
WHERE r.key = 'hr_admin' AND r.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission = p.permission
  );
