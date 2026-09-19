-- Migration: Platform Admin Comercial & Parcerias (META PÓS-PILOTO 01)
-- Purpose: Landing CMS, banners, platform-level Partners, Referrals,
--          partner benefits/commissions and a referral credit ledger --
--          all owned by the Travel Plataforma itself (Platform Admin),
--          never by a tenant/agency. Deliberately does NOT touch or
--          reuse the tenant-scoped `commercial_partners` /
--          `partner_commissions` / `partner_campaigns` family (054, 058,
--          059) -- those are an agency's own affiliate program, RLS
--          tenant-scoped by agency_id. This migration's tables are
--          platform-global (no agency_id, no RLS), same convention as
--          `leads`/`plans`/`platform_coupons` (031-033): access is
--          controlled at the application layer by the separate
--          /platform-auth pipeline, not by Postgres RLS -- see ADR-005
--          and 077's rationale for the identical pattern.
-- Status: Marketplace / external inventory / Amadeus / GDS explicitly
--         OUT of scope -- see docs/roadmap/MARKETPLACE_FUTURE.md.
-- Direction: up

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE platform_landing_status AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TYPE platform_landing_section_type AS ENUM (
  'HERO', 'FEATURES', 'WORKFLOW', 'CUSTOMER_PORTAL', 'SECURITY',
  'PARTNERS', 'TESTIMONIALS', 'FAQ', 'CTA'
);

