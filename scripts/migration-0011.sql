-- Wamiro migration 0011: time tracking entries per task.
-- Idempotent-ish: safe to re-run.

CREATE TABLE IF NOT EXISTS time_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  minutes integer NOT NULL,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS time_logs_task_idx ON time_logs USING btree (task_id);
CREATE INDEX IF NOT EXISTS time_logs_user_date_idx ON time_logs USING btree (user_id, log_date);
