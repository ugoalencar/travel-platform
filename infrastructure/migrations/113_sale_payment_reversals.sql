-- Append-only full reversals of customer receipts. The matching OUT payment
-- records the cash return; this table links it to the original receipt.
CREATE TABLE sale_payment_reversals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  sale_id TEXT NOT NULL,
  original_payment_id TEXT NOT NULL,
  reversal_payment_id TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  allocations_snapshot JSONB NOT NULL,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agency_id, original_payment_id),
  UNIQUE (agency_id, reversal_payment_id),
  FOREIGN KEY (agency_id, sale_id) REFERENCES sales(agency_id,id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (agency_id, original_payment_id) REFERENCES payments(agency_id,id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (agency_id, reversal_payment_id) REFERENCES payments(agency_id,id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (agency_id, created_by) REFERENCES users(agency_id,id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX sale_payment_reversals_sale_idx ON sale_payment_reversals(agency_id,sale_id,created_at);

CREATE TRIGGER sale_payment_reversals_immutable
  BEFORE UPDATE OR DELETE ON sale_payment_reversals
  FOR EACH ROW EXECUTE FUNCTION reject_payment_history_change();

ALTER TABLE sale_payment_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_payment_reversals FORCE ROW LEVEL SECURITY;
CREATE POLICY sale_payment_reversals_select_tenant ON sale_payment_reversals
  FOR SELECT USING (agency_id=current_agency_id());
CREATE POLICY sale_payment_reversals_insert_tenant ON sale_payment_reversals
  FOR INSERT WITH CHECK (agency_id=current_agency_id());
REVOKE ALL ON sale_payment_reversals FROM PUBLIC;

DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['travel_app_runtime','travel_app_runtime_local'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('GRANT SELECT, INSERT ON sale_payment_reversals TO %I',role_name);
    END IF;
  END LOOP;
END $$;

INSERT INTO schema_migrations (version) VALUES ('113') ON CONFLICT (version) DO NOTHING;
