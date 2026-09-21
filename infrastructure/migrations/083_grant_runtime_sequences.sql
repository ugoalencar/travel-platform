-- Migration: Grant sequence USAGE to the production runtime role
-- Purpose: real gap found during Supabase PILOT provisioning (2026-09-20)
-- -- 068_protocol_numbers.sql granted USAGE on customer_protocol_seq and
-- enrollment_protocol_seq only to `travel_app_runtime_local` (the local
-- test role), never to `travel_app_runtime` (the real production/pilot
-- runtime role). Since local integration tests only ever exercise the
-- `_local` role, this was never caught until a real remote database was
-- provisioned and the runtime role actually used end to end.
--
-- Effect without this fix: every INSERT into customers or
-- enrollment_submissions fails with 42501 (insufficient_privilege) the
-- moment the column DEFAULT calls nextval() as the restricted runtime
-- role -- confirmed as the same class of failure documented in 068's own
-- comment, just never applied to the non-local role name.
--
-- 068 is left untouched (forward-only, applied migrations are immutable).
-- Direction: up

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_runtime') THEN
    GRANT USAGE ON SEQUENCE customer_protocol_seq, enrollment_protocol_seq TO travel_app_runtime;
  END IF;
END $$;

-- DROP: no safe automatic down -- revoking sequence USAGE from a live
-- runtime role would immediately break customer/enrollment creation.
