-- ============================================================
-- CUSTOMER 360: CORE FIELDS & STRUCTURED ADDRESSES
-- ============================================================
-- Extends customer profile with national ID fields and creates
-- a structured address management system to replace legacy JSON.
--
-- Key additions:
-- - 5 new customer fields: rg, national_id_type, birth_date,
--   nationality, whatsapp
-- - AddressType ENUM (RESIDENTIAL, COMMERCIAL, TEMPORARY)
-- - customer_addresses table with tenant scoping and multi-address support
-- - One primary address per customer per tenant (enforced)
--
-- All changes are additive. No modifications to existing migrations
-- or tables (except customer_addresses table creation + columns).
-- ============================================================

-- ============================================================
-- PART 1: EXTEND CUSTOMERS TABLE
-- ============================================================
-- Add 5 new nullable columns for customer profile enhancement.
-- These are optional fields used for enhanced KYC and contact info.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS rg TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS national_id_type TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS nationality TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp TEXT;

-- ============================================================
-- PART 2: CREATE AddressType ENUM
-- ============================================================

CREATE TYPE "AddressType" AS ENUM (
  'RESIDENTIAL',
  'COMMERCIAL',
  'TEMPORARY'
);

-- ============================================================
-- PART 3: CREATE CUSTOMER_ADDRESSES TABLE
-- ============================================================
-- Structured address management for customers.
-- - Tenant-scoped with (agency_id, id) composite PK
-- - Composite FK to customers via (agency_id, customer_id)
-- - Supports multiple addresses per customer
-- - One primary address per customer per tenant
-- - Soft-delete support via deleted_at

CREATE TABLE IF NOT EXISTS customer_addresses (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  type "AddressType" NOT NULL DEFAULT 'RESIDENTIAL',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  cep TEXT,
  street TEXT NOT NULL,
  number TEXT NOT NULL,
  complement TEXT,
  district TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'Brazil',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  -- Composite FK: agency_id + customer_id -> customers(agency_id, id)
  CONSTRAINT customer_addresses_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id)
    REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT,

  -- Single FK: agency_id -> agencies(id)
  CONSTRAINT customer_addresses_agency_fk
    FOREIGN KEY (agency_id)
    REFERENCES agencies (id)
    ON DELETE RESTRICT,

  -- Tenant scoping: unique (agency_id, id)
  CONSTRAINT customer_addresses_agency_id_key
    UNIQUE (agency_id, id),

  -- One primary address per customer per tenant (WHERE is_primary = true)
  CONSTRAINT customer_addresses_one_primary_per_customer
    UNIQUE (agency_id, customer_id, is_primary)
    WHERE is_primary = true,

  -- CHECK: Required fields are not blank
  CONSTRAINT customer_addresses_not_blank_check
    CHECK (
      street <> '' AND
      number <> '' AND
      district <> '' AND
      city <> '' AND
      state <> ''
    )
);

-- ============================================================
-- PART 4: INDEXES
-- ============================================================
-- Optimize common query patterns for address lookups.

-- Index for listing active addresses per customer
CREATE INDEX IF NOT EXISTS customer_addresses_agency_customer_idx
  ON customer_addresses (agency_id, customer_id)
  WHERE deleted_at IS NULL;

-- Index for finding primary address of a customer
CREATE INDEX IF NOT EXISTS customer_addresses_agency_customer_primary_idx
  ON customer_addresses (agency_id, customer_id, is_primary)
  WHERE deleted_at IS NULL AND is_primary = true;
