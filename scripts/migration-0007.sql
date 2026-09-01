-- Wamiro migration 0007: TOTP MFA columns on users.
-- No backfill needed (defaults apply). Idempotent.

ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret text;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled boolean NOT NULL DEFAULT false;
