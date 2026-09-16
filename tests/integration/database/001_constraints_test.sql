-- Structural validation for migration 001.
-- Run only against the disposable local PostgreSQL database.

\set ON_ERROR_STOP on

DROP TABLE IF EXISTS local_test_results;
CREATE TEMP TABLE local_test_results (
  test_name TEXT PRIMARY KEY,
  expected TEXT NOT NULL,
  result TEXT NOT NULL,
  detail TEXT
);

CREATE OR REPLACE FUNCTION pg_temp.local_record_result(
  p_test_name TEXT,
  p_expected TEXT,
  p_result TEXT,
  p_detail TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO local_test_results (test_name, expected, result, detail)
  VALUES (p_test_name, p_expected, p_result, p_detail);
END;
$$;

INSERT INTO agencies (id, name, slug, cnpj, email, plan, status)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'Agency A', 'agency-a-local-test', '00000000000191', 'agency-a@example.test', 'FREE', 'ACTIVE'),
  ('20000000-0000-4000-8000-000000000001', 'Agency B', 'agency-b-local-test', '00000000000272', 'agency-b@example.test', 'FREE', 'ACTIVE');

INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
VALUES
  ('11000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'user-a@example.test', 'User A', 'OWNER', 'hash-for-local-test-only', 'ACTIVE'),
  ('21000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'user-b@example.test', 'User B', 'OWNER', 'hash-for-local-test-only', 'ACTIVE');

INSERT INTO brokers (id, agency_id, name, email, commission, status)
VALUES
  ('12000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Broker A', 'broker-a@example.test', 10, 'ACTIVE'),
  ('22000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Broker B', 'broker-b@example.test', 10, 'ACTIVE');

INSERT INTO customers (id, agency_id, name, email, cpf, status)
VALUES
  ('13000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Customer A', 'customer-a@example.test', '11144477735', 'ACTIVE'),
  ('23000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Customer B', 'customer-b@example.test', '22255588866', 'ACTIVE');

DO $$
DECLARE
  v_account_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_account_count
  FROM customer_accounts
  WHERE agency_id = '10000000-0000-4000-8000-000000000001'
    AND customer_id = '13000000-0000-4000-8000-000000000001';

  IF v_account_count = 0 THEN
    PERFORM pg_temp.local_record_result('Customer can exist without CustomerAccount', 'PASS', 'PASS');
  ELSE
    PERFORM pg_temp.local_record_result('Customer can exist without CustomerAccount', 'PASS', 'FAIL', 'Accounts: ' || v_account_count::TEXT);
  END IF;
END;
$$;

INSERT INTO offers (id, agency_id, name, price, status)
VALUES
  ('15000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Offer A', 5000.00, 'ACTIVE'),
  ('25000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Offer B', 6100.00, 'ACTIVE');

DO $$
BEGIN
  INSERT INTO wishes (id, agency_id, customer_id, destination, start_date, end_date, budget, travelers_count, status)
  VALUES ('14000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', 'Lisbon', DATE '2027-04-10', DATE '2027-04-20', 7000.00, 2, 'ACTIVE');
  PERFORM pg_temp.local_record_result('Wish valid for Customer A', 'PASS', 'PASS');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_result('Wish valid for Customer A', 'PASS', 'FAIL', SQLERRM);
END;
$$;

DO $$
BEGIN
  INSERT INTO wishes (id, agency_id, customer_id, destination, status)
  VALUES ('14000000-0000-4000-8000-0000000000ff', '10000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', 'Cross tenant', 'ACTIVE');
  PERFORM pg_temp.local_record_result('Wish Agency A -> Customer B', 'FAIL', 'PASS', 'Unexpectedly inserted');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_result('Wish Agency A -> Customer B', 'FAIL', 'FAIL', SQLSTATE || ' ' || SQLERRM);
END;
$$;

INSERT INTO proposals (id, agency_id, customer_id, offer_id, wish_id, user_id, proposed_price, discount, total, valid_until, conditions, notes, status)
VALUES
  ('16000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 5000.00, 0.00, 5000.00, now() + interval '7 days', 'Local test conditions', 'Snapshot should remain stable', 'SENT'),
  ('26000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', '25000000-0000-4000-8000-000000000001', NULL, '21000000-0000-4000-8000-000000000001', 6100.00, 0.00, 6100.00, now() + interval '7 days', 'Local test conditions', 'Agency B proposal', 'SENT');

DO $$
BEGIN
  INSERT INTO proposals (id, agency_id, customer_id, user_id, proposed_price, discount, total, status)
  VALUES ('16000000-0000-4000-8000-0000000000fe', '10000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 5000.00, 0.00, 5000.00, 'DRAFT');
  PERFORM pg_temp.local_record_result('Proposal Agency A -> Customer B', 'FAIL', 'PASS', 'Unexpectedly inserted');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_result('Proposal Agency A -> Customer B', 'FAIL', 'FAIL', SQLSTATE || ' ' || SQLERRM);
END;
$$;

DO $$
BEGIN
  INSERT INTO proposals (id, agency_id, customer_id, offer_id, user_id, proposed_price, discount, total, status)
  VALUES ('16000000-0000-4000-8000-0000000000ff', '10000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', '25000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 5000.00, 0.00, 5000.00, 'DRAFT');
  PERFORM pg_temp.local_record_result('Proposal Agency A -> Offer B', 'FAIL', 'PASS', 'Unexpectedly inserted');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_result('Proposal Agency A -> Offer B', 'FAIL', 'FAIL', SQLSTATE || ' ' || SQLERRM);
END;
$$;

INSERT INTO sales (id, agency_id, customer_id, proposal_id, broker_id, user_id, amount, discount, total, status)
VALUES
  ('17000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 5000.00, 0.00, 5000.00, 'CONFIRMED'),
  ('27000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 6100.00, 0.00, 6100.00, 'CONFIRMED');

DO $$
BEGIN
  INSERT INTO sales (id, agency_id, customer_id, proposal_id, user_id, amount, discount, total, status)
  VALUES ('17000000-0000-4000-8000-0000000000fe', '10000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 5000.00, 0.00, 5000.00, 'PENDING');
  PERFORM pg_temp.local_record_result('Sale Agency A -> Proposal B', 'FAIL', 'PASS', 'Unexpectedly inserted');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_result('Sale Agency A -> Proposal B', 'FAIL', 'FAIL', SQLSTATE || ' ' || SQLERRM);
END;
$$;

DO $$
BEGIN
  INSERT INTO sales (id, agency_id, customer_id, user_id, amount, discount, total, status)
  VALUES ('17000000-0000-4000-8000-0000000000ff', '10000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 5000.00, 0.00, 5000.00, 'PENDING');
  PERFORM pg_temp.local_record_result('Sale Agency A -> Customer B', 'FAIL', 'PASS', 'Unexpectedly inserted');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_result('Sale Agency A -> Customer B', 'FAIL', 'FAIL', SQLSTATE || ' ' || SQLERRM);
END;
$$;

INSERT INTO commissions (id, agency_id, sale_id, broker_id, user_id, amount, percentage, status)
VALUES ('18000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 500.00, 10.00, 'PENDING');

DO $$
BEGIN
  INSERT INTO commissions (id, agency_id, sale_id, amount, status)
  VALUES ('18000000-0000-4000-8000-0000000000ff', '10000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', 610.00, 'PENDING');
  PERFORM pg_temp.local_record_result('Commission Agency A -> Sale B', 'FAIL', 'PASS', 'Unexpectedly inserted');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_result('Commission Agency A -> Sale B', 'FAIL', 'FAIL', SQLSTATE || ' ' || SQLERRM);
END;
$$;

INSERT INTO trips (id, agency_id, customer_id, sale_id, name, destination, start_date, end_date, status)
VALUES ('19000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000001', 'Trip A', 'Lisbon', DATE '2027-04-10', DATE '2027-04-20', 'CONFIRMED');

DO $$
BEGIN
  INSERT INTO trips (id, agency_id, customer_id, sale_id, name, destination, start_date, end_date, status)
  VALUES ('19000000-0000-4000-8000-0000000000fe', '10000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', 'Cross sale trip', 'Paris', DATE '2027-05-10', DATE '2027-05-20', 'PLANNED');
  PERFORM pg_temp.local_record_result('Trip Agency A -> Sale B', 'FAIL', 'PASS', 'Unexpectedly inserted');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_result('Trip Agency A -> Sale B', 'FAIL', 'FAIL', SQLSTATE || ' ' || SQLERRM);
END;
$$;

DO $$
BEGIN
  INSERT INTO trips (id, agency_id, customer_id, name, destination, start_date, end_date, status)
  VALUES ('19000000-0000-4000-8000-0000000000ff', '10000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', 'Cross tenant trip', 'Paris', DATE '2027-05-10', DATE '2027-05-20', 'PLANNED');
  PERFORM pg_temp.local_record_result('Trip Agency A -> Customer B', 'FAIL', 'PASS', 'Unexpectedly inserted');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_result('Trip Agency A -> Customer B', 'FAIL', 'FAIL', SQLSTATE || ' ' || SQLERRM);
END;
$$;

DO $$
BEGIN
  INSERT INTO wishes (id, agency_id, customer_id, travelers_count, status)
  VALUES ('14000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', 0, 'ACTIVE');
  PERFORM pg_temp.local_record_result('Wish travelers_count = 0', 'FAIL', 'PASS', 'Unexpectedly inserted');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_result('Wish travelers_count = 0', 'FAIL', 'FAIL', SQLSTATE || ' ' || SQLERRM);
END;
$$;

DO $$
BEGIN
  INSERT INTO wishes (id, agency_id, customer_id, travelers_count, status)
  VALUES ('14000000-0000-4000-8000-000000000102', '10000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', -1, 'ACTIVE');
  PERFORM pg_temp.local_record_result('Wish travelers_count < 0', 'FAIL', 'PASS', 'Unexpectedly inserted');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_result('Wish travelers_count < 0', 'FAIL', 'FAIL', SQLSTATE || ' ' || SQLERRM);
END;
$$;

DO $$
BEGIN
  INSERT INTO wishes (id, agency_id, customer_id, budget, status)
  VALUES ('14000000-0000-4000-8000-000000000103', '10000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', -10.00, 'ACTIVE');
  PERFORM pg_temp.local_record_result('Wish budget < 0', 'FAIL', 'PASS', 'Unexpectedly inserted');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_result('Wish budget < 0', 'FAIL', 'FAIL', SQLSTATE || ' ' || SQLERRM);
END;
$$;

DO $$
BEGIN
  INSERT INTO wishes (id, agency_id, customer_id, start_date, end_date, status)
  VALUES ('14000000-0000-4000-8000-000000000104', '10000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', DATE '2027-05-20', DATE '2027-05-10', 'ACTIVE');
  PERFORM pg_temp.local_record_result('Wish start_date > end_date', 'FAIL', 'PASS', 'Unexpectedly inserted');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_result('Wish start_date > end_date', 'FAIL', 'FAIL', SQLSTATE || ' ' || SQLERRM);
END;
$$;

DO $$
BEGIN
  INSERT INTO wishes (id, agency_id, customer_id, start_date, end_date, budget, travelers_count, status)
  VALUES ('14000000-0000-4000-8000-000000000105', '10000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', DATE '2027-05-10', DATE '2027-05-20', 1200.00, 1, 'ACTIVE');
  PERFORM pg_temp.local_record_result('Wish valid checks', 'PASS', 'PASS');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_result('Wish valid checks', 'PASS', 'FAIL', SQLERRM);
END;
$$;

INSERT INTO customers (id, agency_id, name, email, cpf, status)
VALUES ('13000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Soft Delete Original', 'soft-a@example.test', '33366699900', 'ACTIVE');

DO $$
BEGIN
  INSERT INTO customers (id, agency_id, name, email, cpf, status)
  VALUES ('13000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'CPF Duplicate', 'soft-cpf-duplicate@example.test', '33366699900', 'ACTIVE');
  PERFORM pg_temp.local_record_result('Customer duplicate active CPF same Agency', 'FAIL', 'PASS', 'Unexpectedly inserted');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_result('Customer duplicate active CPF same Agency', 'FAIL', 'FAIL', SQLSTATE || ' ' || SQLERRM);
END;
$$;

DO $$
BEGIN
  INSERT INTO customers (id, agency_id, name, email, cpf, status)
  VALUES ('13000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'Email Duplicate', 'soft-a@example.test', '44466699900', 'ACTIVE');
  PERFORM pg_temp.local_record_result('Customer duplicate active email same Agency', 'FAIL', 'PASS', 'Unexpectedly inserted');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_result('Customer duplicate active email same Agency', 'FAIL', 'FAIL', SQLSTATE || ' ' || SQLERRM);
END;
$$;

UPDATE customers
SET deleted_at = now()
WHERE id = '13000000-0000-4000-8000-000000000002';

DO $$
BEGIN
  INSERT INTO customers (id, agency_id, name, email, cpf, status)
  VALUES ('13000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'Soft Delete Reuse', 'soft-a@example.test', '33366699900', 'ACTIVE');
  PERFORM pg_temp.local_record_result('Customer CPF/email reuse after soft delete', 'PASS', 'PASS');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_result('Customer CPF/email reuse after soft delete', 'PASS', 'FAIL', SQLERRM);
END;
$$;

DO $$
BEGIN
  INSERT INTO customers (id, agency_id, name, email, cpf, status)
  VALUES ('23000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'Same CPF Email Agency B', 'soft-a@example.test', '33366699900', 'ACTIVE');
  PERFORM pg_temp.local_record_result('Customer same CPF/email Agency B', 'PASS', 'PASS');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_result('Customer same CPF/email Agency B', 'PASS', 'FAIL', SQLERRM);
END;
$$;

DO $$
BEGIN
  INSERT INTO customer_accounts (id, agency_id, customer_id, email, password_hash, status)
  VALUES ('13100000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', 'account-a@example.test', 'hash-for-local-test-only', 'ACTIVE');
  PERFORM pg_temp.local_record_result('CustomerAccount valid Customer A', 'PASS', 'PASS');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_result('CustomerAccount valid Customer A', 'PASS', 'FAIL', SQLERRM);
END;
$$;

DO $$
BEGIN
  INSERT INTO customer_accounts (id, agency_id, customer_id, email, password_hash, status)
  VALUES ('13100000-0000-4000-8000-0000000000ff', '10000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', 'cross-account@example.test', 'hash-for-local-test-only', 'ACTIVE');
  PERFORM pg_temp.local_record_result('CustomerAccount Agency A -> Customer B', 'FAIL', 'PASS', 'Unexpectedly inserted');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_result('CustomerAccount Agency A -> Customer B', 'FAIL', 'FAIL', SQLSTATE || ' ' || SQLERRM);
END;
$$;

DO $$
BEGIN
  INSERT INTO customer_accounts (id, agency_id, customer_id, email, password_hash, status)
  VALUES ('13100000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', 'account-a-duplicate@example.test', 'hash-for-local-test-only', 'ACTIVE');
  PERFORM pg_temp.local_record_result('CustomerAccount duplicate Customer A', 'FAIL', 'PASS', 'Unexpectedly inserted');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_result('CustomerAccount duplicate Customer A', 'FAIL', 'FAIL', SQLSTATE || ' ' || SQLERRM);
END;
$$;

UPDATE offers
SET price = 5800.00
WHERE id = '15000000-0000-4000-8000-000000000001';

DO $$
DECLARE
  v_snapshot NUMERIC(10, 2);
BEGIN
  SELECT proposed_price INTO v_snapshot
  FROM proposals
  WHERE id = '16000000-0000-4000-8000-000000000001';

  IF v_snapshot = 5000.00 THEN
    PERFORM pg_temp.local_record_result('Proposal snapshot after Offer change', 'PASS', 'PASS');
  ELSE
    PERFORM pg_temp.local_record_result('Proposal snapshot after Offer change', 'PASS', 'FAIL', 'Snapshot changed to ' || v_snapshot::TEXT);
  END IF;
END;
$$;

-- Repository stabilization (CI-03) regression: excursion_customers.trip_id
-- used to be a composite (agency_id, trip_id) FK with ON DELETE SET NULL,
-- which made Postgres try to null agency_id too (NOT NULL) whenever a
-- referenced Trip was deleted -- fixed in migration 075 to a single-column
-- FK on trip_id alone. This proves a real trip deletion with a roster row
-- still pointing at it now succeeds and only trip_id is cleared.
INSERT INTO trips (id, agency_id, customer_id, name, destination, start_date, end_date, status)
VALUES ('19000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', 'Disposable FK-test trip', 'Testland', DATE '2027-06-01', DATE '2027-06-05', 'PLANNED');

INSERT INTO excursions (id, agency_id, name, destination, transport_type, currency)
VALUES ('28000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'FK-test excursion', 'Testland', 'TERRESTRE', 'BRL');

INSERT INTO excursion_departures (id, agency_id, excursion_id, start_date, end_date)
VALUES ('28000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '28000000-0000-4000-8000-000000000001', DATE '2027-06-01', DATE '2027-06-05');

INSERT INTO excursion_customers (id, agency_id, excursion_departure_id, customer_id, trip_id)
VALUES ('28000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '28000000-0000-4000-8000-000000000002', '13000000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-000000000002');

DO $$
BEGIN
  BEGIN
    DELETE FROM trips WHERE id = '19000000-0000-4000-8000-000000000002';
    PERFORM pg_temp.local_record_result('Trip delete with excursion roster reference', 'PASS', 'PASS');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.local_record_result('Trip delete with excursion roster reference', 'PASS', 'FAIL', SQLSTATE || ' ' || SQLERRM);
  END;
END;
$$;

DO $$
DECLARE
  v_agency_id TEXT;
  v_trip_id TEXT;
BEGIN
  SELECT agency_id, trip_id INTO v_agency_id, v_trip_id
  FROM excursion_customers
  WHERE id = '28000000-0000-4000-8000-000000000003';

  IF v_agency_id = '10000000-0000-4000-8000-000000000001' AND v_trip_id IS NULL THEN
    PERFORM pg_temp.local_record_result('Excursion roster survives trip delete with trip_id nulled', 'PASS', 'PASS');
  ELSE
    PERFORM pg_temp.local_record_result('Excursion roster survives trip delete with trip_id nulled', 'PASS', 'FAIL', 'agency_id=' || COALESCE(v_agency_id, 'NULL') || ' trip_id=' || COALESCE(v_trip_id, 'NULL'));
  END IF;
END;
$$;

SELECT test_name, expected, result, detail
FROM local_test_results
ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM local_test_results
    WHERE expected <> result
  ) THEN
    RAISE EXCEPTION 'One or more migration 001 structural tests failed';
  END IF;
END;
$$;
