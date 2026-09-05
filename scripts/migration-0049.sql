-- Migration 0049 — Enterprise trust pack (Phase C)
-- Additive + idempotent per ADR-004.
--
--   webhooks      outgoing signed events (HMAC-SHA256) to customer systems
--   sso_configs   per-org SSO (oidc) configuration
--   sso_states    one-time authorization states for the OIDC flow
--   organizations.scim_token_hash / scim_enabled — SCIM 2.0 provisioning

CREATE TABLE IF NOT EXISTS webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  secret text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  last_status integer,
  last_error text,
  last_delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhooks_org_idx ON webhooks(organization_id, active);

CREATE TABLE IF NOT EXISTS sso_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  provider text NOT NULL DEFAULT 'oidc',          -- oidc | saml (saml stored, execution via IdP bridge)
  issuer text NOT NULL,
  client_id text,
  client_secret text,
  discovery_url text,
  -- SAML-only fields (stored for reference until the IdP bridge lands)
  metadata_url text,
  enabled boolean NOT NULL DEFAULT false,
  jit_provision boolean NOT NULL DEFAULT false,   -- auto-create users on first login
  default_role_key text NOT NULL DEFAULT 'employee',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sso_configs_org_unique UNIQUE (organization_id)
);
CREATE INDEX IF NOT EXISTS sso_configs_enabled_idx ON sso_configs(enabled);

CREATE TABLE IF NOT EXISTS sso_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nonce text NOT NULL,
  code_verifier text,          -- PKCE verifier (plaintext, one-time, 10-min TTL)
  redirect_to text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sso_states_expiry_idx ON sso_states(expires_at);

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS scim_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scim_token_hash text;