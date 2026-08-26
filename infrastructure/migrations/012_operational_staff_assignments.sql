-- ============================================================
-- Operational Staff + Field Assignment V1
-- ============================================================

CREATE TYPE "OperationalStaffCapability" AS ENUM ('DRIVER', 'GUIDE');
CREATE TYPE "OperationAssignmentRole" AS ENUM ('DRIVER', 'GUIDE');

CREATE TABLE operational_staff (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  user_id TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT operational_staff_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operational_staff_user_tenant_fk
    FOREIGN KEY (agency_id, user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operational_staff_name_not_blank_check
    CHECK (length(trim(name)) > 0),
  CONSTRAINT operational_staff_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT operational_staff_agency_user_key UNIQUE (agency_id, user_id)
);

CREATE TABLE operational_staff_capabilities (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  operational_staff_id TEXT NOT NULL,
  capability "OperationalStaffCapability" NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT operational_staff_capabilities_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operational_staff_capabilities_staff_tenant_fk
    FOREIGN KEY (agency_id, operational_staff_id) REFERENCES operational_staff (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operational_staff_capabilities_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT operational_staff_capabilities_staff_capability_key
    UNIQUE (agency_id, operational_staff_id, capability)
);

CREATE TABLE operation_assignments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  operational_staff_id TEXT NOT NULL,
  role "OperationAssignmentRole" NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT operation_assignments_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operation_assignments_operation_tenant_fk
    FOREIGN KEY (agency_id, operation_id) REFERENCES transport_operations (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operation_assignments_staff_tenant_fk
    FOREIGN KEY (agency_id, operational_staff_id) REFERENCES operational_staff (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operation_assignments_created_by_user_tenant_fk
    FOREIGN KEY (agency_id, created_by_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operation_assignments_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT operation_assignments_operation_role_key UNIQUE (agency_id, operation_id, role),
  CONSTRAINT operation_assignments_operation_staff_role_key
    UNIQUE (agency_id, operation_id, operational_staff_id, role)
);

ALTER TABLE operation_checkpoints
  ADD COLUMN arrival_confirmed_by_user_id TEXT,
  ADD COLUMN departure_confirmed_by_user_id TEXT,
  ADD COLUMN arrival_operational_staff_id TEXT,
  ADD COLUMN departure_operational_staff_id TEXT,
  ADD CONSTRAINT operation_checkpoints_arrival_confirmed_by_user_tenant_fk
    FOREIGN KEY (agency_id, arrival_confirmed_by_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT operation_checkpoints_departure_confirmed_by_user_tenant_fk
    FOREIGN KEY (agency_id, departure_confirmed_by_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT operation_checkpoints_arrival_operational_staff_tenant_fk
    FOREIGN KEY (agency_id, arrival_operational_staff_id) REFERENCES operational_staff (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT operation_checkpoints_departure_operational_staff_tenant_fk
    FOREIGN KEY (agency_id, departure_operational_staff_id) REFERENCES operational_staff (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX operational_staff_agency_idx ON operational_staff (agency_id);
CREATE INDEX operational_staff_agency_user_idx ON operational_staff (agency_id, user_id);
CREATE INDEX operational_staff_capabilities_agency_staff_idx
  ON operational_staff_capabilities (agency_id, operational_staff_id);
CREATE INDEX operation_assignments_agency_operation_idx
  ON operation_assignments (agency_id, operation_id);
CREATE INDEX operation_assignments_agency_staff_idx
  ON operation_assignments (agency_id, operational_staff_id);

ALTER TABLE operational_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_staff_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_assignments ENABLE ROW LEVEL SECURITY;

ALTER TABLE operational_staff FORCE ROW LEVEL SECURITY;
ALTER TABLE operational_staff_capabilities FORCE ROW LEVEL SECURITY;
ALTER TABLE operation_assignments FORCE ROW LEVEL SECURITY;

CREATE POLICY operational_staff_select_tenant ON operational_staff
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY operational_staff_insert_tenant ON operational_staff
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY operational_staff_update_tenant ON operational_staff
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY operational_staff_delete_tenant ON operational_staff
  FOR DELETE USING (agency_id = current_agency_id());

CREATE POLICY operational_staff_capabilities_select_tenant ON operational_staff_capabilities
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY operational_staff_capabilities_insert_tenant ON operational_staff_capabilities
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY operational_staff_capabilities_update_tenant ON operational_staff_capabilities
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY operational_staff_capabilities_delete_tenant ON operational_staff_capabilities
  FOR DELETE USING (agency_id = current_agency_id());

CREATE POLICY operation_assignments_select_tenant ON operation_assignments
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY operation_assignments_insert_tenant ON operation_assignments
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY operation_assignments_update_tenant ON operation_assignments
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY operation_assignments_delete_tenant ON operation_assignments
  FOR DELETE USING (agency_id = current_agency_id());
