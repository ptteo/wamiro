-- Wamiro migration 0023: subtasks, saved views, approval delegations.
-- Idempotent-ish: safe to re-run.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES tasks(id) ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tasks_parent_idx ON tasks USING btree (parent_task_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace text NOT NULL,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS saved_views_key ON saved_views USING btree (user_id, workspace, name);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS approval_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  delegator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delegate_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  starts_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS delegation_delegator_idx ON approval_delegations USING btree (delegator_id, active);
