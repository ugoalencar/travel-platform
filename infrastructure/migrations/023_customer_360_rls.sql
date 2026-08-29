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
