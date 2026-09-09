# Task 3: OCR-Ready Database Tables — All Remaining Migrations & RLS

## Overview
Create four database migrations (020-023) implementing the complete Customer 360 database foundation:
1. Migration 020: Dependents entity (CustomerDependent)
2. Migration 021: Documents + OCR tables (CustomerDocument, DocumentAttachment, DocumentExtraction, DocumentVerification)
3. Migration 022: Document audit trail (DocumentAuditEvent)
4. Migration 023: RLS policies for all new tables

Update `packages/database/schema.prisma` with all models (append only).

## Deliverables

### Migration 020: Customer Dependents

**File:** `infrastructure/migrations/020_customer_360_dependents.sql`

```sql
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
```

### Migration 021: Documents + OCR Tables

**File:** `infrastructure/migrations/021_customer_360_documents.sql`

```sql
-- ============================================================
-- CUSTOMER 360: DOCUMENTS + OCR FOUNDATION
-- ============================================================

CREATE TYPE "DocumentType" AS ENUM ('PASSAPORTE', 'RG', 'CNH', 'CPF', 'VISTO', 'CERTIDAO', 'OUTRO');
CREATE TYPE "DocumentVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'MISMATCH', 'EXPIRED', 'MANUAL_REVIEW');
CREATE TYPE "DocumentAttachmentType" AS ENUM ('FRONT', 'BACK', 'PASSPORT_PAGE', 'VISA', 'OTHER');
CREATE TYPE "OcrProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'MANUAL_REVIEW');

CREATE TABLE customer_documents (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  document_type "DocumentType" NOT NULL,
  document_number TEXT NOT NULL,
  holder_name TEXT,
  holder_birth_date DATE,
  holder_nationality TEXT,
  issuing_country TEXT,
  issuing_authority TEXT,
  issued_date DATE,
  expiry_date DATE,
  is_expired BOOLEAN GENERATED ALWAYS AS (CASE WHEN expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE THEN true ELSE false END) STORED,
  verification_status "DocumentVerificationStatus" NOT NULL DEFAULT 'PENDING',
  verified_at TIMESTAMPTZ,
  verified_by_user_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT customer_documents_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT customer_documents_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT customer_documents_verified_by_user_tenant_fk
    FOREIGN KEY (agency_id, verified_by_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT customer_documents_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT customer_documents_document_number_not_blank_check
    CHECK (length(trim(document_number)) > 0)
);

CREATE INDEX customer_documents_agency_customer_idx
  ON customer_documents (agency_id, customer_id)
  WHERE deleted_at IS NULL;
CREATE INDEX customer_documents_agency_customer_type_idx
  ON customer_documents (agency_id, customer_id, document_type)
  WHERE deleted_at IS NULL;
CREATE INDEX customer_documents_expiry_idx
  ON customer_documents (agency_id, expiry_date)
  WHERE deleted_at IS NULL AND expiry_date IS NOT NULL;

-- Attachment metadata only (no file blobs in table)
CREATE TABLE document_attachments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  attachment_type "DocumentAttachmentType" NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes INT NOT NULL,
  file_mime_type TEXT NOT NULL,
  secure_file_key TEXT NOT NULL UNIQUE,
  file_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT document_attachments_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT document_attachments_document_tenant_fk
    FOREIGN KEY (agency_id, document_id) REFERENCES customer_documents (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT document_attachments_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX document_attachments_agency_document_idx
  ON document_attachments (agency_id, document_id)
  WHERE deleted_at IS NULL;

-- OCR Extraction (provider-agnostic, extensible)
CREATE TABLE document_extractions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  extracted_data JSONB NOT NULL,
  confidence DECIMAL(5, 2),
  processing_status "OcrProcessingStatus" NOT NULL DEFAULT 'PENDING',
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT document_extractions_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT document_extractions_document_tenant_fk
    FOREIGN KEY (agency_id, document_id) REFERENCES customer_documents (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT document_extractions_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX document_extractions_agency_document_idx
  ON document_extractions (agency_id, document_id);
CREATE INDEX document_extractions_agency_provider_status_idx
  ON document_extractions (agency_id, provider, processing_status);

-- Verification result (compare extraction to customer record)
CREATE TABLE document_verifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  extraction_id TEXT,
  holder_name_match BOOLEAN,
  holder_birth_date_match BOOLEAN,
  holder_nationality_match BOOLEAN,
  document_number_match BOOLEAN,
  discrepancies JSONB,
  manual_review_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT document_verifications_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT document_verifications_document_tenant_fk
    FOREIGN KEY (agency_id, document_id) REFERENCES customer_documents (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT document_verifications_extraction_tenant_fk
    FOREIGN KEY (agency_id, extraction_id) REFERENCES document_extractions (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT document_verifications_reviewed_by_user_tenant_fk
    FOREIGN KEY (agency_id, reviewed_by_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT document_verifications_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX document_verifications_agency_document_idx
  ON document_verifications (agency_id, document_id);
```

