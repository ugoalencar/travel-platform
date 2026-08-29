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
