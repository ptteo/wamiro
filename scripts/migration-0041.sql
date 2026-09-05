-- Migration 0041 — Phase 2: helpdesk channel & catalog
-- Attachments, service catalog, IT records (incident/problem/change),
-- ticket groups + assignment rules, email-to-ticket mailboxes.
-- Additive and idempotent per ADR-004.

-- ---------- F2.1 ticket attachments ----------
CREATE TABLE IF NOT EXISTS ticket_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  reply_id uuid REFERENCES ticket_replies(id) ON DELETE SET NULL,
  file_key text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint NOT NULL DEFAULT 0,
  uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_attachments_ticket_idx ON ticket_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS ticket_attachments_org_idx ON ticket_attachments(organization_id);

-- ---------- F2.5 ticket groups + assignment rules ----------
CREATE TABLE IF NOT EXISTS ticket_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ticket_groups_org_name_key
  ON ticket_groups(organization_id, lower(name));

CREATE TABLE IF NOT EXISTS ticket_group_members (
  group_id uuid NOT NULL REFERENCES ticket_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS ticket_group_members_user_idx ON ticket_group_members(user_id);

CREATE TABLE IF NOT EXISTS assignment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  group_id uuid REFERENCES ticket_groups(id) ON DELETE SET NULL,
  category text,              -- matches ticket category when set; NULL = any
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assignment_rules_org_idx ON assignment_rules(organization_id, active);

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES ticket_groups(id) ON DELETE SET NULL;

-- ---------- F2.6 knowledge links on tickets ----------
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS related_knowledge_ids uuid[] NOT NULL DEFAULT '{}';

-- ---------- F2.3 service catalog ----------
CREATE TABLE IF NOT EXISTS service_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'other',
  icon text,
  expected_days int,
  approval_required boolean NOT NULL DEFAULT true,
  auto_create_ticket boolean NOT NULL DEFAULT false,
  request_type_id uuid REFERENCES request_types(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS service_items_org_idx ON service_items(organization_id, active);

-- default catalog for every existing org
INSERT INTO service_items (organization_id, name, description, category, icon, expected_days, approval_required, auto_create_ticket, sort_order)
SELECT o.id, s.name, s.description, s.category, s.icon, s.expected_days, s.approval_required, s.auto_create_ticket, s.sort_order
FROM organizations o
CROSS JOIN (VALUES
  ('Access request', 'Request access to a system, app or room.', 'access', 'key', 1, true, false, 10),
  ('Hardware request', 'Request a laptop, phone, monitor or peripheral.', 'hardware', 'laptop', 5, true, true, 20),
  ('Software request', 'Request a software license or installation.', 'software', 'download', 2, true, true, 30),
  ('Account request', 'Create, change or close an account.', 'accounts', 'user', 1, true, false, 40),
  ('Report a security concern', 'Report a suspected security issue.', 'security', 'shield', 0, false, true, 50)
) AS s(name, description, category, icon, expected_days, approval_required, auto_create_ticket, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM service_items si WHERE si.organization_id = o.id AND si.name = s.name
);

-- ---------- F2.4 IT records (incident / problem / change) ----------
CREATE TABLE IF NOT EXISTS it_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type text NOT NULL,          -- 'incident' | 'problem' | 'change'
  title text NOT NULL,
  description text,
  impact text,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'new',
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  affected_service text,
  window_start timestamptz,
  window_end timestamptz,
  risk text,
  ticket_ids uuid[] NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS it_records_org_type_idx ON it_records(organization_id, type);
CREATE INDEX IF NOT EXISTS it_records_org_status_idx ON it_records(organization_id, status);

-- ---------- F2.2 email-to-ticket mailboxes ----------
CREATE TABLE IF NOT EXISTS mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  imap_host text NOT NULL,
  imap_port int NOT NULL DEFAULT 993,
  imap_user text NOT NULL,
  imap_pass text NOT NULL,
  use_ssl boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mailboxes_org_idx ON mailboxes(organization_id);

-- dedupe ledger for ingested mail (message-key primary, mirrors app logic)
CREATE TABLE IF NOT EXISTS mailbox_messages (
  message_key text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  mailbox_id uuid REFERENCES mailboxes(id) ON DELETE SET NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mailbox_messages_org_idx ON mailbox_messages(organization_id);

-- ---------- permission backfill: services.manage for admin + hr_admin ----------
INSERT INTO role_permissions (role_id, permission, scope)
SELECT r.id, 'services.manage', 'COMPANY'::permission_scope
FROM roles r
WHERE r.key IN ('admin', 'hr_admin') AND r.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission = 'services.manage'
  );