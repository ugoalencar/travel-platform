-- ============================================================
-- PARTNER PORTAL (Agent 04): CommercialPartner, PartnerContract,
-- PartnerLink, PartnerAttribution, PartnerCommission.
--
-- A CommercialPartner is an EXTERNAL affiliate/agent -- explicitly
-- separate from `employees` (internal staff, see
-- 042_employees_commission_plans.sql). Partner commissions converge into
-- the SAME `payables` table used by employee commissions (Wave B) and
-- supplier payables (Wave A) -- no parallel AP/AR/Cash is created here
-- (architecture/DOMAIN_BLUEPRINT.md "Regra Financeira").
--
-- Security posture for PartnerLink (see security/NON_NEGOTIABLES.md
-- "Tokens publicos"), mirrors enrollment_links exactly:
--   * high-entropy token: crypto.randomBytes(32); only the sha256 hash is
--     ever persisted (token_hash). The raw token is returned to the
--     caller exactly once, at creation time.
--   * expiry (nullable = no expiry, campaign links may be long-lived) +
--     revocation both fail closed.
--   * the public resolve/convert path never lets the caller choose or
--     leak which tenant/partner a token belongs to: it resolves ONLY via
--     the hash, and invalid/expired/revoked/unknown tokens all produce
--     the identical generic rejection at the application layer.
--
-- PartnerAttribution is server-side only: it is created from the token
-- that was actually resolved server-side at conversion time -- callers
-- never supply a partnerId directly on the public conversion path.
-- ============================================================

-- ------------------------------------------------------------
-- CommercialPartner
-- ------------------------------------------------------------

