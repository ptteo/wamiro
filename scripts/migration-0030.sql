-- Migration 0030 — R2 multi-org identity
CREATE TABLE IF NOT EXISTS organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  joined_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS memberships_user_org_key ON organization_memberships (user_id, organization_id);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS active_organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

-- Backfill: every existing user is a member of their home org; live sessions pin it.
INSERT INTO organization_memberships (user_id, organization_id)
SELECT u.id, u.organization_id FROM users u
WHERE u.organization_id IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE sessions s
SET active_organization_id = u.organization_id
FROM users u
WHERE s.user_id = u.id AND s.active_organization_id IS NULL AND u.organization_id IS NOT NULL;
