-- Wamiro migration 0017: per-user pinned dashboard metrics (BI-lite).
-- Idempotent-ish: safe to re-run.

CREATE TABLE IF NOT EXISTS dashboard_widgets (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric_id text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS dashboard_widgets_key ON dashboard_widgets USING btree (user_id, metric_id);
