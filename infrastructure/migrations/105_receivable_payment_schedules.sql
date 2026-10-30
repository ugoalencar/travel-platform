-- ADR-006, Full backend. due_at remains the legacy timestamp projection.
-- Existing timestamps are preserved; their new civil-date projection uses UTC.
ALTER TABLE receivables DROP CONSTRAINT receivables_agency_sale_key;
ALTER TABLE receivables
  ALTER COLUMN amount TYPE NUMERIC(14,2),
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'SINGLE'
    CHECK (kind IN ('SINGLE','DOWN_PAYMENT','INSTALLMENT','BALANCE')),
  ADD COLUMN installment_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN installment_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN due_date DATE;
UPDATE receivables SET due_date = (due_at AT TIME ZONE 'UTC')::date;
ALTER TABLE receivables
  ADD CONSTRAINT receivables_installment_check
    CHECK (installment_number >= 1 AND installment_count >= installment_number),
  ADD CONSTRAINT receivables_sale_installment_key UNIQUE (agency_id,sale_id,installment_number);
ALTER TABLE payments ALTER COLUMN amount TYPE NUMERIC(14,2);
ALTER TABLE payment_allocations ALTER COLUMN amount TYPE NUMERIC(14,2);
ALTER TABLE sales ADD COLUMN payment_condition_snapshot JSONB, ADD COLUMN settled_at TIMESTAMPTZ;

CREATE TABLE payment_conditions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agency_id TEXT NOT NULL REFERENCES agencies(id),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  schedule_kind TEXT NOT NULL CHECK (schedule_kind IN ('SINGLE','EQUAL_INSTALLMENTS','DOWN_PAYMENT_PLUS_BALANCE')),
  max_installments INTEGER NOT NULL CHECK (max_installments BETWEEN 1 AND 999),
  min_installment_amount NUMERIC(14,2) CHECK (min_installment_amount >= 0),
  interest_free BOOLEAN NOT NULL CHECK (interest_free),
  down_payment_mode TEXT NOT NULL CHECK (down_payment_mode IN ('NONE','PERCENT','AMOUNT')),
  down_payment_value NUMERIC(16,4) NOT NULL CHECK (down_payment_value >= 0 AND down_payment_value < 1000000000000),
  down_payment_required BOOLEAN NOT NULL,
  balance_deadline_anchor TEXT NOT NULL CHECK (balance_deadline_anchor IN ('SALE_DATE','TRAVEL_START')),
  balance_deadline_offset_days INTEGER NOT NULL CHECK (abs(balance_deadline_offset_days) <= 36500),
  allows_partial_payments BOOLEAN NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (agency_id,id),
  CHECK ((schedule_kind = 'DOWN_PAYMENT_PLUS_BALANCE' AND down_payment_mode <> 'NONE') OR
    (schedule_kind <> 'DOWN_PAYMENT_PLUS_BALANCE' AND down_payment_mode = 'NONE' AND NOT down_payment_required)),
  CHECK ((down_payment_mode = 'NONE' AND down_payment_value = 0) OR
    (down_payment_mode = 'PERCENT' AND down_payment_value > 0 AND down_payment_value < 100) OR
    (down_payment_mode = 'AMOUNT' AND down_payment_value > 0 AND down_payment_value = round(down_payment_value,2)))
);
CREATE TABLE payment_condition_methods (
  agency_id TEXT NOT NULL,
  condition_id TEXT NOT NULL,
  method TEXT NOT NULL CHECK (length(method) BETWEEN 1 AND 100),
  PRIMARY KEY (agency_id,condition_id,method),
  FOREIGN KEY (agency_id,condition_id) REFERENCES payment_conditions(agency_id,id)
);
CREATE TABLE payment_condition_categories (
  agency_id TEXT NOT NULL,
  condition_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  PRIMARY KEY (agency_id,condition_id,category_id),
  FOREIGN KEY (agency_id,condition_id) REFERENCES payment_conditions(agency_id,id),
  FOREIGN KEY (agency_id,category_id) REFERENCES commission_categories(agency_id,id)
);
CREATE TABLE payment_condition_products (
  agency_id TEXT NOT NULL,
  condition_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  PRIMARY KEY (agency_id,condition_id,product_id),
  FOREIGN KEY (agency_id,condition_id) REFERENCES payment_conditions(agency_id,id),
  FOREIGN KEY (agency_id,product_id) REFERENCES travel_products(agency_id,id)
);
CREATE TABLE sale_payment_condition_versions (
  agency_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  condition_id TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agency_id,sale_id,version),
  FOREIGN KEY (agency_id,sale_id) REFERENCES sales(agency_id,id),
  FOREIGN KEY (agency_id,condition_id) REFERENCES payment_conditions(agency_id,id),
  FOREIGN KEY (agency_id,created_by) REFERENCES users(agency_id,id)
);
CREATE TABLE sale_payment_requests (
  agency_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 150),
  payment_id TEXT NOT NULL,
  request JSONB NOT NULL,
  response JSONB NOT NULL,
  PRIMARY KEY (agency_id,sale_id,idempotency_key),
  UNIQUE (agency_id,payment_id),
  FOREIGN KEY (agency_id,sale_id) REFERENCES sales(agency_id,id),
  FOREIGN KEY (agency_id,payment_id) REFERENCES payments(agency_id,id)
);

