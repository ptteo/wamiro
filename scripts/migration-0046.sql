-- Migration 0046 — Zammad agent toolkit + Frappe HR gap-fill
-- Additive + idempotent per ADR-004.
--
-- Support (Zammad parity):
--   ticket_tags        free-form labels on tickets (unique per ticket+name)
--   ticket_time_entries agent time accounting on tickets
--   ticket_links       related/blocks/duplicates links between tickets
--   canned_responses   reusable reply snippets (text modules)
--   ticket_macros      predefined multi-step actions applied to a ticket
--
-- HR (Frappe parity):
--   salary_advances    employee salary advance requests; approved ones are
--                      auto-deducted by the payroll run computation
--   leave_types.auto_allocate — when true, annual quota is granted on hire
--                      and at each new year via reconcileAnnualAllocations

-- ---------- support: ticket tags ----------
CREATE TABLE IF NOT EXISTS ticket_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_tags_org_ticket_name UNIQUE (organization_id, ticket_id, name)
);
CREATE INDEX IF NOT EXISTS ticket_tags_ticket_idx ON ticket_tags(ticket_id);

-- ---------- support: time accounting ----------
CREATE TABLE IF NOT EXISTS ticket_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  minutes integer NOT NULL CHECK (minutes > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_time_ticket_idx ON ticket_time_entries(ticket_id, created_at);

-- ---------- support: ticket links ----------
CREATE TABLE IF NOT EXISTS ticket_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  linked_ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  -- 'related' | 'blocks' | 'duplicates'
  relation text NOT NULL DEFAULT 'related',
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_links_unique UNIQUE (organization_id, ticket_id, linked_ticket_id, relation),
  CONSTRAINT ticket_links_no_self CHECK (ticket_id <> linked_ticket_id)
);
CREATE INDEX IF NOT EXISTS ticket_links_ticket_idx ON ticket_links(ticket_id);
CREATE INDEX IF NOT EXISTS ticket_links_linked_idx ON ticket_links(linked_ticket_id);

-- ---------- support: canned responses (text modules) ----------
CREATE TABLE IF NOT EXISTS canned_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  body text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS canned_responses_org_idx ON canned_responses(organization_id, name);

-- ---------- support: macros ----------
CREATE TABLE IF NOT EXISTS ticket_macros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  -- JSON array of { op, value } actions:
  --   op: set_status | set_priority | assign | add_tag | add_reply | add_note
  --   value: status name | priority name | user id or "unassigned" | tag | body
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_macros_org_idx ON ticket_macros(organization_id, name);

-- ---------- HR: salary advances ----------
CREATE TABLE IF NOT EXISTS salary_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  reason text,
  -- pending | approved | rejected | recovered
  status text NOT NULL DEFAULT 'pending',
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS salary_advances_org_status_idx ON salary_advances(organization_id, status);
CREATE INDEX IF NOT EXISTS salary_advances_user_idx ON salary_advances(employee_user_id);

-- ---------- HR: leave auto-allocation flag ----------
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS auto_allocate boolean NOT NULL DEFAULT false;