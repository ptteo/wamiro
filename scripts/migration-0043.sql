-- Migration 0043 — Phase 3: HR operations completion
-- Shift scheduling/rostering, attendance corrections, employee HR
-- documents, leave encashment + holiday wiring, permission backfill.
-- Additive and idempotent per ADR-004.

-- ---------- F3.1 shift types ----------
CREATE TABLE IF NOT EXISTS shift_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_minutes int NOT NULL,   -- minutes from midnight, e.g. 540 = 09:00
  end_minutes int NOT NULL,
  grace_minutes int NOT NULL DEFAULT 15,
  working_hours numeric(4,2) NOT NULL DEFAULT 8,
  color text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS shift_types_org_name_key
  ON shift_types(organization_id, lower(name));
CREATE INDEX IF NOT EXISTS shift_types_org_idx ON shift_types(organization_id);

-- one shift per employee per day; weekly repeat pattern kept for display / future automation
CREATE TABLE IF NOT EXISTS shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_type_id uuid NOT NULL REFERENCES shift_types(id) ON DELETE CASCADE,
  date date NOT NULL,
  recurrence jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS shift_assignments_org_user_date_key
  ON shift_assignments(organization_id, employee_user_id, date);
CREATE INDEX IF NOT EXISTS shift_assignments_org_date_idx
  ON shift_assignments(organization_id, date);

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS shift_type_id uuid REFERENCES shift_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS attendance_shift_idx ON attendance_records(shift_type_id);

-- ---------- F3.2 attendance corrections ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_correction_status') THEN
    CREATE TYPE attendance_correction_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_correction_type') THEN
    CREATE TYPE attendance_correction_type AS ENUM ('clock_in', 'clock_out', 'missing');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS attendance_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  record_date date NOT NULL,
  type attendance_correction_type NOT NULL,
  requested_in_at timestamptz,
  requested_out_at timestamptz,
  reason text NOT NULL,
  status attendance_correction_status NOT NULL DEFAULT 'pending',
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decided_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_corrections_org_status_idx
  ON attendance_corrections(organization_id, status);
CREATE INDEX IF NOT EXISTS attendance_corrections_org_employee_idx
  ON attendance_corrections(organization_id, employee_user_id);

-- ---------- F3.3 employee HR documents ----------
CREATE TABLE IF NOT EXISTS employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc_type text NOT NULL DEFAULT 'other',
  title text NOT NULL,
  file_key text NOT NULL,
  mime_type text,
  size_bytes bigint NOT NULL DEFAULT 0,
  expires_at date,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_documents_org_idx
  ON employee_documents(organization_id);
CREATE INDEX IF NOT EXISTS employee_documents_org_employee_idx
  ON employee_documents(organization_id, employee_user_id);

-- ---------- F3.4 leave encashment ----------
CREATE TABLE IF NOT EXISTS leave_encashments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
  days numeric(5,1) NOT NULL,
  rate numeric(12,2),          -- per-day payout, decided by the approver
  amount numeric(12,2),        -- days * rate, computed on approval
  reason text,
  status leave_status NOT NULL DEFAULT 'pending',
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decided_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leave_encashments_org_status_idx
  ON leave_encashments(organization_id, status);
CREATE INDEX IF NOT EXISTS leave_encashments_org_employee_idx
  ON leave_encashments(organization_id, employee_user_id);

-- ---------- permission backfill ----------
-- shifts.view  → employee base (SELF semantics in service)
-- shifts.manage → hr_admin + admin
-- attendance.correct → manager (TEAM) + hr_admin + admin (COMPANY)
-- hr documents: no new keys — employees.edit (COMPANY, hr_admin + admin) manages,
--   and every member already holds documents.view for self-service reads.

INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, 'shifts.view', 'SELF'::permission_scope
FROM roles r
WHERE r.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission = 'shifts.view'
  );

INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, 'shifts.manage', 'COMPANY'::permission_scope
FROM roles r
WHERE r.key IN ('admin', 'hr_admin') AND r.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission = 'shifts.manage'
  );

INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, 'attendance.correct', CASE WHEN r.key = 'manager' THEN 'TEAM'::permission_scope ELSE 'COMPANY'::permission_scope END
FROM roles r
WHERE r.key IN ('admin', 'hr_admin', 'manager') AND r.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission = 'attendance.correct'
  );
