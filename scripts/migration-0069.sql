-- Migration 0069 — G-17: per-tenant workweek for payroll proration
-- Additive + idempotent per ADR-004.
--
-- prorationFactor hardcoded EXTRACT(ISODOW) < 6 (Mon–Fri). Middle-East
-- (Sun–Thu) and other calendars mis-prorate payroll. workweek_days stores ISO
-- day numbers as text[] (1=Mon … 7=Sun); the default matches the old
-- hardcoded behavior, so existing tenants see zero change. Payroll reads the
-- array together with organizations.timezone (already present) so workdays
-- are evaluated in the tenant's own calendar.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS workweek_days text[] NOT NULL DEFAULT ARRAY['1','2','3','4','5'];
