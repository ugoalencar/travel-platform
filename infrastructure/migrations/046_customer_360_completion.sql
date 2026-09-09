-- ============================================================
-- CUSTOMER 360: COMPLETION (Dados Pessoais, Contato de Emergência,
-- Requisitos de Viagem, extra Document types)
-- ============================================================
-- All changes additive: new nullable columns, one new tenant-scoped
-- table with RLS, and new enum labels. No existing data is touched.
-- ============================================================

-- PART 1: Remaining "Dados Pessoais" fields on customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS social_name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS marital_status TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS profession TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS id_issuing_authority TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS id_issued_date DATE;

-- PART 2: "Contato de emergência" -- one emergency contact per customer,
-- kept as columns on customers rather than a new table (1:1 relationship,
-- no need for multiplicity or independent RLS scoping).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS emergency_contact_whatsapp TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS emergency_contact_email TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS emergency_contact_notes TEXT;

-- PART 3: Extend DocumentType with the remaining spec types.
-- ALTER TYPE ... ADD VALUE cannot run inside the same transaction as its
-- later use, but is safe as a standalone statement outside a DO block.
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'AUTORIZACAO_VIAGEM';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'CERTIFICADO_VACINACAO';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'SEGURO_VIAGEM';

-- PART 4: Requisitos de viagem (travel requirements checklist)
CREATE TYPE "TravelRequirementType" AS ENUM (
  'PASSAPORTE_VALIDO',
  'VISTO',
  'VACINACAO',
  'SEGURO',
  'AUTORIZACAO',
  'OUTROS'
);

CREATE TYPE "TravelerType" AS ENUM ('CUSTOMER', 'DEPENDENT');

CREATE TABLE travel_requirements (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  traveler_type "TravelerType" NOT NULL DEFAULT 'CUSTOMER',
  dependent_id TEXT,
  trip_id TEXT,
  destination TEXT,
  type "TravelRequirementType" NOT NULL,
  required BOOLEAN NOT NULL DEFAULT true,
  fulfilled BOOLEAN NOT NULL DEFAULT false,
  document_id TEXT,
  expiration_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT travel_requirements_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT travel_requirements_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT travel_requirements_dependent_tenant_fk
    FOREIGN KEY (agency_id, dependent_id) REFERENCES customer_dependents (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT travel_requirements_document_tenant_fk
    FOREIGN KEY (agency_id, document_id) REFERENCES customer_documents (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT travel_requirements_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT travel_requirements_dependent_consistency_check
    CHECK (
      (traveler_type = 'DEPENDENT' AND dependent_id IS NOT NULL) OR
      (traveler_type = 'CUSTOMER' AND dependent_id IS NULL)
    )
);

CREATE INDEX travel_requirements_agency_customer_idx
  ON travel_requirements (agency_id, customer_id)
  WHERE deleted_at IS NULL;

ALTER TABLE travel_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_requirements FORCE ROW LEVEL SECURITY;

CREATE POLICY travel_requirements_select_tenant ON travel_requirements
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY travel_requirements_insert_tenant ON travel_requirements
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY travel_requirements_update_tenant ON travel_requirements
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY travel_requirements_delete_tenant ON travel_requirements
  FOR DELETE
  USING (agency_id = current_agency_id());