-- Extensible on purpose (spec: "preparar enum/extensibilidade para
-- futuros placements") -- Agency App is deliberately NOT a value here
-- yet; adding it requires an explicit future product decision.
CREATE TYPE platform_banner_placement AS ENUM ('LANDING', 'PLATFORM_ADMIN');

CREATE TYPE platform_banner_status AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED');

CREATE TYPE platform_partner_category AS ENUM (
  'TECHNOLOGY', 'PAYMENTS', 'INSURANCE', 'TRAVEL_SERVICES',
  'EDUCATION', 'MARKETING', 'OTHER'
);

CREATE TYPE platform_partner_status AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING');

CREATE TYPE platform_referrer_type AS ENUM ('PARTNER', 'AGENCY', 'MANUAL', 'CAMPAIGN');

CREATE TYPE platform_referral_status AS ENUM (
  'LEAD', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'REJECTED'
);

CREATE TYPE platform_benefit_type AS ENUM (
  'FIXED_COMMISSION', 'PERCENTAGE_COMMISSION', 'MONTHLY_CREDIT',
  'PERCENTAGE_CREDIT', 'MANUAL_BENEFIT'
);

CREATE TYPE platform_benefit_status AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED');

CREATE TYPE platform_credit_status AS ENUM ('PENDING', 'AVAILABLE', 'APPLIED', 'CANCELLED');

CREATE TYPE platform_commission_status AS ENUM ('PENDING', 'APPROVED', 'PAID', 'CANCELLED');

-- ============================================================
-- 1. LANDING CMS
-- ============================================================
-- Singleton-per-row working/draft copy. The public landing NEVER reads
-- this table directly -- only `platform_landing_publications` (below),
-- which stores an immutable JSONB snapshot taken at publish time. This
-- is what makes "a landing pública deve consumir somente conteúdo
-- PUBLISHED" true by construction, not by convention.
CREATE TABLE platform_landing_page (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  slug TEXT NOT NULL UNIQUE DEFAULT 'main',
  hero_title TEXT,
  hero_subtitle TEXT,
  hero_image_url TEXT,
  cta_primary_label TEXT,
  cta_primary_url TEXT,
  cta_secondary_label TEXT,
  cta_secondary_url TEXT,
  footer_content TEXT,
  seo_title TEXT,
  seo_description TEXT,
  og_image_url TEXT,
  status platform_landing_status NOT NULL DEFAULT 'DRAFT',
  last_published_at TIMESTAMPTZ,
  updated_by TEXT REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE platform_landing_sections (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  page_id TEXT NOT NULL REFERENCES platform_landing_page(id) ON DELETE CASCADE,
  type platform_landing_section_type NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  title TEXT,
  subtitle TEXT,
  content TEXT,
  image_url TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX platform_landing_sections_page_idx ON platform_landing_sections(page_id, sort_order);

-- Append-only publish history. "Current live content" = the most recent
-- row for a given page_id (highest published_at). Editing the draft
-- tables above never changes any row here -- only an explicit publish
-- action inserts a new snapshot.
CREATE TABLE platform_landing_publications (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  page_id TEXT NOT NULL REFERENCES platform_landing_page(id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL,
  published_by TEXT REFERENCES platform_users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX platform_landing_publications_page_idx
  ON platform_landing_publications(page_id, published_at DESC);

-- ============================================================
-- 2. BANNERS / CAMPANHAS
-- ============================================================

CREATE TABLE platform_banners (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  title TEXT NOT NULL,
  subtitle TEXT,
  image_url TEXT,
  cta_label TEXT,
  cta_url TEXT,
  placement platform_banner_placement NOT NULL,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  status platform_banner_status NOT NULL DEFAULT 'DRAFT',
  sort_order INT NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_banners_period_chk CHECK (
    starts_at IS NULL OR ends_at IS NULL OR starts_at <= ends_at
  )
);

CREATE INDEX platform_banners_placement_idx ON platform_banners(placement, status, sort_order);

-- ============================================================
-- 3. PARTNERS (platform-level -- e.g. logos shown on the public landing;
--    NOT the tenant-scoped commercial_partners affiliate program)
-- ============================================================

CREATE TABLE platform_partners (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  category platform_partner_category NOT NULL,
  description TEXT,
  website_url TEXT,
  contact_name TEXT,
  contact_email TEXT,
  status platform_partner_status NOT NULL DEFAULT 'PENDING',
  featured BOOLEAN NOT NULL DEFAULT false,
  -- Explicit public-display gate (spec section 5): only partners marked
  -- public may ever be exposed by the public-facing landing endpoint.
  -- internal_notes/contact fields are never selected by that endpoint
  -- regardless of this flag -- see platform-commercial.ts.
  is_public BOOLEAN NOT NULL DEFAULT false,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  internal_notes TEXT,
  created_by TEXT REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX platform_partners_category_idx ON platform_partners(category, status);
CREATE INDEX platform_partners_public_idx ON platform_partners(is_public, featured) WHERE is_public = true;

-- ============================================================
-- 4. REFERRALS
-- ============================================================

CREATE TABLE platform_referrals (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  referrer_type platform_referrer_type NOT NULL,
  -- Polymorphic on purpose (PARTNER -> platform_partners.id, AGENCY ->
  -- agencies.id, MANUAL/CAMPAIGN -> no referenced row) -- no single FK
  -- target exists across all 4 referrer_type values, so this is
  -- validated at the application layer, not by a DB constraint.
  referrer_id TEXT,
  referred_agency_name TEXT NOT NULL,
  referred_contact TEXT,
  status platform_referral_status NOT NULL DEFAULT 'LEAD',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  converted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX platform_referrals_status_idx ON platform_referrals(status);
CREATE INDEX platform_referrals_referrer_idx ON platform_referrals(referrer_type, referrer_id);

-- ============================================================
-- 5. BENEFÍCIOS / COMISSIONAMENTO (commercial rule -- does NOT compute
--    or touch real SaaS billing; see 7/8/9 in the source spec)
-- ============================================================

CREATE TABLE platform_partner_benefits (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  partner_id TEXT REFERENCES platform_partners(id) ON DELETE CASCADE,
  referral_id TEXT REFERENCES platform_referrals(id) ON DELETE SET NULL,
  benefit_type platform_benefit_type NOT NULL,
  value NUMERIC(14, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  status platform_benefit_status NOT NULL DEFAULT 'ACTIVE',
  created_by TEXT REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX platform_partner_benefits_partner_idx ON platform_partner_benefits(partner_id);

-- ============================================================
-- 6. CRÉDITOS (referral credit ledger -- does NOT alter real monthly
--    billing; purely a record of credit owed/applied)
-- ============================================================

CREATE TABLE platform_referral_credits (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id TEXT,
  amount NUMERIC(14, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  status platform_credit_status NOT NULL DEFAULT 'PENDING',
  created_by TEXT REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ
);

CREATE INDEX platform_referral_credits_agency_idx ON platform_referral_credits(agency_id, status);

-- ============================================================
-- 7. COMISSÕES (partner commission -- distinct table from the
--    tenant-scoped partner_commissions in 054; no automatic payment)
-- ============================================================

CREATE TABLE platform_partner_commissions (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  partner_id TEXT NOT NULL REFERENCES platform_partners(id) ON DELETE CASCADE,
  referral_id TEXT REFERENCES platform_referrals(id) ON DELETE SET NULL,
  amount NUMERIC(14, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  status platform_commission_status NOT NULL DEFAULT 'PENDING',
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX platform_partner_commissions_partner_idx ON platform_partner_commissions(partner_id, status);

-- ============================================================
-- 8. AUDITORIA
-- ============================================================
-- Deliberately NOT a new table -- reuses the existing generic
-- `platform_audit_logs` (034), which already has actor/action/
-- resource_type/resource_id/changes/reason/created_at. Every mutating
-- route added for this feature set writes one row there (resource_type
-- values: 'landing_page', 'landing_section', 'banner', 'partner',
-- 'referral', 'partner_benefit', 'referral_credit',
-- 'partner_commission'). No new audit table needed or created here.

-- ============================================================
-- GRANTS -- same rationale/pattern as 077: these are platform-global
-- tables (no RLS, no agency_id-scoped access boundary except
-- platform_referral_credits, which has an agency_id FK but is written
-- exclusively by Platform Admin, never by tenant/agency runtime code
-- paths -- so it follows the platform-global grant convention too).
-- ============================================================

DO $$
DECLARE
  runtime_role TEXT;
BEGIN
  FOREACH runtime_role IN ARRAY ARRAY['travel_app_runtime_local', 'travel_app_runtime']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO %I',
        'platform_landing_page, platform_landing_sections, platform_banners, '
        || 'platform_partners, platform_referrals, platform_partner_benefits, '
        || 'platform_referral_credits, platform_partner_commissions',
        runtime_role
      );

      -- Append-only, same convention as _audit/_log tables in 077.
      EXECUTE format(
        'GRANT SELECT, INSERT ON %s TO %I',
        'platform_landing_publications',
        runtime_role
      );
      EXECUTE format(
        'REVOKE UPDATE, DELETE ON %s FROM %I',
        'platform_landing_publications',
        runtime_role
      );
    END IF;
  END LOOP;
END $$;

-- DROP TABLE platform_partner_commissions;
-- DROP TABLE platform_referral_credits;
-- DROP TABLE platform_partner_benefits;
-- DROP TABLE platform_referrals;
-- DROP TABLE platform_partners;
-- DROP TABLE platform_banners;
-- DROP TABLE platform_landing_publications;
-- DROP TABLE platform_landing_sections;
-- DROP TABLE platform_landing_page;
-- DROP TYPE platform_commission_status;
-- DROP TYPE platform_credit_status;
-- DROP TYPE platform_benefit_status;
-- DROP TYPE platform_benefit_type;
-- DROP TYPE platform_referral_status;
-- DROP TYPE platform_referrer_type;
-- DROP TYPE platform_partner_status;
-- DROP TYPE platform_partner_category;
-- DROP TYPE platform_banner_status;
-- DROP TYPE platform_banner_placement;
-- DROP TYPE platform_landing_section_type;
-- DROP TYPE platform_landing_status;