### Migration 022: Document Audit Trail

**File:** `infrastructure/migrations/022_customer_360_document_audit.sql`

```sql
-- ============================================================
-- CUSTOMER 360: DOCUMENT AUDIT TRAIL
-- ============================================================

CREATE TYPE "DocumentAuditEventType" AS ENUM ('DOCUMENT_CREATED', 'DOCUMENT_UPDATED', 'ATTACHMENT_UPLOADED', 'ATTACHMENT_DELETED', 'DOCUMENT_VIEWED', 'EXTRACTION_STARTED', 'EXTRACTION_COMPLETED', 'VERIFICATION_COMPLETED', 'DOCUMENT_SOFT_DELETED');

CREATE TABLE document_audit_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  document_id TEXT,
  attachment_id TEXT,
  user_id TEXT,
  customer_id TEXT,
  event_type "DocumentAuditEventType" NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT document_audit_events_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT document_audit_events_document_tenant_fk
    FOREIGN KEY (agency_id, document_id) REFERENCES customer_documents (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT document_audit_events_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT document_audit_events_user_tenant_fk
    FOREIGN KEY (agency_id, user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX document_audit_events_agency_document_idx
  ON document_audit_events (agency_id, document_id);
CREATE INDEX document_audit_events_agency_customer_idx
  ON document_audit_events (agency_id, customer_id);
CREATE INDEX document_audit_events_agency_created_idx
  ON document_audit_events (agency_id, created_at DESC);
```

### Migration 023: RLS Policies for All New Tables

**File:** `infrastructure/migrations/023_customer_360_rls.sql`

