-- Wamiro migration 0012: surveys & polls.
-- Idempotent-ish: safe to re-run.

CREATE TABLE IF NOT EXISTS surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  question text NOT NULL,
  options text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  closes_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS surveys_org_idx ON surveys USING btree (organization_id, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS survey_votes (
  survey_id uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_index integer NOT NULL,
  voted_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS survey_votes_key ON survey_votes USING btree (survey_id, user_id);
--> statement-breakpoint

-- Backfill: reuse announcements.manage as the survey-authoring permission.
INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, 'announcements.manage', 'COMPANY'
FROM roles r
WHERE r.key IN ('hr_admin', 'admin')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id
      AND rp.permission = 'announcements.manage'
      AND rp.scope::text = 'COMPANY'
  );
