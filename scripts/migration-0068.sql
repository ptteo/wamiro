-- Migration 0068 — G-12: normalize historic user emails to lowercase
-- Additive + idempotent per ADR-004.
--
-- users.email is globally unique while the product treats email as a cross-org
-- identity. Historic rows may have mixed case (CSV import pre-normalization,
-- legacy invites). This folds everything to lowercase to match the
-- application-layer normalizeEmail() contract. Idempotent: re-running is a
-- no-op once every row is already lowercase.

UPDATE users SET email = lower(email) WHERE email <> lower(email);
