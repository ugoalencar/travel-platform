-- ============================================================
-- CUSTOMER 360: DEPENDENTS / COMPANIONS
-- ============================================================

CREATE TYPE "RelationshipType" AS ENUM ('SPOUSE', 'CHILD', 'PARENT', 'COMPANION', 'OTHER');

CREATE TABLE customer_dependents (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  relationship_type "RelationshipType" NOT NULL,
  birth_date DATE,
  cpf TEXT,
  nationality TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT customer_dependents_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT customer_dependents_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT customer_dependents_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT customer_dependents_name_not_blank_check
    CHECK (length(trim(name)) > 0)
);

CREATE INDEX customer_dependents_agency_customer_idx
  ON customer_dependents (agency_id, customer_id)
  WHERE deleted_at IS NULL;
