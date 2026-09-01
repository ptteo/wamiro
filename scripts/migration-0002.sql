-- Wamiro migration 0002: generic Request Center tables + role grant backfill.
-- Idempotent-ish: safe to re-run.

CREATE TABLE request_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  fields jsonb NOT NULL DEFAULT '[]',
  approver_mode text NOT NULL DEFAULT 'manager',
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX request_types_org_key ON request_types USING btree (organization_id, key);
--> statement-breakpoint

CREATE TABLE requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type_id uuid NOT NULL REFERENCES request_types(id) ON DELETE RESTRICT,
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  status leave_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamp with time zone,
  review_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX requests_org_status_idx ON requests USING btree (organization_id, status);
CREATE INDEX requests_requester_idx ON requests USING btree (requester_id);
--> statement-breakpoint

-- Backfill: grant requests.apply / approve to existing tenants' system roles
INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, 'requests.apply', 'SELF'
FROM roles r
WHERE r.key = 'employee'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission = 'requests.apply' AND rp.scope = 'SELF'
  );
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, g.permission, g.scope::permission_scope
FROM roles r
JOIN (VALUES
  ('manager', 'requests.approve', 'TEAM'),
  ('hr_admin', 'requests.approve', 'COMPANY'),
  ('admin', 'requests.approve', 'COMPANY'),
  ('ceo', 'requests.approve', 'COMPANY')
) AS g(key, permission, scope) ON g.key = r.key
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions rp
  WHERE rp.role_id = r.id
    AND rp.permission = g.permission
    AND rp.scope::text = g.scope
);
