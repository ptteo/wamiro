-- Migration 0034 — R11/R13: hot-path indexes + abuse-guard follow-ups
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sessions_active_org_idx ON sessions (active_organization_id);
CREATE INDEX IF NOT EXISTS requests_org_status_idx ON requests (organization_id, status);
