-- Migration: Offer Visibility & Display Control
-- Purpose: Add fields to control offer visibility on Agency Dashboard
--          and Customer App, including segment targeting and priority.
-- Direction: up

-- ============================================================
-- 1. NOVOS CAMPOS EM offers
-- ============================================================

ALTER TABLE offers ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS show_on_customer_app BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS target_segment_id TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS display_priority INTEGER NOT NULL DEFAULT 0;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ============================================================
-- 2. FK PARA customer_segments (opcional)
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'offers_target_segment_fk'
  ) THEN
    ALTER TABLE offers ADD CONSTRAINT offers_target_segment_fk
      FOREIGN KEY (agency_id, target_segment_id)
      REFERENCES customer_segments (agency_id, id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 3. ÍNDICE PARA QUERIES DE DESTAQUE
-- ============================================================

CREATE INDEX IF NOT EXISTS offers_visibility_idx
  ON offers (agency_id, featured, display_priority DESC, status)
  WHERE status = 'ACTIVE';

-- ============================================================
-- 4. COMENTÁRIOS
-- ============================================================

COMMENT ON COLUMN offers.featured IS 'Destacada no carrossel do Agency Dashboard';
COMMENT ON COLUMN offers.show_on_customer_app IS 'Visível no Customer App (padrão: true)';
COMMENT ON COLUMN offers.target_segment_id IS 'Segmento de clientes elegível (NULL = todos)';
COMMENT ON COLUMN offers.display_priority IS 'Prioridade de exibição (maior = primeiro)';
COMMENT ON COLUMN offers.image_url IS 'URL da imagem para exibição no Customer App';
