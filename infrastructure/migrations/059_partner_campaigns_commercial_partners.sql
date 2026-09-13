-- Migration: Partner Campaigns -> Commercial Partners reconciliation
-- Purpose: replace the local campaign_partner_stubs FK with Agent 04's
-- real commercial_partners tenant-scoped model while preserving any draft
-- stub rows created before this reconciliation.

INSERT INTO commercial_partners (id, agency_id, partner_type, name, status, created_at, updated_at)
SELECT
  id,
  agency_id,
  'PJ',
  name,
  'ACTIVE',
  created_at,
  created_at
FROM campaign_partner_stubs
ON CONFLICT (id) DO NOTHING;

ALTER TABLE partner_campaigns
  DROP CONSTRAINT IF EXISTS partner_campaigns_partner_tenant_fk;

ALTER TABLE partner_campaigns
  ADD CONSTRAINT partner_campaigns_partner_tenant_fk
    FOREIGN KEY (agency_id, partner_id) REFERENCES commercial_partners (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;
