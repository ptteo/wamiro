-- Migration 0054 — Phase 1 identity (invitation tokens, lockout, org policies)
-- Additive + idempotent per ADR-004.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS allowed_email_domains jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS mfa_mode text NOT NULL DEFAULT 'optional';
--> statement-breakpoint
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS password_mode text NOT NULL DEFAULT 'self_service';
--> statement-breakpoint
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS onboarding_state text NOT NULL DEFAULT 'complete';
--> statement-breakpoint
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS invitation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  email text NOT NULL,
  name text NOT NULL,
  role_key text NOT NULL,
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  manager_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS invitation_tokens_hash_key ON invitation_tokens (token_hash);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS invitation_tokens_org_idx ON invitation_tokens (organization_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS invitation_tokens_email_idx ON invitation_tokens (organization_id, email);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_hash_key ON password_reset_tokens (token_hash);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens (user_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS password_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS password_change_requests_org_idx ON password_change_requests (organization_id, status);
--> statement-breakpoint

-- Existing system roles: managers invite their line; HR/admin invite company-wide.
INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, 'team.invite', 'TEAM'
FROM roles r
WHERE r.key = 'manager'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission = 'team.invite' AND rp.scope::text = 'TEAM'
  );
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, 'team.invite', 'COMPANY'
FROM roles r
WHERE r.key IN ('hr_admin', 'admin')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission = 'team.invite' AND rp.scope::text = 'COMPANY'
  );
