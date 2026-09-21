-- ============================================================
-- CUSTOMER ENGAGEMENT TRACKING
-- ============================================================
-- Adds the digital-behavior view/click event types and entity columns
-- the existing `engagements` table (014_offer_growth_foundation.sql)
-- was missing. Reuses that table entirely -- see
-- docs/product/CUSTOMER_ENGAGEMENT_TRACKING.md for the audit that
-- confirmed no new analytics table was needed.
--
-- `engagements` already covers offer_id/customer_id/agency_id/
-- occurred_at/channel; this migration only adds what's genuinely
-- missing: proposal_id, trip_id, communication_id columns, and the new
-- EngagementType values for OFFER_VIEWED/REVISITED,
-- PROPOSAL_VIEWED/REVISITED, COMMUNICATION_VIEWED/CTA_CLICKED,
-- CUSTOMER_HOME_VIEWED, TRIP_VIEWED.
--
-- ALTER TYPE ... ADD VALUE cannot run inside the same transaction as
-- its later use (same constraint documented in
-- 076_engagement_type_interest.sql) -- each is a standalone statement.
-- ============================================================

ALTER TYPE "EngagementType" ADD VALUE IF NOT EXISTS 'OFFER_VIEWED';
ALTER TYPE "EngagementType" ADD VALUE IF NOT EXISTS 'OFFER_REVISITED';
ALTER TYPE "EngagementType" ADD VALUE IF NOT EXISTS 'PROPOSAL_VIEWED';
ALTER TYPE "EngagementType" ADD VALUE IF NOT EXISTS 'PROPOSAL_REVISITED';
ALTER TYPE "EngagementType" ADD VALUE IF NOT EXISTS 'COMMUNICATION_VIEWED';
ALTER TYPE "EngagementType" ADD VALUE IF NOT EXISTS 'COMMUNICATION_CTA_CLICKED';
ALTER TYPE "EngagementType" ADD VALUE IF NOT EXISTS 'CUSTOMER_HOME_VIEWED';
ALTER TYPE "EngagementType" ADD VALUE IF NOT EXISTS 'TRIP_VIEWED';
