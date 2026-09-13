-- ============================================================
-- TRAVEL PRODUCT CATALOG (Agent 07 — Catalog)
-- ============================================================
-- New tenant-scoped catalog layer, separate from `offers` (current sales
-- opportunity) and `suppliers` (supplier master data). A TravelProduct is
-- a reusable, categorized product definition (insurance, tour, transfer,
-- etc.) that references an existing supplier and, in the future, a
-- CommercialPartner (Agent 04 — concurrent work, not yet landed in this
-- worktree; partner_id is left as a plain nullable TEXT column with no FK
-- for now — wire the FK once CommercialPartner exists).
--
-- Pricing is kept on the product row itself (cost/price/currency/markup/
-- commission) rather than a separate pricing-tiers table: the spec's
-- "validade" (validity) field is a single date range per product, not
-- multiple concurrent price tiers, so a sub-table would be over-
-- engineering for this first pass.
--
-- Product images/documents reuse the existing generic `assets` table via
-- a link table (product_assets) instead of a parallel asset store.
-- ============================================================

CREATE TABLE travel_products (
  id                     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id              TEXT NOT NULL,
  category               TEXT NOT NULL,
  supplier_id            TEXT,
  partner_id             TEXT, -- future FK to CommercialPartner (Agent 04, not yet landed)
  title                  TEXT NOT NULL,
  description            TEXT,
  destination             TEXT,
  duration_text          TEXT,
  rules                  TEXT,
  inclusions             TEXT,
  exclusions             TEXT,
  min_age                INTEGER,
  max_age                INTEGER,
  capacity               INTEGER,
  booking_deadline_days  INTEGER,
  cancellation_policy    TEXT,
  cost                   NUMERIC(14, 2) NOT NULL DEFAULT 0,
  price                  NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency               TEXT NOT NULL DEFAULT 'BRL',
  markup_percent         NUMERIC(7, 4),
  commission_percent     NUMERIC(7, 4),
  valid_from             DATE,
  valid_until            DATE,
  active                 BOOLEAN NOT NULL DEFAULT true,
  standalone             BOOLEAN NOT NULL DEFAULT true,
  proposal_eligible      BOOLEAN NOT NULL DEFAULT true,
  portal_visible         BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT travel_products_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT travel_products_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT travel_products_title_not_blank_check
    CHECK (length(trim(title)) > 0),
  CONSTRAINT travel_products_category_check
    CHECK (category IN (
      'INSURANCE', 'TOUR', 'EXPERIENCE', 'TICKET', 'TRANSFER', 'CAR_RENTAL',
      'ESIM', 'LOUNGE', 'BAGGAGE', 'SEAT', 'HOTEL', 'CRUISE', 'TRAIN', 'BUS',
      'GUIDE', 'EVENT', 'FOOD', 'CONCIERGE', 'OTHER'
    )),
  CONSTRAINT travel_products_cost_non_negative_check CHECK (cost >= 0),
  CONSTRAINT travel_products_price_non_negative_check CHECK (price >= 0),
  CONSTRAINT travel_products_validity_range_check
    CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_from <= valid_until),
  CONSTRAINT travel_products_age_range_check
    CHECK (min_age IS NULL OR max_age IS NULL OR min_age <= max_age),
  CONSTRAINT travel_products_supplier_tenant_fk
    FOREIGN KEY (agency_id, supplier_id) REFERENCES suppliers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX travel_products_agency_category_idx ON travel_products (agency_id, category);
CREATE INDEX travel_products_agency_active_idx ON travel_products (agency_id, active);
CREATE INDEX travel_products_agency_supplier_idx ON travel_products (agency_id, supplier_id);

ALTER TABLE travel_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_products FORCE ROW LEVEL SECURITY;

CREATE POLICY travel_products_select_tenant ON travel_products
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY travel_products_insert_tenant ON travel_products
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY travel_products_update_tenant ON travel_products
  FOR UPDATE USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());
CREATE POLICY travel_products_delete_tenant ON travel_products
  FOR DELETE USING (agency_id = current_agency_id());

-- ------------------------------------------------------------
-- Product <-> Asset link (reuses the existing generic `assets` table)
-- ------------------------------------------------------------

CREATE TABLE product_assets (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id   TEXT NOT NULL,
  product_id  TEXT NOT NULL,
  asset_id    TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT product_assets_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT product_assets_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT product_assets_product_tenant_fk
    FOREIGN KEY (agency_id, product_id) REFERENCES travel_products (agency_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT product_assets_asset_tenant_fk
    FOREIGN KEY (agency_id, asset_id) REFERENCES assets (agency_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT product_assets_unique UNIQUE (agency_id, product_id, asset_id)
);

CREATE INDEX product_assets_agency_product_idx ON product_assets (agency_id, product_id);

ALTER TABLE product_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_assets FORCE ROW LEVEL SECURITY;

CREATE POLICY product_assets_select_tenant ON product_assets
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY product_assets_insert_tenant ON product_assets
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY product_assets_update_tenant ON product_assets
  FOR UPDATE USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());
CREATE POLICY product_assets_delete_tenant ON product_assets
  FOR DELETE USING (agency_id = current_agency_id());
