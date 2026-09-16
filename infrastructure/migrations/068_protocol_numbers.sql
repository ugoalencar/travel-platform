-- ============================================================
-- PROTOCOL / REFERENCE NUMBERS
-- ============================================================
-- Requested directly: "gera um conexão e um protocolo" -- reported
-- while asking about full customer registration. Confirmed there was
-- no reference/protocol number generated anywhere in the app for a
-- customer registration or a public enrollment submission -- a real
-- gap, not a discoverability issue. Sequential + year-prefixed so it
-- reads as a real registration number (e.g. CLI-2026-000123), not a
-- raw UUID fragment.
-- ============================================================

CREATE SEQUENCE customer_protocol_seq;
CREATE SEQUENCE enrollment_protocol_seq;

ALTER TABLE customers ADD COLUMN protocol_number TEXT;
ALTER TABLE enrollment_submissions ADD COLUMN protocol_number TEXT;

UPDATE customers
SET protocol_number = 'CLI-' || to_char(created_at, 'YYYY') || '-' || lpad(nextval('customer_protocol_seq')::text, 6, '0')
WHERE protocol_number IS NULL;

UPDATE enrollment_submissions
SET protocol_number = 'ENR-' || to_char(submitted_at, 'YYYY') || '-' || lpad(nextval('enrollment_protocol_seq')::text, 6, '0')
WHERE protocol_number IS NULL;

ALTER TABLE customers ALTER COLUMN protocol_number SET NOT NULL;
ALTER TABLE customers ADD CONSTRAINT customers_protocol_number_key UNIQUE (protocol_number);
ALTER TABLE customers ALTER COLUMN protocol_number SET DEFAULT
  ('CLI-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('customer_protocol_seq')::text, 6, '0'));

ALTER TABLE enrollment_submissions ALTER COLUMN protocol_number SET NOT NULL;
ALTER TABLE enrollment_submissions ADD CONSTRAINT enrollment_submissions_protocol_number_key UNIQUE (protocol_number);
ALTER TABLE enrollment_submissions ALTER COLUMN protocol_number SET DEFAULT
  ('ENR-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('enrollment_protocol_seq')::text, 6, '0'));

-- A sequence's nextval() privilege is NOT covered by the table-level
-- GRANTs the runtime role already holds (nor by "GRANT USAGE ON SCHEMA
-- public" from 001_initial_schema.sql) -- Postgres requires USAGE on
-- the sequence object itself. Without this, every INSERT into customers
-- or enrollment_submissions fails with 42501 (insufficient_privilege)
-- the moment the DEFAULT above tries to call nextval() as the app's
-- restricted runtime role. Confirmed by reproducing the failure locally.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_runtime_local') THEN
    GRANT USAGE ON SEQUENCE customer_protocol_seq, enrollment_protocol_seq TO travel_app_runtime_local;
  END IF;
END $$;
