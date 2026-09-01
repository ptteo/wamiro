-- Wamiro migration 0004: knowledge base articles.
-- Idempotent-ish: safe to re-run.

CREATE TABLE knowledge_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX knowledge_org_created_idx ON knowledge_articles USING btree (organization_id, created_at);
--> statement-breakpoint

-- Backfill knowledge permissions into existing tenants' system roles.
INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, g.permission, g.scope::permission_scope
FROM roles r
JOIN (VALUES
  ('employee', 'knowledge.view', 'COMPANY'),
  ('manager', 'knowledge.view', 'COMPANY'),
  ('hr_admin', 'knowledge.view', 'COMPANY'),
  ('hr_admin', 'knowledge.manage', 'COMPANY'),
  ('admin', 'knowledge.view', 'COMPANY'),
  ('admin', 'knowledge.manage', 'COMPANY'),
  ('ceo', 'knowledge.view', 'COMPANY')
) AS g(key, permission, scope) ON g.key = r.key
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions rp
  WHERE rp.role_id = r.id
    AND rp.permission = g.permission
    AND rp.scope::text = g.scope
);
