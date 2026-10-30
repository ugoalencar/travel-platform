-- ============================================================
-- TRAVEL LITE — 013_customer_field_settings.sql
-- Frente 2 (ADR-008). Espelha o contrato validado no Full (migration 104):
--   * customer_field_settings: campos do cadastro de cliente habilitados /
--     obrigatórios por tenant (field_key portátil; sem linha = habilitado e
--     opcional; `name` é fixo e nunca é gravado aqui);
--   * permissão customers.fields_manage (somente ADMIN; MASTER tem tudo).
-- Forward-only e re-executável. Desabilitar um campo nunca apaga dado.
-- ============================================================

CREATE TABLE IF NOT EXISTS customer_field_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  field_key TEXT NOT NULL CHECK (field_key ~ '^[a-z][a-z0-9_]{1,63}$' AND field_key <> 'name'),
  enabled BOOLEAN NOT NULL DEFAULT true,
  required BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (NOT required OR enabled),
  UNIQUE (tenant_id, field_key)
);

DO $$
DECLARE
  t TEXT := 'customer_field_settings';
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_select_tenant') THEN
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (tenant_id = current_tenant_id()::uuid)',
                   t || '_select_tenant', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (tenant_id = current_tenant_id()::uuid)',
                   t || '_insert_tenant', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (tenant_id = current_tenant_id()::uuid) WITH CHECK (tenant_id = current_tenant_id()::uuid)',
                   t || '_update_tenant', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (tenant_id = current_tenant_id()::uuid)',
                   t || '_delete_tenant', t);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON customer_field_settings TO travel_lite_runtime;

INSERT INTO permissions (key, description, master_only) VALUES
  ('customers.fields_manage', 'Configurar os campos do cadastro de cliente (habilitar e tornar obrigatório)', false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role, permission) VALUES
  ('ADMIN', 'customers.fields_manage')
ON CONFLICT DO NOTHING;
