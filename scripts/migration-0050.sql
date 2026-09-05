-- Migration 0050 — SSO identity metadata (Phase C follow-on)
-- Additive + idempotent per ADR-004.
--
--   users.auth_method  'password' | 'sso' — lets the login route reject
--                      password auth for SSO-managed identities (and vice
--                      versa: SSO callbacks skip password entirely).
--   users.sso_sub      subject claim from the last successful SSO login,
--                      stored so the IdP can be swapped without breaking
--                      account matching.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_method text NOT NULL DEFAULT 'password',
  ADD COLUMN IF NOT EXISTS sso_sub text;

CREATE INDEX IF NOT EXISTS users_sso_sub_idx ON users(sso_sub) WHERE sso_sub IS NOT NULL;