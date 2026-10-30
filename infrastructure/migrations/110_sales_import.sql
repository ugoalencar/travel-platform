-- ============================================================
-- SALES IMPORT (IMP-01, Onda F3)
-- ============================================================
-- Idempotência da importação de vendas:
--   * sale_import_batches: uma linha por conteúdo importado (hash do conteúdo +
--     sistema de origem): reenviar o mesmo arquivo não grava nada de novo;
--   * sale_import_keys: chave natural (sistema|número de origem) -> venda criada:
--     a mesma venda vinda em arquivos diferentes nunca é criada duas vezes.
-- Append-only (sem UPDATE/DELETE para o papel de runtime). A importação é
-- histórica: não cria comissões nem recebíveis. Aditiva.
-- ============================================================

CREATE TABLE sale_import_batches (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL REFERENCES agencies (id),
  source_system TEXT NOT NULL CHECK (char_length(source_system) BETWEEN 1 AND 60),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  summary JSONB NOT NULL,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sale_import_batches_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT sale_import_batches_content_uq UNIQUE (agency_id, content_hash)
);

CREATE TABLE sale_import_keys (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  source_system TEXT NOT NULL,
  external_ref TEXT NOT NULL CHECK (char_length(external_ref) BETWEEN 1 AND 100),
  sale_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sale_import_keys_sale_fk FOREIGN KEY (agency_id, sale_id) REFERENCES sales (agency_id, id),
  CONSTRAINT sale_import_keys_batch_fk FOREIGN KEY (agency_id, batch_id) REFERENCES sale_import_batches (agency_id, id),
  CONSTRAINT sale_import_keys_natural_uq UNIQUE (agency_id, source_system, external_ref)
);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sale_import_batches', 'sale_import_keys'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (agency_id = current_agency_id())', t || '_select_tenant', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (agency_id = current_agency_id())', t || '_insert_tenant', t);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', t);
  END LOOP;
END $$;

DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['travel_app_runtime', 'travel_app_runtime_local'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT SELECT, INSERT ON sale_import_batches, sale_import_keys TO %I', role_name);
    END IF;
  END LOOP;
END $$;

INSERT INTO schema_migrations (version) VALUES ('110') ON CONFLICT (version) DO NOTHING;
