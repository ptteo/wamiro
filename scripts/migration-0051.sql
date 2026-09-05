-- Migration 0051 — Phase D: white-label, PWA push, shared rate limiting
-- Additive + idempotent per ADR-004.
--
--   organizations.custom_domain / custom_domain_verified
--       per-tenant white-label domain (CNAME to the platform). Verified
--       lazily the first time a request arrives on that host.
--   push_subscriptions
--       web-push subscriptions per user (VAPID + RFC 8291 aes128gcm).
--   rate_limit_hits
--       shared (DB-backed, multi-instance) fixed-window counters used by
--       the route wrapper and auth endpoints.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS custom_domain text,
  ADD COLUMN IF NOT EXISTS custom_domain_verified boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS organizations_custom_domain_key
  ON organizations(custom_domain) WHERE custom_domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS organizations_slug_lookup_idx ON organizations(slug);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,          -- base64url client public key
  auth text NOT NULL,            -- base64url client auth secret
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions(organization_id, user_id);

-- Fixed-window counters. window_start is the bucket's epoch-second start, so
-- (scope, key, window_start) is the natural key; expiry cleanup deletes old rows.
CREATE TABLE IF NOT EXISTS rate_limit_hits (
  scope text NOT NULL,           -- 'org' | 'ip' | 'key'
  key text NOT NULL,             -- org id / ip / arbitrary bucket key
  window_start bigint NOT NULL,  -- unix seconds
  count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (scope, key, window_start)
);
CREATE INDEX IF NOT EXISTS rate_limit_hits_expiry_idx ON rate_limit_hits(window_start);
