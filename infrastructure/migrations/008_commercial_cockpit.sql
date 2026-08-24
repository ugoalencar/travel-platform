-- ============================================================
-- COMMERCIAL COCKPIT V1
-- Travel Platform
-- ============================================================
-- Additive only. Does not modify wishes/proposals/sales/trips or their
-- existing columns, constraints, RLS policies, or status enums.
--
-- CommercialOpportunity carries its OWN mutable `stage` lifecycle,
-- independent of Proposal.status/Sale.status (both remain read-only /
-- unmanaged, exactly as before this migration). Kanban drag/drop and the
-- commercial cockpit API mutate ONLY commercial_opportunities.stage.
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE "CommercialStage" AS ENUM (
  'PROSPECTING',
  'INTEREST',
  'QUOTE',
  'PROPOSAL_SENT',
  'WAITING_CUSTOMER',
  'NEGOTIATION',
  'WON',
  'POST_SALE',
  'LOST'
);

CREATE TYPE "CommercialTaskType" AS ENUM (
  'FOLLOW_UP',
  'CALL',
  'POST_SALE',
  'OTHER'
);

CREATE TYPE "InteractionChannel" AS ENUM (
  'PHONE',
  'WHATSAPP',
  'EMAIL',
  'IN_PERSON',
  'OTHER'
);

