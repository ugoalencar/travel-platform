-- ============================================================
-- DASHBOARD LAYOUTS (DASH-01, Onda F1)
-- ============================================================
-- Layout do dashboard por agência: só apresentação (ordem e liga/desliga de
-- widgets do catálogo em código). NUNCA guarda filtros, consultas, permissões
-- ou ids de usuário: a configuração não concede acesso a dados — cada widget
-- é autorizado e calculado no servidor, no escopo de quem vê, a cada leitura.
-- Sem linha = layout padrão do código. Sem DELETE (restaurar = gravar o padrão).
-- `version` dá concorrência otimista ao PUT. Aditiva.
-- ============================================================

CREATE TABLE dashboard_layouts (
  agency_id TEXT PRIMARY KEY REFERENCES agencies (id) ON DELETE RESTRICT,
  widgets JSONB NOT NULL
    CHECK (jsonb_typeof(widgets) = 'array' AND jsonb_array_length(widgets) <= 50),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_by_user_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (agency_id, updated_by_user_id) REFERENCES users (agency_id, id)
);

ALTER TABLE dashboard_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_layouts FORCE ROW LEVEL SECURITY;

CREATE POLICY dashboard_layouts_select_tenant ON dashboard_layouts
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY dashboard_layouts_insert_tenant ON dashboard_layouts
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY dashboard_layouts_update_tenant ON dashboard_layouts
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());

REVOKE ALL ON dashboard_layouts FROM PUBLIC;

INSERT INTO schema_migrations (version) VALUES ('109') ON CONFLICT (version) DO NOTHING;
