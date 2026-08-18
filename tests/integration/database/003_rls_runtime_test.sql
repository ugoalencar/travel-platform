-- RLS validation for the disposable local PostgreSQL database.
-- Run as travel_app_runtime_local after migration 002 and role grants.

\set ON_ERROR_STOP on

DROP TABLE IF EXISTS local_rls_results;
CREATE TEMP TABLE local_rls_results (
  test_name TEXT PRIMARY KEY,
  expected TEXT NOT NULL,
  result TEXT NOT NULL,
  detail TEXT
);

CREATE OR REPLACE FUNCTION pg_temp.local_record_rls_result(
  p_test_name TEXT,
  p_expected TEXT,
  p_result TEXT,
  p_detail TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO local_rls_results (test_name, expected, result, detail)
  VALUES (p_test_name, p_expected, p_result, p_detail);
END;
$$;

SELECT set_tenant_context('10000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001');

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM customers
  WHERE agency_id = '20000000-0000-4000-8000-000000000001';

  IF v_count = 0 THEN
    PERFORM pg_temp.local_record_rls_result('RLS SELECT Customer A cannot see Customer B', 'PASS', 'PASS');
  ELSE
    PERFORM pg_temp.local_record_rls_result('RLS SELECT Customer A cannot see Customer B', 'PASS', 'FAIL', 'Visible B rows: ' || v_count::TEXT);
  END IF;
END;
$$;

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM wishes
  WHERE agency_id = '20000000-0000-4000-8000-000000000001';

  IF v_count = 0 THEN
    PERFORM pg_temp.local_record_rls_result('RLS SELECT Wish A cannot see Wish B', 'PASS', 'PASS');
  ELSE
    PERFORM pg_temp.local_record_rls_result('RLS SELECT Wish A cannot see Wish B', 'PASS', 'FAIL', 'Visible B rows: ' || v_count::TEXT);
  END IF;
END;
$$;

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM proposals
  WHERE agency_id = '20000000-0000-4000-8000-000000000001';

  IF v_count = 0 THEN
    PERFORM pg_temp.local_record_rls_result('RLS SELECT Proposal A cannot see Proposal B', 'PASS', 'PASS');
  ELSE
    PERFORM pg_temp.local_record_rls_result('RLS SELECT Proposal A cannot see Proposal B', 'PASS', 'FAIL', 'Visible B rows: ' || v_count::TEXT);
  END IF;
END;
$$;

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM sales
  WHERE agency_id = '20000000-0000-4000-8000-000000000001';

  IF v_count = 0 THEN
    PERFORM pg_temp.local_record_rls_result('RLS SELECT Sale A cannot see Sale B', 'PASS', 'PASS');
  ELSE
    PERFORM pg_temp.local_record_rls_result('RLS SELECT Sale A cannot see Sale B', 'PASS', 'FAIL', 'Visible B rows: ' || v_count::TEXT);
  END IF;
END;
$$;

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM trips
  WHERE agency_id = '20000000-0000-4000-8000-000000000001';

  IF v_count = 0 THEN
    PERFORM pg_temp.local_record_rls_result('RLS SELECT Trip A cannot see Trip B', 'PASS', 'PASS');
  ELSE
    PERFORM pg_temp.local_record_rls_result('RLS SELECT Trip A cannot see Trip B', 'PASS', 'FAIL', 'Visible B rows: ' || v_count::TEXT);
  END IF;
END;
$$;

SELECT set_tenant_context('20000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001');

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM customers
  WHERE agency_id = '10000000-0000-4000-8000-000000000001';

  IF v_count = 0 THEN
    PERFORM pg_temp.local_record_rls_result('RLS SELECT Customer B cannot see Customer A', 'PASS', 'PASS');
  ELSE
    PERFORM pg_temp.local_record_rls_result('RLS SELECT Customer B cannot see Customer A', 'PASS', 'FAIL', 'Visible A rows: ' || v_count::TEXT);
  END IF;
END;
$$;

SELECT set_tenant_context('10000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001');

DO $$
BEGIN
  INSERT INTO customers (id, agency_id, name, email, cpf, status)
  VALUES ('13000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000001', 'RLS Insert Customer A', 'rls-insert-a@example.test', '55566677788', 'ACTIVE');
  PERFORM pg_temp.local_record_rls_result('RLS INSERT Customer agency A', 'PASS', 'PASS');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_rls_result('RLS INSERT Customer agency A', 'PASS', 'FAIL', SQLERRM);
END;
$$;

DO $$
BEGIN
  INSERT INTO customers (id, agency_id, name, email, cpf, status)
  VALUES ('23000000-0000-4000-8000-000000000201', '20000000-0000-4000-8000-000000000001', 'RLS Insert Customer B From A', 'rls-insert-b-from-a@example.test', '55566677789', 'ACTIVE');
  PERFORM pg_temp.local_record_rls_result('RLS INSERT Customer agency B while tenant A', 'FAIL', 'PASS', 'Unexpectedly inserted');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_rls_result('RLS INSERT Customer agency B while tenant A', 'FAIL', 'FAIL', SQLSTATE || ' ' || SQLERRM);
END;
$$;

DO $$
BEGIN
  INSERT INTO wishes (id, agency_id, customer_id, destination, status)
  VALUES ('14000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', 'RLS Wish A', 'ACTIVE');
  PERFORM pg_temp.local_record_rls_result('RLS INSERT Wish agency A', 'PASS', 'PASS');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_rls_result('RLS INSERT Wish agency A', 'PASS', 'FAIL', SQLERRM);
END;
$$;

DO $$
BEGIN
  INSERT INTO wishes (id, agency_id, customer_id, destination, status)
  VALUES ('24000000-0000-4000-8000-000000000201', '20000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', 'RLS Wish B From A', 'ACTIVE');
  PERFORM pg_temp.local_record_rls_result('RLS INSERT Wish agency B while tenant A', 'FAIL', 'PASS', 'Unexpectedly inserted');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_rls_result('RLS INSERT Wish agency B while tenant A', 'FAIL', 'FAIL', SQLSTATE || ' ' || SQLERRM);
END;
$$;

DO $$
BEGIN
  INSERT INTO proposals (id, agency_id, customer_id, offer_id, user_id, proposed_price, discount, total, status)
  VALUES ('16000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 5800.00, 0.00, 5800.00, 'DRAFT');
  PERFORM pg_temp.local_record_rls_result('RLS INSERT Proposal agency A', 'PASS', 'PASS');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_rls_result('RLS INSERT Proposal agency A', 'PASS', 'FAIL', SQLERRM);
END;
$$;

DO $$
BEGIN
  INSERT INTO proposals (id, agency_id, customer_id, offer_id, user_id, proposed_price, discount, total, status)
  VALUES ('26000000-0000-4000-8000-000000000201', '20000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', '25000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 6100.00, 0.00, 6100.00, 'DRAFT');
  PERFORM pg_temp.local_record_rls_result('RLS INSERT Proposal agency B while tenant A', 'FAIL', 'PASS', 'Unexpectedly inserted');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_rls_result('RLS INSERT Proposal agency B while tenant A', 'FAIL', 'FAIL', SQLSTATE || ' ' || SQLERRM);
END;
$$;

DO $$
BEGIN
  INSERT INTO sales (id, agency_id, customer_id, broker_id, user_id, amount, discount, total, status)
  VALUES ('17000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 5800.00, 0.00, 5800.00, 'PENDING');
  PERFORM pg_temp.local_record_rls_result('RLS INSERT Sale agency A', 'PASS', 'PASS');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_rls_result('RLS INSERT Sale agency A', 'PASS', 'FAIL', SQLERRM);
END;
$$;

DO $$
BEGIN
  INSERT INTO sales (id, agency_id, customer_id, user_id, amount, discount, total, status)
  VALUES ('27000000-0000-4000-8000-000000000201', '20000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 6100.00, 0.00, 6100.00, 'PENDING');
  PERFORM pg_temp.local_record_rls_result('RLS INSERT Sale agency B while tenant A', 'FAIL', 'PASS', 'Unexpectedly inserted');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_rls_result('RLS INSERT Sale agency B while tenant A', 'FAIL', 'FAIL', SQLSTATE || ' ' || SQLERRM);
END;
$$;

DO $$
BEGIN
  INSERT INTO trips (id, agency_id, customer_id, name, destination, start_date, end_date, status)
  VALUES ('19000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', 'RLS Trip A', 'Lisbon', DATE '2027-07-01', DATE '2027-07-10', 'PLANNED');
  PERFORM pg_temp.local_record_rls_result('RLS INSERT Trip agency A', 'PASS', 'PASS');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_rls_result('RLS INSERT Trip agency A', 'PASS', 'FAIL', SQLERRM);
END;
$$;

DO $$
BEGIN
  INSERT INTO trips (id, agency_id, customer_id, name, destination, start_date, end_date, status)
  VALUES ('29000000-0000-4000-8000-000000000201', '20000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', 'RLS Trip B From A', 'Paris', DATE '2027-07-01', DATE '2027-07-10', 'PLANNED');
  PERFORM pg_temp.local_record_rls_result('RLS INSERT Trip agency B while tenant A', 'FAIL', 'PASS', 'Unexpectedly inserted');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_rls_result('RLS INSERT Trip agency B while tenant A', 'FAIL', 'FAIL', SQLSTATE || ' ' || SQLERRM);
END;
$$;

DO $$
BEGIN
  UPDATE customers
  SET name = 'RLS Updated Customer A'
  WHERE id = '13000000-0000-4000-8000-000000000201';

  PERFORM pg_temp.local_record_rls_result('RLS UPDATE own Customer A', 'PASS', 'PASS');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_rls_result('RLS UPDATE own Customer A', 'PASS', 'FAIL', SQLERRM);
END;
$$;

DO $$
BEGIN
  UPDATE customers
  SET agency_id = '20000000-0000-4000-8000-000000000001'
  WHERE id = '13000000-0000-4000-8000-000000000201';
  PERFORM pg_temp.local_record_rls_result('RLS UPDATE agency_id A to B', 'FAIL', 'PASS', 'Unexpectedly updated');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_rls_result('RLS UPDATE agency_id A to B', 'FAIL', 'FAIL', SQLSTATE || ' ' || SQLERRM);
END;
$$;

DO $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE customers
  SET name = 'Should not update B'
  WHERE id = '23000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    PERFORM pg_temp.local_record_rls_result('RLS UPDATE Customer B while tenant A', 'ZERO', 'ZERO');
  ELSE
    PERFORM pg_temp.local_record_rls_result('RLS UPDATE Customer B while tenant A', 'ZERO', 'UPDATED', 'Rows: ' || v_rows::TEXT);
  END IF;
END;
$$;

DO $$
BEGIN
  DELETE FROM customers
  WHERE id = '13000000-0000-4000-8000-000000000201';
  PERFORM pg_temp.local_record_rls_result('RLS DELETE own Customer A', 'PASS', 'PASS');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_rls_result('RLS DELETE own Customer A', 'PASS', 'FAIL', SQLERRM);
END;
$$;

DO $$
DECLARE
  v_rows INTEGER;
BEGIN
  DELETE FROM customers
  WHERE id = '23000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    PERFORM pg_temp.local_record_rls_result('RLS DELETE Customer B while tenant A', 'ZERO', 'ZERO');
  ELSE
    PERFORM pg_temp.local_record_rls_result('RLS DELETE Customer B while tenant A', 'ZERO', 'DELETED', 'Rows: ' || v_rows::TEXT);
  END IF;
END;
$$;

SELECT clear_tenant_context();

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM customers;

  IF v_count = 0 THEN
    PERFORM pg_temp.local_record_rls_result('Fail closed SELECT without tenant', 'ZERO', 'ZERO');
  ELSE
    PERFORM pg_temp.local_record_rls_result('Fail closed SELECT without tenant', 'ZERO', 'VISIBLE', 'Rows: ' || v_count::TEXT);
  END IF;
END;
$$;

DO $$
BEGIN
  INSERT INTO customers (id, agency_id, name, email, status)
  VALUES ('13000000-0000-4000-8000-000000000301', '10000000-0000-4000-8000-000000000001', 'No Tenant Insert', 'no-tenant-insert@example.test', 'ACTIVE');
  PERFORM pg_temp.local_record_rls_result('Fail closed INSERT without tenant', 'FAIL', 'PASS', 'Unexpectedly inserted');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_rls_result('Fail closed INSERT without tenant', 'FAIL', 'FAIL', SQLSTATE || ' ' || SQLERRM);
END;
$$;

DO $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE customers
  SET name = 'No tenant update'
  WHERE id = '13000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    PERFORM pg_temp.local_record_rls_result('Fail closed UPDATE without tenant', 'ZERO', 'ZERO');
  ELSE
    PERFORM pg_temp.local_record_rls_result('Fail closed UPDATE without tenant', 'ZERO', 'UPDATED', 'Rows: ' || v_rows::TEXT);
  END IF;
END;
$$;

DO $$
DECLARE
  v_rows INTEGER;
BEGIN
  DELETE FROM customers
  WHERE id = '13000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    PERFORM pg_temp.local_record_rls_result('Fail closed DELETE without tenant', 'ZERO', 'ZERO');
  ELSE
    PERFORM pg_temp.local_record_rls_result('Fail closed DELETE without tenant', 'ZERO', 'DELETED', 'Rows: ' || v_rows::TEXT);
  END IF;
END;
$$;

SELECT set_tenant_context('90000000-0000-4000-8000-000000000001', NULL);

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM customers;

  IF v_count = 0 THEN
    PERFORM pg_temp.local_record_rls_result('Invalid tenant SELECT', 'ZERO', 'ZERO');
  ELSE
    PERFORM pg_temp.local_record_rls_result('Invalid tenant SELECT', 'ZERO', 'VISIBLE', 'Rows: ' || v_count::TEXT);
  END IF;
END;
$$;

DO $$
BEGIN
  INSERT INTO wishes (id, agency_id, customer_id, destination, status)
  VALUES ('94000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', 'Invalid tenant wish', 'ACTIVE');
  PERFORM pg_temp.local_record_rls_result('Invalid tenant INSERT referencing real Customer A', 'FAIL', 'PASS', 'Unexpectedly inserted');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.local_record_rls_result('Invalid tenant INSERT referencing real Customer A', 'FAIL', 'FAIL', SQLSTATE || ' ' || SQLERRM);
END;
$$;

DO $$
DECLARE
  v_rolsuper BOOLEAN;
  v_rolbypassrls BOOLEAN;
BEGIN
  SELECT rolsuper, rolbypassrls
  INTO v_rolsuper, v_rolbypassrls
  FROM pg_roles
  WHERE rolname = current_user;

  IF v_rolsuper = FALSE AND v_rolbypassrls = FALSE THEN
    PERFORM pg_temp.local_record_rls_result('Runtime role rolsuper/rolbypassrls false', 'PASS', 'PASS');
  ELSE
    PERFORM pg_temp.local_record_rls_result('Runtime role rolsuper/rolbypassrls false', 'PASS', 'FAIL', 'rolsuper=' || v_rolsuper::TEXT || ', rolbypassrls=' || v_rolbypassrls::TEXT);
  END IF;
END;
$$;

DO $$
DECLARE
  v_is_owner BOOLEAN;
BEGIN
  SELECT pg_get_userbyid(relowner) = current_user
  INTO v_is_owner
  FROM pg_class
  WHERE relnamespace = 'public'::regnamespace
    AND relname = 'customers';

  IF v_is_owner = FALSE THEN
    PERFORM pg_temp.local_record_rls_result('Runtime cannot DISABLE RLS by ownership', 'PASS', 'PASS');
  ELSE
    PERFORM pg_temp.local_record_rls_result('Runtime cannot DISABLE RLS by ownership', 'PASS', 'FAIL', 'Runtime role owns customers');
  END IF;
END;
$$;

DO $$
DECLARE
  v_is_owner BOOLEAN;
BEGIN
  SELECT pg_get_userbyid(relowner) = current_user
  INTO v_is_owner
  FROM pg_class
  WHERE relnamespace = 'public'::regnamespace
    AND relname = 'customers';

  IF v_is_owner = FALSE THEN
    PERFORM pg_temp.local_record_rls_result('Runtime cannot CREATE POLICY by ownership', 'PASS', 'PASS');
  ELSE
    PERFORM pg_temp.local_record_rls_result('Runtime cannot CREATE POLICY by ownership', 'PASS', 'FAIL', 'Runtime role owns customers');
  END IF;
END;
$$;

DO $$
DECLARE
  v_is_owner BOOLEAN;
BEGIN
  SELECT pg_get_userbyid(relowner) = current_user
  INTO v_is_owner
  FROM pg_class
  WHERE relnamespace = 'public'::regnamespace
    AND relname = 'trips';

  IF v_is_owner = FALSE THEN
    PERFORM pg_temp.local_record_rls_result('Runtime cannot DROP TABLE by ownership', 'PASS', 'PASS');
  ELSE
    PERFORM pg_temp.local_record_rls_result('Runtime cannot DROP TABLE by ownership', 'PASS', 'FAIL', 'Runtime role owns trips');
  END IF;
END;
$$;

DO $$
DECLARE
  v_rolsuper BOOLEAN;
  v_rolcreaterole BOOLEAN;
BEGIN
  SELECT rolsuper, rolcreaterole
  INTO v_rolsuper, v_rolcreaterole
  FROM pg_roles
  WHERE rolname = current_user;

  IF v_rolsuper = FALSE AND v_rolcreaterole = FALSE THEN
    PERFORM pg_temp.local_record_rls_result('Runtime cannot grant BYPASSRLS by role flags', 'PASS', 'PASS');
  ELSE
    PERFORM pg_temp.local_record_rls_result('Runtime cannot grant BYPASSRLS by role flags', 'PASS', 'FAIL', 'rolsuper=' || v_rolsuper::TEXT || ', rolcreaterole=' || v_rolcreaterole::TEXT);
  END IF;
END;
$$;

SELECT test_name, expected, result, detail
FROM local_rls_results
ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM local_rls_results
    WHERE expected <> result
  ) THEN
    RAISE EXCEPTION 'One or more RLS runtime tests failed';
  END IF;
END;
$$;
