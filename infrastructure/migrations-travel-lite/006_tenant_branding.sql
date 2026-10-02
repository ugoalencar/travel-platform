-- Travel Lite 006 — identidade visual por tenant (PX2).
-- Aditiva e idempotente: não altera nem remove nada existente.

CREATE TABLE IF NOT EXISTS tenant_branding (
  tenant_id UUID PRIMARY KEY REFERENCES tenants (id),
  display_name TEXT
    CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 80),
  welcome_text TEXT
    CHECK (welcome_text IS NULL OR char_length(welcome_text) BETWEEN 1 AND 160),
  primary_color TEXT
    CHECK (primary_color IS NULL OR primary_color ~ '^#[0-9a-fA-F]{6}$'),
  secondary_color TEXT
    CHECK (secondary_color IS NULL OR secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  login_background TEXT
    CHECK (login_background IS NULL OR login_background ~ '^#[0-9a-fA-F]{6}$'),
  logo_mime TEXT
    CHECK (logo_mime IS NULL OR logo_mime IN ('image/png', 'image/jpeg', 'image/webp')),
  logo_data BYTEA
    CHECK (logo_data IS NULL OR octet_length(logo_data) BETWEEN 1 AND 153600),
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((logo_mime IS NULL) = (logo_data IS NULL)),
  FOREIGN KEY (tenant_id, updated_by) REFERENCES users (tenant_id, id)
);

-- O runtime lê e grava; não apaga (limpar = gravar NULLs).
GRANT SELECT, INSERT, UPDATE ON tenant_branding TO travel_lite_runtime;

ALTER TABLE tenant_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_branding FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE tablename = 'tenant_branding'
       AND policyname = 'tenant_branding_select_tenant'
  ) THEN
    CREATE POLICY tenant_branding_select_tenant ON tenant_branding
      FOR SELECT USING (tenant_id = current_tenant_id()::uuid);
    CREATE POLICY tenant_branding_insert_tenant ON tenant_branding
      FOR INSERT WITH CHECK (tenant_id = current_tenant_id()::uuid);
    CREATE POLICY tenant_branding_update_tenant ON tenant_branding
      FOR UPDATE USING (tenant_id = current_tenant_id()::uuid)
      WITH CHECK (tenant_id = current_tenant_id()::uuid);
  END IF;
END $$;
