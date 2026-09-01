-- Migration 0028 — employees directory: self-service contact fields
ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS address text;
