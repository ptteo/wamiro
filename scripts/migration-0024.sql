-- Wamiro migration 0024: tenant-teardown FK consistency.
-- users.organization_id and leave_requests.user_id were the only two FKs
-- created without an ON DELETE action (default RESTRICT), which made org
-- deletion and user deletion impossible once leave history existed. Every
-- other tenant-owned reference cascades; align these two.
-- Idempotent-ish: safe to re-run (DO blocks guard the drop/alter).

--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_organization_id_fkey'
      AND confdeltype = 'c'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_organization_id_fkey;
    ALTER TABLE users ADD CONSTRAINT users_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leave_requests_user_id_fkey'
      AND confdeltype = 'c'
  ) THEN
    ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_user_id_fkey;
    ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