```sql
-- ============================================================
-- CUSTOMER 360: RLS POLICIES
-- ============================================================

ALTER TABLE customer_dependents ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_dependents FORCE ROW LEVEL SECURITY;

ALTER TABLE customer_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_documents FORCE ROW LEVEL SECURITY;

ALTER TABLE document_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_attachments FORCE ROW LEVEL SECURITY;

ALTER TABLE document_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_extractions FORCE ROW LEVEL SECURITY;

ALTER TABLE document_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_verifications FORCE ROW LEVEL SECURITY;

ALTER TABLE document_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_audit_events FORCE ROW LEVEL SECURITY;

-- Drop existing policies (idempotent)
DROP POLICY IF EXISTS customer_dependents_select_tenant ON customer_dependents;
DROP POLICY IF EXISTS customer_dependents_insert_tenant ON customer_dependents;
DROP POLICY IF EXISTS customer_dependents_update_tenant ON customer_dependents;
DROP POLICY IF EXISTS customer_dependents_delete_tenant ON customer_dependents;

DROP POLICY IF EXISTS customer_documents_select_tenant ON customer_documents;
DROP POLICY IF EXISTS customer_documents_insert_tenant ON customer_documents;
DROP POLICY IF EXISTS customer_documents_update_tenant ON customer_documents;
DROP POLICY IF EXISTS customer_documents_delete_tenant ON customer_documents;

DROP POLICY IF EXISTS document_attachments_select_tenant ON document_attachments;
DROP POLICY IF EXISTS document_attachments_insert_tenant ON document_attachments;
DROP POLICY IF EXISTS document_attachments_update_tenant ON document_attachments;
DROP POLICY IF EXISTS document_attachments_delete_tenant ON document_attachments;

DROP POLICY IF EXISTS document_extractions_select_tenant ON document_extractions;
DROP POLICY IF EXISTS document_extractions_insert_tenant ON document_extractions;
DROP POLICY IF EXISTS document_extractions_update_tenant ON document_extractions;
DROP POLICY IF EXISTS document_extractions_delete_tenant ON document_extractions;

DROP POLICY IF EXISTS document_verifications_select_tenant ON document_verifications;
DROP POLICY IF EXISTS document_verifications_insert_tenant ON document_verifications;
DROP POLICY IF EXISTS document_verifications_update_tenant ON document_verifications;
DROP POLICY IF EXISTS document_verifications_delete_tenant ON document_verifications;

DROP POLICY IF EXISTS document_audit_events_select_tenant ON document_audit_events;
DROP POLICY IF EXISTS document_audit_events_insert_tenant ON document_audit_events;

-- Customer Dependents policies
CREATE POLICY customer_dependents_select_tenant ON customer_dependents
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY customer_dependents_insert_tenant ON customer_dependents
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY customer_dependents_update_tenant ON customer_dependents
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY customer_dependents_delete_tenant ON customer_dependents
  FOR DELETE
  USING (agency_id = current_agency_id());

-- Customer Documents policies
CREATE POLICY customer_documents_select_tenant ON customer_documents
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY customer_documents_insert_tenant ON customer_documents
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY customer_documents_update_tenant ON customer_documents
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY customer_documents_delete_tenant ON customer_documents
  FOR DELETE
  USING (agency_id = current_agency_id());

-- Document Attachments policies
CREATE POLICY document_attachments_select_tenant ON document_attachments
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY document_attachments_insert_tenant ON document_attachments
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY document_attachments_update_tenant ON document_attachments
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY document_attachments_delete_tenant ON document_attachments
  FOR DELETE
  USING (agency_id = current_agency_id());

-- Document Extractions policies
CREATE POLICY document_extractions_select_tenant ON document_extractions
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY document_extractions_insert_tenant ON document_extractions
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY document_extractions_update_tenant ON document_extractions
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY document_extractions_delete_tenant ON document_extractions
  FOR DELETE
  USING (agency_id = current_agency_id());

-- Document Verifications policies
CREATE POLICY document_verifications_select_tenant ON document_verifications
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY document_verifications_insert_tenant ON document_verifications
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY document_verifications_update_tenant ON document_verifications
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY document_verifications_delete_tenant ON document_verifications
  FOR DELETE
  USING (agency_id = current_agency_id());

-- Document Audit Events (insert-only)
CREATE POLICY document_audit_events_select_tenant ON document_audit_events
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY document_audit_events_insert_tenant ON document_audit_events
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());
```

### Schema.prisma Updates

Append the following models and enums to `packages/database/schema.prisma` (APPEND ONLY):

**Models:**
- CustomerDependent + RelationshipType enum
- CustomerDocument + DocumentType + DocumentVerificationStatus enums
- DocumentAttachment + DocumentAttachmentType enum
- DocumentExtraction + OcrProcessingStatus enum
- DocumentVerification
- DocumentAuditEvent + DocumentAuditEventType enum

**Relations to update:**
- Customer: add `dependents`, `documents`, `documentAuditEvents` relations
- Agency: add `documentAuditEvents` relation
- User: add `verifiedDocuments`, `reviewedDocuments`, `documentAuditEvents` relations

## Testing & Validation

1. All four migrations apply cleanly to test database
2. Schema validates: `npx prisma validate`
3. No typecheck errors: `npx tsc --noEmit`
4. No lint errors: `npm run lint`
5. Commits follow convention

## Global Constraints

- ✓ Additive migrations only (no edits to 001-019)
- ✓ All tables tenant-scoped with (agency_id, id) composite FK
- ✓ RLS policies mirror existing patterns
- ✓ No breaking changes to existing schema
- ✓ P0 = 0, P1 = 0

## Report File

Write report to: `D:\travel-platform\.superpowers\sdd\task-3-report.md`

Include:
1. All 4 migrations created (yes/no)
2. Schema updated (yes/no)
3. Validation results (typecheck, lint, prisma validate)
4. Commits (base, head, log)
5. Any concerns

## Success Criteria

- [ ] All 4 migrations (020-023) exist and apply cleanly
- [ ] Schema.prisma updated with all models (append only)
- [ ] Typecheck pass
- [ ] Lint pass
- [ ] Prisma validate pass
- [ ] RLS policies correctly configured
- [ ] Single commit: "feat(database): add Customer 360 dependents, documents, OCR, and audit tables with RLS"
- [ ] Report completed
