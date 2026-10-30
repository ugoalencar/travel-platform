-- ============================================================
-- 102_travel_product_sale_category.sql
-- Onda B (ADR-008): vínculo opcional produto -> categoria de venda configurável
-- (commission_categories, migration 101). O enum legado travel_products.category
-- continua intacto como tipo de produto. Aditiva: coluna nula, sem backfill; produtos
-- existentes ficam sem categoria. FK composta por agência.
-- ============================================================

ALTER TABLE travel_products
  ADD COLUMN category_id TEXT;

ALTER TABLE travel_products
  ADD CONSTRAINT travel_products_sale_category_tenant_fk
    FOREIGN KEY (agency_id, category_id) REFERENCES commission_categories (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX travel_products_agency_sale_category_idx
  ON travel_products (agency_id, category_id)
  WHERE category_id IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('102') ON CONFLICT (version) DO NOTHING;
