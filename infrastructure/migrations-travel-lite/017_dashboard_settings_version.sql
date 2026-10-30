-- ============================================================
-- TRAVEL LITE — 017_dashboard_settings_version.sql
-- DASH-01 (Onda F1). Espelha o contrato do Full (migration 109): o layout do
-- dashboard ganha `version` para concorrência otimista no PUT (a última escrita
-- deixa de vencer em silêncio). Sem linha = versão 0 = layout padrão.
-- Aditiva e re-executável; linhas existentes ficam na versão 1.
-- ============================================================

ALTER TABLE dashboard_settings
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1 CHECK (version >= 1);
