-- Wamiro migration 0003: documents (metadata only; bytes on disk/object store)
-- Idempotent-ish: safe to re-run alongside earlier migrations.

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'company',
  owner_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  size_bytes integer NOT NULL,
  storage_key text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX documents_org_created_idx ON documents USING btree (organization_id, created_at);
CREATE INDEX documents_owner_idx ON documents USING btree (owner_user_id);
--> statement-breakpoint

-- Backfill document permissions into existing tenants' system roles.
INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, g.permission, g.scope::permission_scope
FROM roles r
JOIN (VALUES
  ('employee', 'documents.view', 'COMPANY'),
  ('manager', 'documents.view', 'COMPANY'),
  ('hr_admin', 'documents.view', 'COMPANY'),
  ('hr_admin', 'documents.upload', 'COMPANY'),
  ('hr_admin', 'documents.manage', 'COMPANY'),
  ('admin', 'documents.view', 'COMPANY'),
  ('admin', 'documents.upload', 'COMPANY'),
  ('admin', 'documents.manage', 'COMPANY'),
  ('ceo', 'documents.view', 'COMPANY')
) AS g(key, permission, scope) ON g.key = r.key
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions rp
  WHERE rp.role_id = r.id
    AND rp.permission = g.permission
    AND rp.scope::text = g.scope
);
