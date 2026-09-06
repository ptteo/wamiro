-- Migration 0057 — Phase 4 RLS defense-in-depth
-- Additive + idempotent per ADR-004.
--
-- Row-level security on the hottest org-keyed tables. Policy:
--   app.org_id set to a tenant uuid  → only rows whose organization_id matches
--   app.org_id unset or ''           → trusted platform/operator context
--                                      (jobs worker, platform console, seeds,
--                                      tests, session loading, public routes)
-- Requests are scoped by src/lib/db.ts withTenantScope() (wired in the API
-- route wrapper). The module-level query discipline stays the primary wall;
-- this is the second, Postgres-enforced wall.
--
-- FORCE ROW LEVEL SECURITY is required: the app role owns these tables, and
-- RLS is bypassed for table owners unless forced.

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE employees FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON employees
  USING (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  );
--> statement-breakpoint
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE departments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON departments
  USING (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  );
--> statement-breakpoint
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE attendance_records FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON attendance_records
  USING (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  );
--> statement-breakpoint
ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE leave_types FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON leave_types
  USING (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  );
--> statement-breakpoint
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE leave_balances FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON leave_balances
  USING (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  );
--> statement-breakpoint
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE leave_requests FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON leave_requests
  USING (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  );
--> statement-breakpoint
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE requests FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON requests
  USING (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  );
--> statement-breakpoint
ALTER TABLE request_types ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE request_types FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON request_types
  USING (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  );
--> statement-breakpoint
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tickets FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tickets
  USING (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  );
--> statement-breakpoint
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON notifications
  USING (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  );
--> statement-breakpoint
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON documents
  USING (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  );
--> statement-breakpoint
ALTER TABLE knowledge_articles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE knowledge_articles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON knowledge_articles
  USING (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  );
--> statement-breakpoint
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON projects
  USING (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  );
--> statement-breakpoint
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tasks
  USING (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  );
--> statement-breakpoint
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE announcements FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON announcements
  USING (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.org_id', true), ''), '') = ''
    OR organization_id::text = current_setting('app.org_id', true)
  );