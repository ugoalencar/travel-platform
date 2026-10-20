-- ============================================================
-- TRAVELER 360 INTERNACIONAL (Agent 05)
-- ============================================================
-- Extends the existing Customer 360 surface with the international-travel
-- profile fields from docs/travel_platform_mega_pack/architecture/
-- TRAVELER_AND_FORMS.md: identity (passport name, dual citizenship, birth/
-- residence country), international contact fields, loyalty programs and
-- flexible travel preferences. Passport and visa RECORDS reuse the existing
-- `customer_documents` table (DocumentType.PASSAPORTE / .VISTO already
-- cover number/issuing country/authority/issue+expiry/holder name/
-- nationality/verification status/verified-by/at) -- this migration only
-- adds the missing capability for a document to belong to a dependent
-- instead of the customer themselves, and extends `customer_addresses`
-- with nothing new (it already models international addresses: street/
-- number/complement/district/city/state/country/cep are country-agnostic).
--
-- All changes additive: new nullable columns, sensible defaults, and one
-- new tenant-scoped table with RLS. No existing data is touched.
-- ============================================================

-- PART 1: Remaining "Identidade" fields (name as in passport, dual
-- citizenship, birth/residence country) plus international contact fields.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS passport_full_name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS dual_citizenship BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS dual_citizenship_country TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS birth_country TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS birth_city TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS residence_country TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS international_phone TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS preferred_language TEXT;

-- PART 2: "Preferências" -- a flexible, documented JSONB blob rather than one
-- column per field (list is long and agency-specific extensions are
-- expected). Shape (all keys optional):
--   {
--     "preferredAirport": string,
--     "seatPreference": string,
--     "mealPreference": string,
--     "baggagePreference": string,
--     "preferredAirline": string,
--     "hotelCategory": string,
--     "roomType": string,
--     "bedType": string,
--     "transferPreference": string,
--     "accessibilityNeeds": string,
--     "dietaryRestrictions": string,
--     "notes": string
--   }
-- Mirrors the JSONB-blob convention already used for `customers.address`
-- and `enrollment_submissions.dependents`.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS travel_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

-- PART 3: Passport/visa documents belonging to a dependent rather than the
-- customer themselves. `customer_documents` already carries every field the
-- spec asks for (number/issuing country/authority/issue+expiry/name-on-
-- document/nationality/status/verified-by/at); it only ever supported the
-- customer as the document holder. This is additive and defaults to NULL
-- (= the customer is the holder, unchanged behavior for every existing row).
ALTER TABLE customer_documents ADD COLUMN IF NOT EXISTS dependent_id TEXT;

ALTER TABLE customer_documents
  ADD CONSTRAINT customer_documents_dependent_tenant_fk
    FOREIGN KEY (agency_id, dependent_id) REFERENCES customer_dependents (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS customer_documents_agency_dependent_idx
  ON customer_documents (agency_id, dependent_id)
  WHERE deleted_at IS NULL AND dependent_id IS NOT NULL;

-- PART 4: Loyalty programs (airline/hotel/car-rental frequent-traveler
-- numbers). Multiplicity per traveler (customer or dependent) warrants its
-- own tenant-scoped table, following the customer_dependents/
-- customer_addresses pattern (soft delete, agency_id + composite tenant FK).
CREATE TYPE "LoyaltyProgramType" AS ENUM ('AEREO', 'HOTEL', 'LOCADORA', 'OUTRO');

CREATE TABLE customer_loyalty_programs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  dependent_id TEXT,
  program_type "LoyaltyProgramType" NOT NULL DEFAULT 'OUTRO',
  program_name TEXT NOT NULL,
  member_number TEXT NOT NULL,
  tier TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT customer_loyalty_programs_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT customer_loyalty_programs_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT customer_loyalty_programs_dependent_tenant_fk
    FOREIGN KEY (agency_id, dependent_id) REFERENCES customer_dependents (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT customer_loyalty_programs_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT customer_loyalty_programs_program_name_not_blank_check
    CHECK (length(trim(program_name)) > 0),
  CONSTRAINT customer_loyalty_programs_member_number_not_blank_check
    CHECK (length(trim(member_number)) > 0)
);

CREATE INDEX customer_loyalty_programs_agency_customer_idx
  ON customer_loyalty_programs (agency_id, customer_id)
  WHERE deleted_at IS NULL;

ALTER TABLE customer_loyalty_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_loyalty_programs FORCE ROW LEVEL SECURITY;

CREATE POLICY customer_loyalty_programs_select_tenant ON customer_loyalty_programs
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY customer_loyalty_programs_insert_tenant ON customer_loyalty_programs
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY customer_loyalty_programs_update_tenant ON customer_loyalty_programs
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY customer_loyalty_programs_delete_tenant ON customer_loyalty_programs
  FOR DELETE
  USING (agency_id = current_agency_id());
