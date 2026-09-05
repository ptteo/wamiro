-- Migration 0052 — Phase E: platform console v2 (operate 100 companies)
-- Additive + idempotent per ADR-004.
--
--   impersonation_grants   tenant-granted, time-boxed consent for support
--                          impersonation; platform ops can never self-serve
--                          access to a tenant that has not opted in
--   impersonation_sessions immutable ledger of opened impersonation windows
--                          (carries the operator's "return" session hash so
--                          the console can restore it httpOnly-safe)
--   tickets.escalated_at   stamped when platform ops pull a tenant ticket
--                          (category 'platform') into the shared support
--                          queue; the stamp doubles as notify-once guard

-- ---------- support impersonation consent (tenant-granted) ----------
CREATE TABLE IF NOT EXISTS impersonation_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  granted_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operator_label text,
  reason text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS impersonation_grants_org_idx
  ON impersonation_grants(organization_id, revoked_at);
CREATE INDEX IF NOT EXISTS impersonation_grants_expiry_idx
  ON impersonation_grants(expires_at);

-- ---------- impersonation ledger (one row per opened window) ----------
CREATE TABLE IF NOT EXISTS impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid NOT NULL REFERENCES impersonation_grants(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  operator_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token_hash text NOT NULL,
  operator_return_token_hash text NOT NULL,
  reason text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS impersonation_sessions_token_key
  ON impersonation_sessions(session_token_hash);
CREATE INDEX IF NOT EXISTS impersonation_sessions_org_idx
  ON impersonation_sessions(organization_id, started_at);

-- ---------- platform support queue ----------
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS escalated_at timestamptz;
CREATE INDEX IF NOT EXISTS tickets_escalated_idx ON tickets(escalated_at);

-- Platform Super Admin must be able to reply to escalated tickets through the
-- native ticket engine (first-response stamping + requester notifications).
INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, 'tickets.manage', 'GLOBAL'::permission_scope
FROM roles r
WHERE r.organization_id IS NULL AND r.key = 'super_admin'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission = 'tickets.manage' AND rp.scope = 'GLOBAL'
  );
