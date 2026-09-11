-- ============================================================
-- CONTRACTS: templates, generated documents, signatories, secure public
-- signature links, signature evidence.
--
-- Security posture (mirrors enrollment_links / invitations exactly, see
-- security/NON_NEGOTIABLES.md "Tokens publicos"):
--   * public signature tokens are NEVER stored raw -- only sha256(token)
--     in signature_link_token_hash. Raw token handed back once at creation.
--   * expires_at + revoked_at + used-up (signed) give fail-closed expiry.
--   * contract_documents / contract_parties are tenant-scoped: agency_id,
--     RLS ENABLE + FORCE, tenant policies, FK back into agency via
--     (agency_id, id) composite pattern used everywhere else here.
--   * a contract never duplicates Sale/Customer/Trip data -- it only
--     references existing rows via (agency_id, id) composite FKs.
-- ============================================================

CREATE TABLE contract_templates (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  body_markdown TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT contract_templates_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT contract_templates_creator_tenant_fk
    FOREIGN KEY (agency_id, created_by_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT contract_templates_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT contract_templates_version_positive_check CHECK (version >= 1)
);

CREATE UNIQUE INDEX contract_templates_agency_name_version_key
  ON contract_templates (agency_id, name, version);
CREATE INDEX contract_templates_agency_idx ON contract_templates (agency_id, is_active);

ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_templates FORCE ROW LEVEL SECURITY;

CREATE POLICY contract_templates_select_tenant ON contract_templates
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY contract_templates_insert_tenant ON contract_templates
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY contract_templates_update_tenant ON contract_templates
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY contract_templates_delete_tenant ON contract_templates
  FOR DELETE USING (agency_id = current_agency_id());

-- ------------------------------------------------------------
CREATE TYPE "ContractDocumentStatus" AS ENUM (
  'DRAFT',
  'READY',
  'SENT',
  'VIEWED',
  'PARTIALLY_SIGNED',
  'SIGNED',
  'DECLINED',
  'CANCELLED',
  'EXPIRED'
);

CREATE TABLE contract_documents (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  status "ContractDocumentStatus" NOT NULL DEFAULT 'DRAFT',
  sale_id TEXT,
  customer_id TEXT,
  trip_id TEXT,
  partner_id TEXT,
  rendered_body TEXT NOT NULL,
  variable_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  first_viewed_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT contract_documents_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT contract_documents_template_tenant_fk
    FOREIGN KEY (agency_id, template_id) REFERENCES contract_templates (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT contract_documents_sale_tenant_fk
    FOREIGN KEY (agency_id, sale_id) REFERENCES sales (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT contract_documents_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT contract_documents_creator_tenant_fk
    FOREIGN KEY (agency_id, created_by_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT contract_documents_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX contract_documents_agency_status_idx ON contract_documents (agency_id, status);
CREATE INDEX contract_documents_sale_idx ON contract_documents (agency_id, sale_id);
CREATE INDEX contract_documents_customer_idx ON contract_documents (agency_id, customer_id);

ALTER TABLE contract_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_documents FORCE ROW LEVEL SECURITY;

CREATE POLICY contract_documents_select_tenant ON contract_documents
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY contract_documents_insert_tenant ON contract_documents
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY contract_documents_update_tenant ON contract_documents
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY contract_documents_delete_tenant ON contract_documents
  FOR DELETE USING (agency_id = current_agency_id());

-- ------------------------------------------------------------
CREATE TYPE "ContractSignatoryStatus" AS ENUM (
  'PENDING',
  'SENT',
  'VIEWED',
  'SIGNED',
  'DECLINED'
);

CREATE TABLE contract_parties (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  contract_document_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  status "ContractSignatoryStatus" NOT NULL DEFAULT 'PENDING',
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT contract_parties_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT contract_parties_document_tenant_fk
    FOREIGN KEY (agency_id, contract_document_id) REFERENCES contract_documents (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT contract_parties_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT contract_parties_email_check CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

CREATE INDEX contract_parties_document_idx ON contract_parties (agency_id, contract_document_id);

ALTER TABLE contract_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_parties FORCE ROW LEVEL SECURITY;

CREATE POLICY contract_parties_select_tenant ON contract_parties
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY contract_parties_insert_tenant ON contract_parties
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY contract_parties_update_tenant ON contract_parties
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY contract_parties_delete_tenant ON contract_parties
  FOR DELETE USING (agency_id = current_agency_id());

-- ------------------------------------------------------------
-- Secure public signature link, one per signatory (contract_party).
-- Same hardened posture as enrollment_links: only sha256 persisted,
-- expires_at + revoked_at + signed-status on the party give fail-closed
-- rejection, generic error for any invalid/expired/revoked/used token.
CREATE TABLE contract_signature_links (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  contract_party_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT contract_signature_links_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT contract_signature_links_party_tenant_fk
    FOREIGN KEY (agency_id, contract_party_id) REFERENCES contract_parties (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT contract_signature_links_agency_id_key UNIQUE (agency_id, id)
);

-- Looked up globally by the public endpoint before tenant is known, exactly
-- like enrollment_links_token_hash_key.
CREATE UNIQUE INDEX contract_signature_links_token_hash_key ON contract_signature_links (token_hash);
CREATE INDEX contract_signature_links_party_idx ON contract_signature_links (agency_id, contract_party_id);

ALTER TABLE contract_signature_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_signature_links FORCE ROW LEVEL SECURITY;

CREATE POLICY contract_signature_links_select_tenant ON contract_signature_links
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY contract_signature_links_insert_tenant ON contract_signature_links
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY contract_signature_links_update_tenant ON contract_signature_links
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY contract_signature_links_delete_tenant ON contract_signature_links
  FOR DELETE USING (agency_id = current_agency_id());

CREATE POLICY contract_signature_links_select_public_lookup ON contract_signature_links
  FOR SELECT USING (token_hash = current_setting('app.contract_lookup_hash', true));

-- Narrow public lookup/update path on contract_parties for the
-- unauthenticated signing page, exactly mirroring
-- enrollment_links_select_public_lookup: only ever matches the single row
-- whose linked signature-link token_hash equals the server-derived
-- app.contract_lookup_hash for this transaction. Added here (after
-- contract_signature_links exists) rather than alongside the other
-- contract_parties policies above, since it references this table.
CREATE POLICY contract_parties_select_public_lookup ON contract_parties
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM contract_signature_links sl
      WHERE sl.contract_party_id = contract_parties.id
        AND sl.agency_id = contract_parties.agency_id
        AND sl.token_hash = current_setting('app.contract_lookup_hash', true)
    )
  );

CREATE POLICY contract_parties_update_public_lookup ON contract_parties
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM contract_signature_links sl
      WHERE sl.contract_party_id = contract_parties.id
        AND sl.agency_id = contract_parties.agency_id
        AND sl.token_hash = current_setting('app.contract_lookup_hash', true)
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM contract_signature_links sl
      WHERE sl.contract_party_id = contract_parties.id
        AND sl.agency_id = contract_parties.agency_id
        AND sl.token_hash = current_setting('app.contract_lookup_hash', true)
    )
  );

-- ------------------------------------------------------------
-- Signature evidence: timestamp, IP, user-agent, and a typed-name intent
-- confirmation. NOT a cryptographic/PKI signature -- see AGENT_03 mission
-- point 5: real e-signature PKI/paid-vendor integration is explicitly out
-- of scope and flagged for human decision, not implemented here.
CREATE TABLE contract_signature_evidence (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  contract_party_id TEXT NOT NULL,
  typed_full_name TEXT NOT NULL,
  intent_confirmed BOOLEAN NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT contract_signature_evidence_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT contract_signature_evidence_party_tenant_fk
    FOREIGN KEY (agency_id, contract_party_id) REFERENCES contract_parties (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT contract_signature_evidence_party_unique UNIQUE (agency_id, contract_party_id),
  CONSTRAINT contract_signature_evidence_intent_check CHECK (intent_confirmed = true)
);

ALTER TABLE contract_signature_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_signature_evidence FORCE ROW LEVEL SECURITY;

CREATE POLICY contract_signature_evidence_select_tenant ON contract_signature_evidence
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY contract_signature_evidence_insert_tenant ON contract_signature_evidence
  FOR INSERT WITH CHECK (agency_id = current_agency_id());

-- Public insert path: the signing endpoint writes evidence within the same
-- token-scoped transaction used to validate + update the party row.
CREATE POLICY contract_signature_evidence_insert_public ON contract_signature_evidence
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM contract_signature_links sl
      WHERE sl.contract_party_id = contract_signature_evidence.contract_party_id
        AND sl.agency_id = contract_signature_evidence.agency_id
        AND sl.token_hash = current_setting('app.contract_lookup_hash', true)
    )
  );
