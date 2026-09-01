-- Wamiro migration 0022: support tickets & conversation.
-- Idempotent-ish: safe to re-run.

CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'new',
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  sla_due_date timestamp with time zone,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tickets_org_status_idx ON tickets USING btree (organization_id, status);
CREATE INDEX IF NOT EXISTS tickets_requester_idx ON tickets USING btree (requester_id);
CREATE INDEX IF NOT EXISTS tickets_assignee_idx ON tickets USING btree (assignee_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ticket_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS replies_ticket_idx ON ticket_replies USING btree (ticket_id, created_at);

-- SLA due date: urgent=4h, high=8h, medium=24h, low=48h from creation.
-- Applied at insert time by the service layer, not via DB trigger.
