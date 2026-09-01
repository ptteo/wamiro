-- Wamiro initial schema — mirrors src/db/schema.ts exactly.
-- Idempotent-ish: re-running skips "already exists" errors.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE org_status AS ENUM ('active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('invited', 'active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE employment_status AS ENUM ('active', 'on_leave', 'offboarding', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE leave_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE permission_scope AS ENUM ('SELF', 'TEAM', 'DEPARTMENT', 'COMPANY', 'GLOBAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE override_effect AS ENUM ('allow', 'deny');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  status org_status NOT NULL DEFAULT 'active',
  logo_url text,
  primary_color text NOT NULL DEFAULT '#4f46e5',
  secondary_color text NOT NULL DEFAULT '#0f172a',
  timezone text NOT NULL DEFAULT 'UTC',
  locale text NOT NULL DEFAULT 'en',
  currency text NOT NULL DEFAULT 'USD',
  date_format text NOT NULL DEFAULT 'YYYY-MM-DD',
  modules jsonb NOT NULL DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX organizations_slug_key ON organizations USING btree (slug);
--> statement-breakpoint

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  email text NOT NULL,
  password_hash text NOT NULL,
  name text NOT NULL,
  avatar_url text,
  status user_status NOT NULL DEFAULT 'active',
  last_login_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX users_email_key ON users USING btree (email);
CREATE INDEX users_org_idx ON users USING btree (organization_id);
--> statement-breakpoint

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  ip text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX sessions_token_key ON sessions USING btree (token_hash);
CREATE INDEX sessions_user_idx ON sessions USING btree (user_id);
--> statement-breakpoint

CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  parent_department_id uuid REFERENCES departments(id),
  manager_user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX departments_org_idx ON departments USING btree (organization_id);
--> statement-breakpoint

CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX teams_org_idx ON teams USING btree (organization_id);
--> statement-breakpoint

CREATE TABLE team_members (
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX team_members_key ON team_members USING btree (team_id, user_id);
CREATE INDEX team_members_user_idx ON team_members USING btree (user_id);
--> statement-breakpoint

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX roles_org_key ON roles USING btree (organization_id, key);
CREATE INDEX roles_org_idx ON roles USING btree (organization_id);
--> statement-breakpoint

CREATE TABLE role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission text NOT NULL,
  scope permission_scope NOT NULL DEFAULT 'COMPANY'
);
--> statement-breakpoint
CREATE UNIQUE INDEX role_permissions_key ON role_permissions USING btree (role_id, permission, scope);
--> statement-breakpoint

CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_by uuid,
  granted_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX user_roles_key ON user_roles USING btree (user_id, role_id);
CREATE INDEX user_roles_role_idx ON user_roles USING btree (role_id);
--> statement-breakpoint

CREATE TABLE user_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  permission text NOT NULL,
  effect override_effect NOT NULL,
  scope permission_scope NOT NULL DEFAULT 'COMPANY',
  reason text NOT NULL,
  granted_by uuid,
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- idempotent catch-up if an older copy of this table was already created
ALTER TABLE user_permission_overrides ADD COLUMN IF NOT EXISTS scope permission_scope NOT NULL DEFAULT 'COMPANY';
--> statement-breakpoint
CREATE INDEX overrides_user_idx ON user_permission_overrides USING btree (user_id);
--> statement-breakpoint

CREATE TABLE employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_code text,
  job_title text,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  manager_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  employment_type text NOT NULL DEFAULT 'full_time',
  status employment_status NOT NULL DEFAULT 'active',
  hired_at date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS employees_org_user_key ON employees (organization_id, user_id);
CREATE INDEX employees_org_idx ON employees USING btree (organization_id);
CREATE INDEX employees_manager_idx ON employees USING btree (manager_user_id);
--> statement-breakpoint

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  organization_id uuid,
  actor_user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  metadata jsonb,
  ip text,
  user_agent text,
  request_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX audit_org_created_idx ON audit_logs USING btree (organization_id, created_at);
CREATE INDEX audit_actor_idx ON audit_logs USING btree (actor_user_id);
--> statement-breakpoint

CREATE TABLE attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clock_in timestamp with time zone NOT NULL DEFAULT now(),
  clock_out timestamp with time zone,
  source text NOT NULL DEFAULT 'web',
  note text
);
--> statement-breakpoint
CREATE INDEX attendance_user_in_idx ON attendance_records USING btree (user_id, clock_in);
CREATE INDEX attendance_org_in_idx ON attendance_records USING btree (organization_id, clock_in);
CREATE UNIQUE INDEX attendance_open_key ON attendance_records USING btree (user_id) WHERE clock_out IS NULL;
--> statement-breakpoint

CREATE TABLE leave_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  annual_quota_days numeric(5,1) NOT NULL DEFAULT '20',
  paid boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX leave_types_org_idx ON leave_types USING btree (organization_id);
--> statement-breakpoint

CREATE TABLE leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  year integer NOT NULL,
  entitled_days numeric(5,1) NOT NULL DEFAULT '0',
  used_days numeric(5,1) NOT NULL DEFAULT '0'
);
--> statement-breakpoint
CREATE UNIQUE INDEX leave_balances_key ON leave_balances USING btree (user_id, leave_type_id, year);
--> statement-breakpoint

CREATE TABLE leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  leave_type_id uuid NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days numeric(5,1) NOT NULL,
  reason text,
  status leave_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamp with time zone,
  review_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX leave_req_org_status_idx ON leave_requests USING btree (organization_id, status);
CREATE INDEX leave_req_user_idx ON leave_requests USING btree (user_id);
--> statement-breakpoint

CREATE TABLE announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'company',
  published_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX announcements_org_published_idx ON announcements USING btree (organization_id, published_at);
--> statement-breakpoint

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX notifications_user_created_idx ON notifications USING btree (user_id, created_at);
CREATE INDEX notifications_unread_idx ON notifications USING btree (user_id) WHERE read_at IS NULL;
