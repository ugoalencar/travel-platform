-- Onda C: Full ADR-006 adapted to Lite UUIDs and existing civil DATE columns.
-- Additive: legacy installments, due_at and paid_amount are preserved.
ALTER TABLE receivables ADD COLUMN kind TEXT NOT NULL DEFAULT 'SINGLE'
  CHECK (kind IN ('SINGLE','DOWN_PAYMENT','INSTALLMENT','BALANCE'));
ALTER TABLE receivables ADD CONSTRAINT receivables_schedule_installment_check
  CHECK (installment_number IS NULL OR installment_count >= installment_number);
ALTER TABLE sales ADD COLUMN payment_condition_snapshot JSONB, ADD COLUMN settled_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN payment_timestamp TIMESTAMPTZ;
CREATE TABLE payment_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
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
  UNIQUE (tenant_id,id),
  CHECK ((schedule_kind = 'DOWN_PAYMENT_PLUS_BALANCE' AND down_payment_mode <> 'NONE') OR
    (schedule_kind <> 'DOWN_PAYMENT_PLUS_BALANCE' AND down_payment_mode = 'NONE' AND NOT down_payment_required)),
  CHECK ((down_payment_mode = 'NONE' AND down_payment_value = 0) OR
    (down_payment_mode = 'PERCENT' AND down_payment_value > 0 AND down_payment_value < 100) OR
    (down_payment_mode = 'AMOUNT' AND down_payment_value > 0 AND down_payment_value = round(down_payment_value,2)))
);
CREATE TABLE payment_condition_methods (
  tenant_id UUID NOT NULL,
  condition_id UUID NOT NULL,
  method TEXT NOT NULL CHECK (length(method) BETWEEN 1 AND 100),
  PRIMARY KEY (tenant_id,condition_id,method),
  FOREIGN KEY (tenant_id,condition_id) REFERENCES payment_conditions(tenant_id,id)
);
CREATE TABLE payment_condition_categories (
  tenant_id UUID NOT NULL,
  condition_id UUID NOT NULL,
  category_id UUID NOT NULL,
  PRIMARY KEY (tenant_id,condition_id,category_id),
  FOREIGN KEY (tenant_id,condition_id) REFERENCES payment_conditions(tenant_id,id),
  FOREIGN KEY (tenant_id,category_id) REFERENCES sale_categories(tenant_id,id)
);
CREATE TABLE payment_condition_products (
  tenant_id UUID NOT NULL,
  condition_id UUID NOT NULL,
  product_id UUID NOT NULL,
  PRIMARY KEY (tenant_id,condition_id,product_id),
  FOREIGN KEY (tenant_id,condition_id) REFERENCES payment_conditions(tenant_id,id),
  FOREIGN KEY (tenant_id,product_id) REFERENCES catalog_products(tenant_id,id)
);
CREATE TABLE sale_payment_condition_versions (
  tenant_id UUID NOT NULL,
  sale_id UUID NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  condition_id UUID NOT NULL,
  snapshot JSONB NOT NULL,
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,sale_id,version),
  FOREIGN KEY (tenant_id,sale_id) REFERENCES sales(tenant_id,id),
  FOREIGN KEY (tenant_id,condition_id) REFERENCES payment_conditions(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE sale_payment_requests (
  tenant_id UUID NOT NULL,
  sale_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 150),
  payment_id UUID NOT NULL,
  request JSONB NOT NULL,
  response JSONB NOT NULL,
  PRIMARY KEY (tenant_id,sale_id,idempotency_key),
  UNIQUE (tenant_id,payment_id),
  FOREIGN KEY (tenant_id,sale_id) REFERENCES sales(tenant_id,id),
  FOREIGN KEY (tenant_id,payment_id) REFERENCES payments(tenant_id,id)
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
  IF OLD.payment_condition_snapshot IS NOT NULL AND (
    NEW.gross_amount IS DISTINCT FROM OLD.gross_amount OR
    NEW.cost_amount IS DISTINCT FROM OLD.cost_amount OR
    NEW.category_id IS DISTINCT FROM OLD.category_id OR
    NEW.installment_count IS DISTINCT FROM OLD.installment_count OR
    NEW.payment_method_id IS DISTINCT FROM OLD.payment_method_id) THEN
    RAISE EXCEPTION 'Revise the payment condition before changing the sale total' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.payment_condition_snapshot IS DISTINCT FROM OLD.payment_condition_snapshot THEN
    IF NEW.payment_condition_snapshot IS NULL OR NOT EXISTS (
      SELECT 1 FROM sale_payment_condition_versions v
      WHERE v.tenant_id = NEW.tenant_id AND v.sale_id = NEW.id
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
    EXECUTE format('CREATE POLICY tenant_select ON %I FOR SELECT USING (tenant_id = current_tenant_id()::uuid)',table_name);
    EXECUTE format('CREATE POLICY tenant_insert ON %I FOR INSERT WITH CHECK (tenant_id = current_tenant_id()::uuid)',table_name);
    IF table_name = 'payment_conditions' THEN
      EXECUTE format('CREATE POLICY tenant_update ON %I FOR UPDATE USING (tenant_id = current_tenant_id()::uuid) WITH CHECK (tenant_id = current_tenant_id()::uuid)',table_name);
    END IF;
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',table_name);
    FOREACH role_name IN ARRAY ARRAY['travel_lite_runtime'] LOOP
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
