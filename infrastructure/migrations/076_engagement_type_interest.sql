-- ============================================================
-- ENGAGEMENT TYPE: INTEREST
-- ============================================================
-- Customer App visual reconstruction (Direction A, Phase 2): the
-- Offers screen's "Tenho interesse" CTA needs to record a real,
-- actionable signal the agency can follow up on -- reusing the
-- existing engagements table/service (offer_id/customer_id columns
-- already existed, but no HTTP route ever exposed recording one, and
-- no EngagementType value represented "customer expressed interest").
--
-- ALTER TYPE ... ADD VALUE cannot run inside the same transaction as
-- its later use, but is safe as a standalone statement (same pattern
-- as 046_customer_360_completion.sql).
-- ============================================================

ALTER TYPE "EngagementType" ADD VALUE IF NOT EXISTS 'INTEREST';
