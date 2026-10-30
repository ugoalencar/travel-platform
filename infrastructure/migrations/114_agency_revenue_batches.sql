-- Configured monthly windows; closed batches, membership and receipts are historical.
CREATE TABLE agency_revenue_settlement_settings (
  agency_id TEXT PRIMARY KEY REFERENCES agencies(id) ON DELETE RESTRICT,
  settlement_mode TEXT NOT NULL CHECK (settlement_mode IN ('PER_SALE','BATCH_WINDOW')),
  closing_day INTEGER CHECK (closing_day BETWEEN 1 AND 31),
  payment_days INTEGER CHECK (payment_days BETWEEN 0 AND 365),
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (settlement_mode='PER_SALE' OR (closing_day IS NOT NULL AND payment_days IS NOT NULL)),
  FOREIGN KEY (agency_id,updated_by) REFERENCES users(agency_id,id) ON DELETE RESTRICT
);
CREATE TABLE agency_revenue_batches (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
  window_month DATE NOT NULL CHECK (extract(day FROM window_month)=1),
  window_start DATE NOT NULL,
  window_end DATE NOT NULL CHECK (window_end>window_start),
  expected_payment_date DATE NOT NULL CHECK (expected_payment_date>=window_end),
  policy_snapshot JSONB NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agency_id,id),
  UNIQUE (agency_id,window_month),
  FOREIGN KEY (agency_id,created_by) REFERENCES users(agency_id,id) ON DELETE RESTRICT
);
CREATE TABLE agency_revenue_batch_entries (
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
  batch_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount>=0),
  PRIMARY KEY (agency_id,entry_id),
  FOREIGN KEY (agency_id,batch_id) REFERENCES agency_revenue_batches(agency_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (agency_id,entry_id) REFERENCES agency_revenue_entries(agency_id,id) ON DELETE RESTRICT
);
CREATE TABLE agency_revenue_batch_receipts (
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
  batch_id TEXT NOT NULL,
  reference TEXT CHECK (length(reference)<=200),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL,
  PRIMARY KEY (agency_id,batch_id),
  FOREIGN KEY (agency_id,batch_id) REFERENCES agency_revenue_batches(agency_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (agency_id,created_by) REFERENCES users(agency_id,id) ON DELETE RESTRICT
);
ALTER TABLE agency_revenue_entries ADD COLUMN expected_payment_date DATE;

DO $$
DECLARE t TEXT; r TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['agency_revenue_settlement_settings','agency_revenue_batches','agency_revenue_batch_entries','agency_revenue_batch_receipts'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (agency_id=current_agency_id())',t||'_select_tenant',t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (agency_id=current_agency_id())',t||'_insert_tenant',t);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
    IF t='agency_revenue_settlement_settings' THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (agency_id=current_agency_id()) WITH CHECK (agency_id=current_agency_id())',t||'_update_tenant',t);
    ELSE
      EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_payment_history_change()',t||'_immutable',t);
    END IF;
    FOREACH r IN ARRAY ARRAY['travel_app_runtime','travel_app_runtime_local'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
        EXECUTE format('GRANT SELECT, INSERT ON %I TO %I',t,r);
        IF t='agency_revenue_settlement_settings' THEN
          EXECUTE format('GRANT UPDATE ON %I TO %I',t,r);
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END $$;

INSERT INTO schema_migrations (version) VALUES ('114') ON CONFLICT (version) DO NOTHING;
