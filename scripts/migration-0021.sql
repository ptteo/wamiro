-- Wamiro migration 0021: discussions, replies, shared comments, pinned surveys.
-- Idempotent-ish: safe to re-run.

CREATE TABLE IF NOT EXISTS discussions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'company',
  scope_id uuid,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS discussions_org_idx ON discussions USING btree (organization_id, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS discussion_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discussion_id uuid NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS replies_discussion_idx ON discussion_replies USING btree (discussion_id, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  body text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS comments_entity_idx ON comments USING btree (entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS comments_user_idx ON comments USING btree (user_id);
--> statement-breakpoint
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
