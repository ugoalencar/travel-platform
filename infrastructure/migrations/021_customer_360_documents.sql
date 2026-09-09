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
