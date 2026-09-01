-- Migration 0039 — D11/§100 AI tool allow-list (per-organization)
CREATE TABLE IF NOT EXISTS ai_tool_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  set_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_tool_policies_org_tool_key
  ON ai_tool_policies(organization_id, tool_name);

CREATE INDEX IF NOT EXISTS ai_tool_policies_org_idx
  ON ai_tool_policies(organization_id);

-- Seed defaults: every existing org gets an explicit policy row for each
-- tool the registry exposes. Confidential tools default to DISABLED so
-- the assistant can't expose them until an admin opts in. Internal
-- tools default to ENABLED. The assistant reads this on every turn.
INSERT INTO ai_tool_policies (organization_id, tool_name, enabled)
SELECT o.id, t.tool_name, t.enabled_by_default
FROM organizations o
CROSS JOIN (VALUES
  ('who_am_i',                        true),
  ('get_my_leave_balances',           true),
  ('get_my_pending_requests',         true),
  ('list_awaiting_my_approval',       true),
  ('search_company_knowledge',        true),
  ('get_recent_announcements',        true),
  ('get_workforce_overview',          false)  -- sensitive workforce data
) AS t(tool_name, enabled_by_default)
ON CONFLICT (organization_id, tool_name) DO NOTHING;
