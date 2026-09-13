-- Migration: Insurance -> Sale Items reconciliation
-- Purpose: constrain insurance_policies.sale_item_id against Agent 08's
-- real sale_items table, now that it has landed on main (see
-- 055_sale_items_upsell.sql). Until this migration, sale_item_id was an
-- intentionally unconstrained placeholder (see 057_insurance.sql's header
-- note) because SaleItem did not exist yet in that worktree.
--
-- No backfill is needed: sale_item_id has never been written by
-- application code (services/api/src/insurance.ts has no write path for
-- it yet), so every existing row has it NULL.

ALTER TABLE insurance_policies
  ADD CONSTRAINT insurance_policies_sale_item_tenant_fk
    FOREIGN KEY (agency_id, sale_item_id) REFERENCES sale_items (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;
