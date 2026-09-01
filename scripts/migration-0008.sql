-- Wamiro migration 0008: projects + tasks ("My Work").
-- Idempotent-ish: safe to re-run.

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX projects_org_idx ON projects USING btree (organization_id, status);
--> statement-breakpoint

CREATE TABLE project_members (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX project_members_key ON project_members USING btree (project_id, user_id);
CREATE INDEX project_members_user_idx ON project_members USING btree (user_id);
--> statement-breakpoint

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'todo',
  priority text NOT NULL DEFAULT 'medium',
  assignee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  due_date date,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX tasks_org_status_idx ON tasks USING btree (organization_id, status);
CREATE INDEX tasks_assignee_idx ON tasks USING btree (assignee_id);
CREATE INDEX tasks_project_idx ON tasks USING btree (project_id);
--> statement-breakpoint

-- Backfill work permissions into existing tenants' system roles.
INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, g.permission, g.scope::permission_scope
FROM roles r
JOIN (VALUES
  ('employee', 'tasks.view_self', 'SELF'),
  ('employee', 'tasks.create', 'SELF'),
  ('employee', 'projects.view', 'COMPANY'),
  ('manager', 'tasks.view_team', 'TEAM'),
  ('manager', 'projects.create', 'COMPANY'),
  ('hr_admin', 'projects.manage', 'COMPANY'),
  ('admin', 'projects.manage', 'COMPANY'),
  ('ceo', 'projects.view', 'COMPANY')
) AS g(key, permission, scope) ON g.key = r.key
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions rp
  WHERE rp.role_id = r.id
    AND rp.permission = g.permission
    AND rp.scope::text = g.scope
);
