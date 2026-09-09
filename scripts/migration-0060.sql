-- Migration 0060 — Phase 8: module depth sweep
-- Additive + idempotent per ADR-004.
--
-- One migration for the whole phase; every statement guards with IF NOT
-- EXISTS so re-runs and partially-migrated databases converge.

-- ─────────────────────────── Leave ───────────────────────────
-- Accrual: monthly accrual with optional carry-forward and encashment caps.
ALTER TABLE leave_types
  ADD COLUMN IF NOT EXISTS accrual_per_month numeric(5, 2);
--> statement-breakpoint
ALTER TABLE leave_types
  ADD COLUMN IF NOT EXISTS carry_forward_cap numeric(5, 1);
--> statement-breakpoint
ALTER TABLE leave_types
  ADD COLUMN IF NOT EXISTS encashment_cap_days numeric(5, 1);
--> statement-breakpoint
-- Half-day support on requests: 'full' (default) | 'first_half' | 'second_half'.
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS half_day text;
--> statement-breakpoint
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS half_day_date date;
--> statement-breakpoint
-- Holiday calendars per location: optional location tag on holidays.
ALTER TABLE holidays
  ADD COLUMN IF NOT EXISTS location text;

-- ─────────────────────────── Attendance ───────────────────────────
-- Auto-clockout policy + overtime: org-level settings on organizations.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS auto_clockout_hours integer;
--> statement-breakpoint
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS overtime_daily_minutes integer;
--> statement-breakpoint
-- Auto-clockout stamp on the record itself (who/when closed it).
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS auto_closed boolean NOT NULL DEFAULT false;

-- ─────────────────────────── Payroll ───────────────────────────
-- Pay schedule: monthly | semi_monthly. Arrears line + tax group per component.
ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS schedule text NOT NULL DEFAULT 'monthly';
--> statement-breakpoint
ALTER TABLE salary_components
  ADD COLUMN IF NOT EXISTS tax_group text;
--> statement-breakpoint
-- Arrears adjustments accrued outside runs, consumed by the next compute.
CREATE TABLE IF NOT EXISTS payroll_arrears (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount numeric(14, 2) NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending', -- pending | applied
  applied_run_id uuid REFERENCES payroll_runs(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payroll_arrears_org_idx
  ON payroll_arrears (organization_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payroll_arrears_employee_idx
  ON payroll_arrears (organization_id, employee_user_id);

-- ─────────────────────────── Tickets ───────────────────────────
-- Per-group SLA overrides + business-hours calendar.
ALTER TABLE ticket_groups
  ADD COLUMN IF NOT EXISTS sla_resolution_hours jsonb;
--> statement-breakpoint
ALTER TABLE ticket_groups
  ADD COLUMN IF NOT EXISTS sla_first_response_hours jsonb;
--> statement-breakpoint
ALTER TABLE ticket_groups
  ADD COLUMN IF NOT EXISTS business_hours jsonb;
--> statement-breakpoint
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS auto_close_resolved_days integer;
--> statement-breakpoint
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS auto_close_at timestamptz;

-- ─────────────────────────── Requests ───────────────────────────
-- Conditional fields: visibility rules on field defs (schema-level, jsonb).
-- Delegation auto-reply note on requests when decided by a delegate.
ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS decided_by_delegate boolean NOT NULL DEFAULT false;

-- ─────────────────────────── Knowledge ───────────────────────────
-- Version history + per-article permissions + helpful votes.
CREATE TABLE IF NOT EXISTS knowledge_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  editor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS knowledge_versions_article_idx
  ON knowledge_versions (article_id, created_at DESC);
--> statement-breakpoint
ALTER TABLE knowledge_articles
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'company';
--> statement-breakpoint
ALTER TABLE knowledge_articles
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS knowledge_votes (
  article_id uuid NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  helpful boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, user_id)
);

-- ─────────────────────────── Documents ───────────────────────────
-- Folders + expiry reminders (expiry already exists on employee_documents).
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS folder text NOT NULL DEFAULT 'General';
--> statement-breakpoint
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS expires_at date;
--> statement-breakpoint
ALTER TABLE employee_documents
  ADD COLUMN IF NOT EXISTS expiry_notified_at timestamptz;

-- ─────────────────────────── Work ───────────────────────────
-- Recurring tasks + project baselines.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS recurrence text;
--> statement-breakpoint
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS recurrence_next_date date;
--> statement-breakpoint
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS projected_due_date date;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS project_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Baseline',
  due_date date,
  task_count integer NOT NULL DEFAULT 0,
  estimated_minutes integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS project_baselines_project_idx
  ON project_baselines (project_id);

-- ─────────────────────────── Announcements ───────────────────────────
-- Scheduling + department audience targeting.
ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;
--> statement-breakpoint
ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments(id) ON DELETE CASCADE;

-- ─────────────────────────── Notifications ───────────────────────────
-- Per-type mute (thread level) — muted_threads on user preferences jsonb is
-- handled app-side; here we add the delivery channel filter column so the
-- digest can skip muted families efficiently. Kept as a no-op column for
-- future SQL-side filtering.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS thread_key text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notifications_thread_idx
  ON notifications (user_id, thread_key);

-- ─────────────────────────── Finance ───────────────────────────
-- Approval chains per amount threshold (rule-based, no ML).
CREATE TABLE IF NOT EXISTS finance_approval_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  min_amount_cents integer NOT NULL DEFAULT 0,
  max_amount_cents integer, -- null = infinity
  approver_mode text NOT NULL DEFAULT 'company', -- company | manager
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS finance_thresholds_org_idx
  ON finance_approval_thresholds (organization_id);

-- ─────────────────────────── Assets ───────────────────────────
-- Check-in/check-out history + warranty expiry.
CREATE TABLE IF NOT EXISTS asset_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  event_type text NOT NULL, -- assigned | returned | created
  user_id uuid REFERENCES users(id) ON DELETE SET NULL, -- subject of the event
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS asset_events_asset_idx
  ON asset_events (asset_id, created_at DESC);
--> statement-breakpoint
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS warranty_expires_at date;
--> statement-breakpoint
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS warranty_notified_at timestamptz;