CREATE TYPE "InteractionDirection" AS ENUM (
  'INBOUND',
  'OUTBOUND'
);

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE commercial_opportunities (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id            TEXT NOT NULL,
  customer_id          TEXT NOT NULL,
  wish_id              TEXT,
  proposal_id          TEXT,
  sale_id              TEXT,
  responsible_user_id  TEXT,
  destination          TEXT,
  trip_date_from       DATE,
  trip_date_to         DATE,
  expected_value       NUMERIC(10, 2),
  stage                "CommercialStage" NOT NULL DEFAULT 'PROSPECTING',
  next_action_at       TIMESTAMPTZ,
  last_interaction_at  TIMESTAMPTZ,
  lost_reason          TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT commercial_opportunities_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT commercial_opportunities_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT commercial_opportunities_wish_tenant_fk
    FOREIGN KEY (agency_id, wish_id) REFERENCES wishes (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT commercial_opportunities_proposal_tenant_fk
    FOREIGN KEY (agency_id, proposal_id) REFERENCES proposals (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT commercial_opportunities_sale_tenant_fk
    FOREIGN KEY (agency_id, sale_id) REFERENCES sales (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT commercial_opportunities_responsible_user_tenant_fk
    FOREIGN KEY (agency_id, responsible_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT commercial_opportunities_expected_value_non_negative_check
    CHECK (expected_value IS NULL OR expected_value >= 0),
  CONSTRAINT commercial_opportunities_trip_date_range_check
    CHECK (trip_date_from IS NULL OR trip_date_to IS NULL OR trip_date_from <= trip_date_to),

  CONSTRAINT commercial_opportunities_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX commercial_opportunities_agency_stage_idx
  ON commercial_opportunities (agency_id, stage);
CREATE INDEX commercial_opportunities_agency_responsible_user_idx
  ON commercial_opportunities (agency_id, responsible_user_id);
CREATE INDEX commercial_opportunities_agency_next_action_idx
  ON commercial_opportunities (agency_id, next_action_at);
CREATE INDEX commercial_opportunities_agency_customer_idx
  ON commercial_opportunities (agency_id, customer_id);

CREATE TABLE commercial_tasks (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id          TEXT NOT NULL,
  customer_id        TEXT NOT NULL,
  opportunity_id     TEXT,
  assigned_user_id   TEXT NOT NULL,
  type               "CommercialTaskType" NOT NULL DEFAULT 'FOLLOW_UP',
  title              TEXT NOT NULL,
  due_at             TIMESTAMPTZ NOT NULL,
  completed_at       TIMESTAMPTZ,
  notes              TEXT,
  created_by         TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT commercial_tasks_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT commercial_tasks_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT commercial_tasks_opportunity_tenant_fk
    FOREIGN KEY (agency_id, opportunity_id) REFERENCES commercial_opportunities (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT commercial_tasks_assigned_user_tenant_fk
    FOREIGN KEY (agency_id, assigned_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT commercial_tasks_created_by_tenant_fk
    FOREIGN KEY (agency_id, created_by) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT commercial_tasks_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX commercial_tasks_agency_due_at_idx
  ON commercial_tasks (agency_id, due_at);
CREATE INDEX commercial_tasks_agency_assigned_user_idx
  ON commercial_tasks (agency_id, assigned_user_id);
CREATE INDEX commercial_tasks_agency_customer_idx
  ON commercial_tasks (agency_id, customer_id);

CREATE TABLE customer_interactions (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id       TEXT NOT NULL,
  customer_id     TEXT NOT NULL,
  opportunity_id  TEXT,
  proposal_id     TEXT,
  sale_id         TEXT,
  user_id         TEXT NOT NULL,
  channel         "InteractionChannel" NOT NULL,
  direction       "InteractionDirection" NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  summary         TEXT NOT NULL,
  next_action_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT customer_interactions_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT customer_interactions_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT customer_interactions_opportunity_tenant_fk
    FOREIGN KEY (agency_id, opportunity_id) REFERENCES commercial_opportunities (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT customer_interactions_proposal_tenant_fk
    FOREIGN KEY (agency_id, proposal_id) REFERENCES proposals (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT customer_interactions_sale_tenant_fk
    FOREIGN KEY (agency_id, sale_id) REFERENCES sales (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT customer_interactions_user_tenant_fk
    FOREIGN KEY (agency_id, user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT customer_interactions_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX customer_interactions_agency_customer_idx
  ON customer_interactions (agency_id, customer_id);
CREATE INDEX customer_interactions_agency_occurred_at_idx
  ON customer_interactions (agency_id, occurred_at);

-- ============================================================
-- RLS (mirrors 002_rls_policies.sql's 4-policy-per-table pattern exactly)
-- ============================================================

ALTER TABLE commercial_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_interactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE commercial_opportunities FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_interactions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commercial_opportunities_select_tenant ON commercial_opportunities;
DROP POLICY IF EXISTS commercial_opportunities_insert_tenant ON commercial_opportunities;
DROP POLICY IF EXISTS commercial_opportunities_update_tenant ON commercial_opportunities;
DROP POLICY IF EXISTS commercial_opportunities_delete_tenant ON commercial_opportunities;

DROP POLICY IF EXISTS commercial_tasks_select_tenant ON commercial_tasks;
DROP POLICY IF EXISTS commercial_tasks_insert_tenant ON commercial_tasks;
DROP POLICY IF EXISTS commercial_tasks_update_tenant ON commercial_tasks;
DROP POLICY IF EXISTS commercial_tasks_delete_tenant ON commercial_tasks;

DROP POLICY IF EXISTS customer_interactions_select_tenant ON customer_interactions;
DROP POLICY IF EXISTS customer_interactions_insert_tenant ON customer_interactions;
DROP POLICY IF EXISTS customer_interactions_update_tenant ON customer_interactions;
DROP POLICY IF EXISTS customer_interactions_delete_tenant ON customer_interactions;

CREATE POLICY commercial_opportunities_select_tenant ON commercial_opportunities
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY commercial_opportunities_insert_tenant ON commercial_opportunities
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY commercial_opportunities_update_tenant ON commercial_opportunities
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY commercial_opportunities_delete_tenant ON commercial_opportunities
  FOR DELETE
  USING (agency_id = current_agency_id());

CREATE POLICY commercial_tasks_select_tenant ON commercial_tasks
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY commercial_tasks_insert_tenant ON commercial_tasks
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY commercial_tasks_update_tenant ON commercial_tasks
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY commercial_tasks_delete_tenant ON commercial_tasks
  FOR DELETE
  USING (agency_id = current_agency_id());

CREATE POLICY customer_interactions_select_tenant ON customer_interactions
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY customer_interactions_insert_tenant ON customer_interactions
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY customer_interactions_update_tenant ON customer_interactions
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY customer_interactions_delete_tenant ON customer_interactions
  FOR DELETE
  USING (agency_id = current_agency_id());
