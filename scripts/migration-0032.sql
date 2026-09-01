-- Migration 0032 — R5 personal user configuration (§17)
CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prefs_user_idx ON user_preferences (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS prefs_global_key ON user_preferences (user_id, key) WHERE organization_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS prefs_tenant_key ON user_preferences (user_id, organization_id, key) WHERE organization_id IS NOT NULL;
