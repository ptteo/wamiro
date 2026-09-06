-- Migration 0056 — employee/admin leave cancellation
-- Additive + idempotent per ADR-004.

ALTER TYPE leave_status ADD VALUE IF NOT EXISTS 'cancel_requested';