-- Immutable history is insert-only, even for a role with legacy blanket grants.
CREATE FUNCTION reject_payment_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Payment history is immutable' USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER sale_payment_versions_immutable BEFORE UPDATE OR DELETE ON sale_payment_condition_versions
  FOR EACH ROW EXECUTE FUNCTION reject_payment_history_change();
CREATE TRIGGER sale_payment_requests_immutable BEFORE UPDATE OR DELETE ON sale_payment_requests
  FOR EACH ROW EXECUTE FUNCTION reject_payment_history_change();

CREATE FUNCTION protect_payment_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.payment_condition_snapshot IS NOT NULL AND NEW.total IS DISTINCT FROM OLD.total THEN
    RAISE EXCEPTION 'Revise the payment condition before changing the sale total' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.payment_condition_snapshot IS DISTINCT FROM OLD.payment_condition_snapshot THEN
    IF NEW.payment_condition_snapshot IS NULL OR NOT EXISTS (
      SELECT 1 FROM sale_payment_condition_versions v
      WHERE v.agency_id = NEW.agency_id AND v.sale_id = NEW.id
        AND v.snapshot = NEW.payment_condition_snapshot
        AND v.version = COALESCE((OLD.payment_condition_snapshot->>'version')::integer,0) + 1
    ) THEN
      RAISE EXCEPTION 'A new immutable payment snapshot version is required' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_payment_snapshot_guard BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION protect_payment_snapshot();

DO $$
DECLARE table_name TEXT; role_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['payment_conditions','payment_condition_methods','payment_condition_categories',
    'payment_condition_products','sale_payment_condition_versions','sale_payment_requests'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_select ON %I FOR SELECT USING (agency_id = current_agency_id())',table_name);
    EXECUTE format('CREATE POLICY tenant_insert ON %I FOR INSERT WITH CHECK (agency_id = current_agency_id())',table_name);
    IF table_name = 'payment_conditions' THEN
      EXECUTE format('CREATE POLICY tenant_update ON %I FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id())',table_name);
    END IF;
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',table_name);
    FOREACH role_name IN ARRAY ARRAY['travel_app_runtime','travel_app_runtime_local'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('GRANT SELECT,INSERT ON %I TO %I',table_name,role_name);
        IF table_name = 'payment_conditions' THEN
          EXECUTE format('GRANT UPDATE ON %I TO %I',table_name,role_name);
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

INSERT INTO schema_migrations (version) VALUES ('105') ON CONFLICT (version) DO NOTHING;