CREATE TABLE commercial_partners (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id         TEXT NOT NULL,
  partner_type      TEXT NOT NULL,
  name              TEXT NOT NULL,
  document          TEXT,
  email             TEXT,
  phone             TEXT,
  manager_user_id   TEXT,
  bank_name         TEXT,
  bank_branch       TEXT,
  bank_account      TEXT,
  bank_pix_key      TEXT,
  status            TEXT NOT NULL DEFAULT 'ACTIVE',
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT commercial_partners_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT commercial_partners_name_not_blank_check
    CHECK (length(trim(name)) > 0),
  CONSTRAINT commercial_partners_partner_type_check
    CHECK (partner_type IN ('PF', 'PJ')),
  CONSTRAINT commercial_partners_status_check
    CHECK (status IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT commercial_partners_manager_tenant_fk
    FOREIGN KEY (agency_id, manager_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT commercial_partners_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX commercial_partners_agency_status_idx ON commercial_partners (agency_id, status);
CREATE INDEX commercial_partners_agency_manager_idx ON commercial_partners (agency_id, manager_user_id);

ALTER TABLE commercial_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_partners FORCE ROW LEVEL SECURITY;

CREATE POLICY commercial_partners_select_tenant ON commercial_partners
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY commercial_partners_insert_tenant ON commercial_partners
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY commercial_partners_update_tenant ON commercial_partners
  FOR UPDATE USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());
CREATE POLICY commercial_partners_delete_tenant ON commercial_partners
  FOR DELETE USING (agency_id = current_agency_id());

-- ------------------------------------------------------------
-- PartnerContract (lightweight for now -- not wired into a
-- ContractTemplate/SignatureRequest e-signature flow, per mission: "esse
-- e-signature flow e trabalho de um agente paralelo (Agent 03); apenas
-- modelar os dados aqui e sinalizar a integracao como follow-up quando o
-- contrato do Agent 03 estiver disponivel").
-- ------------------------------------------------------------

CREATE TABLE partner_contracts (
  id                     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id              TEXT NOT NULL,
  partner_id             TEXT NOT NULL,
  commission_percentage  NUMERIC(7, 4) NOT NULL,
  terms                  TEXT,
  status                 TEXT NOT NULL DEFAULT 'ACTIVE',
  starts_at              DATE,
  ends_at                DATE,
  created_by_user_id     TEXT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT partner_contracts_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT partner_contracts_partner_tenant_fk
    FOREIGN KEY (agency_id, partner_id) REFERENCES commercial_partners (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT partner_contracts_created_by_tenant_fk
    FOREIGN KEY (agency_id, created_by_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT partner_contracts_status_check
    CHECK (status IN ('ACTIVE', 'ENDED', 'CANCELLED')),
  CONSTRAINT partner_contracts_percentage_range_check
    CHECK (commission_percentage >= 0 AND commission_percentage <= 100),
  CONSTRAINT partner_contracts_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX partner_contracts_agency_partner_idx ON partner_contracts (agency_id, partner_id);
CREATE INDEX partner_contracts_agency_status_idx ON partner_contracts (agency_id, status);

ALTER TABLE partner_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_contracts FORCE ROW LEVEL SECURITY;

CREATE POLICY partner_contracts_select_tenant ON partner_contracts
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY partner_contracts_insert_tenant ON partner_contracts
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY partner_contracts_update_tenant ON partner_contracts
  FOR UPDATE USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());
CREATE POLICY partner_contracts_delete_tenant ON partner_contracts
  FOR DELETE USING (agency_id = current_agency_id());

-- ------------------------------------------------------------
-- PartnerLink (trackable tokenized link a partner shares)
-- ------------------------------------------------------------

CREATE TABLE partner_links (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id          TEXT NOT NULL,
  partner_id         TEXT NOT NULL,
  token_hash         TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'ACTIVE',
  label              TEXT,
  target_path        TEXT,
  expires_at         TIMESTAMPTZ,
  revoked_at         TIMESTAMPTZ,
  last_used_at       TIMESTAMPTZ,
  created_by_user_id TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT partner_links_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT partner_links_partner_tenant_fk
    FOREIGN KEY (agency_id, partner_id) REFERENCES commercial_partners (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT partner_links_created_by_tenant_fk
    FOREIGN KEY (agency_id, created_by_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT partner_links_status_check
    CHECK (status IN ('ACTIVE', 'REVOKED')),
  CONSTRAINT partner_links_agency_id_key UNIQUE (agency_id, id)
);

-- token_hash is looked up globally by the public endpoint (it does not yet
-- know the tenant -- the token IS how the tenant gets resolved), so the
-- uniqueness/index must be global, not agency-scoped. Mirrors
-- enrollment_links_token_hash_key exactly.
CREATE UNIQUE INDEX partner_links_token_hash_key ON partner_links (token_hash);
CREATE INDEX partner_links_agency_partner_idx ON partner_links (agency_id, partner_id);

ALTER TABLE partner_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_links FORCE ROW LEVEL SECURITY;

CREATE POLICY partner_links_select_tenant ON partner_links
  FOR SELECT USING (agency_id = current_agency_id());

-- Narrow, additive lookup path for the PUBLIC (unauthenticated) link
-- resolution/conversion endpoint -- identical shape to
-- enrollment_links_select_public_lookup.
CREATE POLICY partner_links_select_public_lookup ON partner_links
  FOR SELECT
  USING (token_hash = current_setting('app.partner_link_lookup_hash', true));

CREATE POLICY partner_links_insert_tenant ON partner_links
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY partner_links_update_tenant ON partner_links
  FOR UPDATE USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

-- Lets the public conversion flow bump last_used_at on the exact link it
-- already resolved via the hash -- same narrow shape as the enrollment
-- public update policy.
CREATE POLICY partner_links_update_public_lookup ON partner_links
  FOR UPDATE
  USING (token_hash = current_setting('app.partner_link_lookup_hash', true))
  WITH CHECK (token_hash = current_setting('app.partner_link_lookup_hash', true));

CREATE POLICY partner_links_delete_tenant ON partner_links
  FOR DELETE USING (agency_id = current_agency_id());

-- ------------------------------------------------------------
-- PartnerAttribution: server-side only, resolved from the token that was
-- actually used at conversion time -- never from a client-supplied
-- partnerId (security/NON_NEGOTIABLES.md "Partner: sempre self-scoped").
-- ------------------------------------------------------------

CREATE TABLE partner_attributions (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id        TEXT NOT NULL,
  partner_id       TEXT NOT NULL,
  partner_link_id  TEXT NOT NULL,
  customer_id      TEXT,
  wish_id          TEXT,
  sale_id          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT partner_attributions_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT partner_attributions_partner_tenant_fk
    FOREIGN KEY (agency_id, partner_id) REFERENCES commercial_partners (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT partner_attributions_link_tenant_fk
    FOREIGN KEY (agency_id, partner_link_id) REFERENCES partner_links (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT partner_attributions_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT partner_attributions_sale_tenant_fk
    FOREIGN KEY (agency_id, sale_id) REFERENCES sales (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT partner_attributions_agency_id_key UNIQUE (agency_id, id),
  -- One attribution per (partner, customer): the first link this customer
  -- converted through is the attribution of record.
  CONSTRAINT partner_attributions_agency_partner_customer_key
    UNIQUE (agency_id, partner_id, customer_id)
);

CREATE INDEX partner_attributions_agency_partner_idx ON partner_attributions (agency_id, partner_id);
CREATE INDEX partner_attributions_agency_sale_idx ON partner_attributions (agency_id, sale_id);
CREATE INDEX partner_attributions_agency_customer_idx ON partner_attributions (agency_id, customer_id);

ALTER TABLE partner_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_attributions FORCE ROW LEVEL SECURITY;

CREATE POLICY partner_attributions_select_tenant ON partner_attributions
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY partner_attributions_insert_tenant ON partner_attributions
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY partner_attributions_update_tenant ON partner_attributions
  FOR UPDATE USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());
CREATE POLICY partner_attributions_delete_tenant ON partner_attributions
  FOR DELETE USING (agency_id = current_agency_id());

-- ------------------------------------------------------------
-- payables: add partner-beneficiary support (converges partner
-- commissions into the SAME AP/Cash flow as employee commissions and
-- supplier payables -- never a parallel table). Mirrors
-- 042_employees_commission_plans.sql's employee-beneficiary addition
-- exactly.
-- ------------------------------------------------------------

ALTER TABLE payables ADD COLUMN partner_id TEXT;
ALTER TABLE payables ADD COLUMN partner_commission_id TEXT;

ALTER TABLE payables DROP CONSTRAINT payables_beneficiary_type_check;
ALTER TABLE payables ADD CONSTRAINT payables_beneficiary_type_check
  CHECK (beneficiary_type IN ('SUPPLIER', 'EMPLOYEE', 'PARTNER', 'OTHER'));

ALTER TABLE payables ADD CONSTRAINT payables_partner_tenant_fk
  FOREIGN KEY (agency_id, partner_id) REFERENCES commercial_partners (agency_id, id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX payables_agency_partner_idx ON payables (agency_id, partner_id);

-- ------------------------------------------------------------
-- PartnerCommission: computed from a Sale attributed to this partner via
-- PartnerAttribution, using the percentage from PartnerContract (or a
-- manual override amount). Converges into `payables` exactly like
-- commission_entries -> payables (services/api/src/commissions.ts
-- createPayableFromCommissionEntry).
-- ------------------------------------------------------------

CREATE TABLE partner_commissions (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id             TEXT NOT NULL,
  partner_id            TEXT NOT NULL,
  partner_attribution_id TEXT NOT NULL,
  sale_id               TEXT NOT NULL,
  partner_contract_id   TEXT,
  calculation_base      NUMERIC(14, 2) NOT NULL,
  rate                  NUMERIC(7, 4),
  amount                NUMERIC(14, 2) NOT NULL,
  is_manual_override    BOOLEAN NOT NULL DEFAULT false,
  status                TEXT NOT NULL DEFAULT 'PENDING',
  approved_at           TIMESTAMPTZ,
  approved_by           TEXT,
  paid_at               TIMESTAMPTZ,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT partner_commissions_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT partner_commissions_partner_tenant_fk
    FOREIGN KEY (agency_id, partner_id) REFERENCES commercial_partners (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT partner_commissions_attribution_tenant_fk
    FOREIGN KEY (agency_id, partner_attribution_id) REFERENCES partner_attributions (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT partner_commissions_sale_tenant_fk
    FOREIGN KEY (agency_id, sale_id) REFERENCES sales (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT partner_commissions_contract_tenant_fk
    FOREIGN KEY (agency_id, partner_contract_id) REFERENCES partner_contracts (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT partner_commissions_approved_by_tenant_fk
    FOREIGN KEY (agency_id, approved_by) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT partner_commissions_status_check
    CHECK (status IN ('PENDING', 'APPROVED', 'PAYABLE', 'PAID', 'CANCELLED')),
  CONSTRAINT partner_commissions_amount_non_negative_check
    CHECK (amount >= 0),
  CONSTRAINT partner_commissions_agency_id_key UNIQUE (agency_id, id),
  -- Idempotency: one active (non-cancelled) commission per (partner, sale).
  CONSTRAINT partner_commissions_agency_sale_partner_key
    UNIQUE (agency_id, sale_id, partner_id)
);

CREATE INDEX partner_commissions_agency_partner_idx ON partner_commissions (agency_id, partner_id);
CREATE INDEX partner_commissions_agency_sale_idx ON partner_commissions (agency_id, sale_id);
CREATE INDEX partner_commissions_agency_status_idx ON partner_commissions (agency_id, status);

ALTER TABLE payables ADD CONSTRAINT payables_partner_commission_tenant_fk
  FOREIGN KEY (agency_id, partner_commission_id) REFERENCES partner_commissions (agency_id, id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE partner_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_commissions FORCE ROW LEVEL SECURITY;

CREATE POLICY partner_commissions_select_tenant ON partner_commissions
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY partner_commissions_insert_tenant ON partner_commissions
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY partner_commissions_update_tenant ON partner_commissions
  FOR UPDATE USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());
CREATE POLICY partner_commissions_delete_tenant ON partner_commissions
  FOR DELETE USING (agency_id = current_agency_id());
