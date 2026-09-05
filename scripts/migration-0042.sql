-- Migration 0042 — it_records.created_by must not block user deletion.
-- Deleting (offboarding) an employee must never block on the incident/
-- problem/change history they created; organization_id cascade still
-- removes records when the whole tenant is deleted.

ALTER TABLE it_records ALTER COLUMN created_by DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'it_records_created_by_fkey') THEN
    ALTER TABLE it_records DROP CONSTRAINT it_records_created_by_fkey;
  END IF;
END $$;

ALTER TABLE it_records
  ADD CONSTRAINT it_records_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;