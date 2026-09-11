-- ============================================================
-- CLIENT ONBOARDING: secure remote enrollment link flow
-- EnrollmentLink, EnrollmentSubmission, EnrollmentDocument (metadata-only,
-- consistent with customer_documents), EnrollmentReview (folded into
-- enrollment_submissions.review_* columns rather than a separate table --
-- one review per submission, no multiplicity requirement).
--
-- Security posture (see security/NON_NEGOTIABLES.md "Tokens publicos"):
--   * the public token itself is NEVER stored -- only its sha256 hash
--     (token_hash), mirroring the account-id hashing pattern already used
--     in rate-limit.ts (hashAccountId). The raw token is handed to the
--     caller exactly once, at creation time, and never persisted.
--   * expires_at + revoked_at give fail-closed expiry/revocation.
--   * enrollment_submissions/enrollment_documents are tenant-scoped like
--     every other table here: agency_id, RLS ENABLE + FORCE, tenant
--     policies, FK back to enrollment_links within the same tenant.
-- ============================================================

CREATE TYPE "EnrollmentLinkStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE enrollment_links (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  status "EnrollmentLinkStatus" NOT NULL DEFAULT 'ACTIVE',
  owner_user_id TEXT,
  created_by_user_id TEXT NOT NULL,
  label TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT enrollment_links_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT enrollment_links_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT enrollment_links_created_by_tenant_fk
    FOREIGN KEY (agency_id, created_by_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT enrollment_links_owner_tenant_fk
    FOREIGN KEY (agency_id, owner_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- token_hash is looked up globally by the public endpoint (it does not yet
-- know the tenant -- the token IS how the tenant gets resolved), so the
-- uniqueness/index must be global, not agency-scoped.
CREATE UNIQUE INDEX enrollment_links_token_hash_key ON enrollment_links (token_hash);
CREATE INDEX enrollment_links_agency_idx ON enrollment_links (agency_id);

ALTER TABLE enrollment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_links FORCE ROW LEVEL SECURITY;

CREATE POLICY enrollment_links_select_tenant ON enrollment_links
  FOR SELECT
  USING (agency_id = current_agency_id());

-- Narrow, additive lookup path for the PUBLIC (unauthenticated) submission
-- endpoint: it does not know the tenant yet -- the token IS how the tenant
-- gets resolved -- so it cannot run under the normal tenant-context
-- transaction. This permissive policy only ever matches the single row
-- whose token_hash equals the exact hash the caller already computed
-- server-side from the presented raw token (see enrollment.ts
-- resolvePublicEnrollmentToken, which runs via withPlatformTransaction and
-- sets app.enrollment_lookup_hash for the duration of that transaction
-- only). It grants no broader read access: an attacker without a valid
-- token cannot make current_setting('app.enrollment_lookup_hash', true)
-- equal any row's token_hash, since it is server-derived, not
-- caller-supplied directly.
CREATE POLICY enrollment_links_select_public_lookup ON enrollment_links
  FOR SELECT
  USING (token_hash = current_setting('app.enrollment_lookup_hash', true));

CREATE POLICY enrollment_links_insert_tenant ON enrollment_links
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY enrollment_links_update_tenant ON enrollment_links
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY enrollment_links_delete_tenant ON enrollment_links
  FOR DELETE
  USING (agency_id = current_agency_id());

-- Lets the public submission flow bump last_used_at on the exact link it
-- already resolved via the hash -- same narrow shape as the SELECT policy
-- above, nothing broader.
CREATE POLICY enrollment_links_update_public_lookup ON enrollment_links
  FOR UPDATE
  USING (token_hash = current_setting('app.enrollment_lookup_hash', true))
  WITH CHECK (token_hash = current_setting('app.enrollment_lookup_hash', true));

-- ------------------------------------------------------------
CREATE TYPE "EnrollmentSubmissionStatus" AS ENUM (
  'SUBMITTED',
  'CHANGES_REQUESTED',
  'APPROVED',
  'REJECTED'
);

CREATE TABLE enrollment_submissions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  enrollment_link_id TEXT NOT NULL,
  status "EnrollmentSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  cpf TEXT,
  birth_date DATE,
  dependents JSONB NOT NULL DEFAULT '[]'::jsonb,
  wish_destination TEXT,
  wish_notes TEXT,
  consent_given BOOLEAN NOT NULL DEFAULT false,
  consent_text_version TEXT,
  consent_given_at TIMESTAMPTZ,
  consent_ip TEXT,
  reviewed_by_user_id TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  customer_id TEXT,
  wish_id TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT enrollment_submissions_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT enrollment_submissions_link_tenant_fk
    FOREIGN KEY (agency_id, enrollment_link_id) REFERENCES enrollment_links (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT enrollment_submissions_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT enrollment_submissions_reviewer_tenant_fk
    FOREIGN KEY (agency_id, reviewed_by_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT enrollment_submissions_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT enrollment_submissions_consent_check
    CHECK (consent_given = false OR consent_given_at IS NOT NULL),
  -- LGPD-style consent must be captured at submission time; the raw text
  -- version is intentionally not itself a full consent-management system
  -- (see AGENT_02 mission "dont build a full consent-management system").
  CONSTRAINT enrollment_submissions_approval_check
    CHECK (status <> 'APPROVED' OR customer_id IS NOT NULL)
);

CREATE INDEX enrollment_submissions_agency_idx
  ON enrollment_submissions (agency_id, status);
CREATE INDEX enrollment_submissions_link_idx
  ON enrollment_submissions (agency_id, enrollment_link_id);

ALTER TABLE enrollment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_submissions FORCE ROW LEVEL SECURITY;

CREATE POLICY enrollment_submissions_select_tenant ON enrollment_submissions
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY enrollment_submissions_insert_tenant ON enrollment_submissions
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

-- Public (unauthenticated) submission path: no tenant context exists yet,
-- so this INSERT is only permitted when agency_id/enrollment_link_id
-- together match a link whose token_hash equals the server-derived
-- app.enrollment_lookup_hash for this transaction AND that link is
-- currently ACTIVE and unexpired -- enforced again here at the DB layer
-- as defense in depth on top of the identical checks in enrollment.ts.
CREATE POLICY enrollment_submissions_insert_public ON enrollment_submissions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM enrollment_links l
      WHERE l.id = enrollment_submissions.enrollment_link_id
        AND l.agency_id = enrollment_submissions.agency_id
        AND l.token_hash = current_setting('app.enrollment_lookup_hash', true)
        AND l.status = 'ACTIVE'
        AND l.expires_at > now()
    )
  );

CREATE POLICY enrollment_submissions_update_tenant ON enrollment_submissions
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY enrollment_submissions_delete_tenant ON enrollment_submissions
  FOR DELETE
  USING (agency_id = current_agency_id());

-- ------------------------------------------------------------
-- Metadata-only, matching the audited customer_documents pattern (no raw
-- binary upload path in this codebase yet -- see routes/customer-documents.ts).
-- If a real binary upload path is added later, it must apply the full
-- "Uploads" bar from NON_NEGOTIABLES.md (MIME sniffing, size limit, safe
-- filename, tenant-scoped storage, signed/temporary URL).
CREATE TABLE enrollment_documents (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT enrollment_documents_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT enrollment_documents_submission_tenant_fk
    FOREIGN KEY (agency_id, submission_id) REFERENCES enrollment_submissions (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT enrollment_documents_filename_safe_check
    CHECK (original_filename ~ '^[A-Za-z0-9 ._\-]{1,180}$'),
  CONSTRAINT enrollment_documents_size_check
    CHECK (size_bytes IS NULL OR (size_bytes > 0 AND size_bytes <= 26214400))
);

CREATE INDEX enrollment_documents_submission_idx
  ON enrollment_documents (agency_id, submission_id);

ALTER TABLE enrollment_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_documents FORCE ROW LEVEL SECURITY;

CREATE POLICY enrollment_documents_select_tenant ON enrollment_documents
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY enrollment_documents_insert_tenant ON enrollment_documents
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY enrollment_documents_update_tenant ON enrollment_documents
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY enrollment_documents_delete_tenant ON enrollment_documents
  FOR DELETE
  USING (agency_id = current_agency_id());
