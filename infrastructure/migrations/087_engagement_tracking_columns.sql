-- ============================================================
-- CUSTOMER ENGAGEMENT TRACKING -- entity columns
-- ============================================================
-- Companion to 086_engagement_tracking.sql (new EngagementType
-- values). Split into its own migration because the new enum values
-- added there cannot be referenced in the same transaction that added
-- them; this file only touches columns/indexes/constraints, so it has
-- no such restriction, but is kept separate to mirror the two-step
-- shape already established for engagement type changes.
--
-- engagements already had offer_id (014_offer_growth_foundation.sql).
-- Adds proposal_id, trip_id, communication_id -- the three additional
-- entity types the new view events need to relate to.
-- ============================================================

ALTER TABLE engagements ADD COLUMN proposal_id TEXT;
ALTER TABLE engagements ADD COLUMN trip_id TEXT;
ALTER TABLE engagements ADD COLUMN communication_id TEXT;

ALTER TABLE engagements
  ADD CONSTRAINT engagements_proposal_tenant_fk
    FOREIGN KEY (agency_id, proposal_id) REFERENCES proposals (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE engagements
  ADD CONSTRAINT engagements_trip_tenant_fk
    FOREIGN KEY (agency_id, trip_id) REFERENCES trips (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE engagements
  ADD CONSTRAINT engagements_communication_tenant_fk
    FOREIGN KEY (agency_id, communication_id) REFERENCES agency_communications (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Revisit-window lookup ("has this customer viewed this entity
-- recently?") and Customer 360 aggregation both filter by
-- (agency_id, customer_id, type, <entity>_id) and sort by occurred_at,
-- so this single composite index covers both real query shapes without
-- needing a separate index per entity column.
CREATE INDEX engagements_agency_customer_type_idx
  ON engagements (agency_id, customer_id, type, occurred_at DESC);
