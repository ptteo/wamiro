-- Migration 0065 — Admin panel Phase F: entitlements + platform-operator roles
-- Additive + idempotent per ADR-004.
--
--   platform.org_entitlements  per-tenant switches: module kill-switches,
--                              seat caps, flags, api limits (§3.4). Values are
--                              cached in-process per org with a 60 s TTL — a
--                              kill-switch takes effect within ≤60 s, which is
--                              the documented contract (§8).
--   platform.platform_operators platform-team roles: viewer (read-only
--                              console) | operator (can act) | admin (manage
--                              operators, entitlements, destructive ops).
--                              platform_operators.user_id is the PK (§3.7).
--
-- Both are OPERATIONAL class: entitlements hard-FK the tenant (a deleted
-- tenant's overrides are meaningless), operator roles reference users.

CREATE TABLE IF NOT EXISTS platform.org_entitlements (
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key text NOT NULL,             -- 'module.tickets' | 'cap.seats' | 'flag.early_access' | 'limit.api_per_min'
  value text NOT NULL,           -- 'off' | 'on' | number
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, key)
);
CREATE INDEX IF NOT EXISTS org_entitlements_org_idx ON platform.org_entitlements(org_id);

CREATE TABLE IF NOT EXISTS platform.platform_operators (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer', -- viewer | operator | admin
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Bootstrap: every existing platform.admin holder becomes an 'admin' operator.
INSERT INTO platform.platform_operators (user_id, role)
SELECT u.id, 'admin'
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id
JOIN role_permissions rp ON rp.role_id = r.id
WHERE r.organization_id IS NULL AND rp.permission = 'platform.admin'
ON CONFLICT (user_id) DO NOTHING;
