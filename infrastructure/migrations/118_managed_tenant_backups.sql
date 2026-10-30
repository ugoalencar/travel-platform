-- Full managed daily backups. Object bytes and encryption keys are never stored here.

CREATE TABLE tenant_backup_schedules (
  agency_id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  daily_time TIME NOT NULL DEFAULT TIME '02:00',
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  next_run_at TIMESTAMPTZ,
  next_local_date DATE,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_backup_schedules_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE RESTRICT,
  CONSTRAINT tenant_backup_schedules_timezone_length
    CHECK (length(timezone) BETWEEN 1 AND 100),
  CONSTRAINT tenant_backup_schedules_next_due_check
    CHECK (enabled = (next_run_at IS NOT NULL AND next_local_date IS NOT NULL))
);

CREATE TABLE tenant_backup_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id TEXT NOT NULL,
  scheduled_local_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
  attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt BETWEEN 1 AND 5),
  object_key TEXT,
  key_version TEXT,
  manifest_hash TEXT,
  record_count INTEGER CHECK (record_count IS NULL OR record_count >= 0),
  size_bytes BIGINT CHECK (size_bytes IS NULL OR size_bytes >= 0),
  error_code TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_backup_runs_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE RESTRICT,
  CONSTRAINT tenant_backup_runs_schedule_date_unique UNIQUE (agency_id, scheduled_local_date),
  CONSTRAINT tenant_backup_runs_object_key_shape
    CHECK (object_key IS NULL OR (length(object_key) <= 512 AND object_key LIKE 'internal/managed-backups/%')),
  CONSTRAINT tenant_backup_runs_success_metadata
    CHECK (status <> 'SUCCEEDED' OR (object_key IS NOT NULL AND key_version IS NOT NULL AND manifest_hash IS NOT NULL AND completed_at IS NOT NULL)),
  CONSTRAINT tenant_backup_runs_completed_state
    CHECK ((status = 'RUNNING' AND completed_at IS NULL) OR (status <> 'RUNNING' AND completed_at IS NOT NULL))
);

CREATE INDEX tenant_backup_schedules_due_idx
  ON tenant_backup_schedules (next_run_at, agency_id)
  WHERE enabled = TRUE;
CREATE INDEX tenant_backup_runs_history_idx
  ON tenant_backup_runs (agency_id, created_at DESC, id DESC);

CREATE FUNCTION public.prevent_tenant_backup_run_creator_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'tenant backup run creator is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER tenant_backup_runs_creator_immutable
  BEFORE UPDATE ON tenant_backup_runs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_backup_run_creator_change();

CREATE FUNCTION public.list_due_tenant_backup_agencies()
RETURNS TABLE (
  agency_id TEXT,
  owner_id TEXT,
  daily_time TIME,
  timezone TEXT,
  next_run_at TIMESTAMPTZ,
  next_local_date DATE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT s.agency_id, u.id, s.daily_time, s.timezone, s.next_run_at, s.next_local_date
  FROM public.tenant_backup_schedules s
  JOIN LATERAL (
    SELECT active_owner.id
    FROM public.users active_owner
    WHERE active_owner.agency_id = s.agency_id
      AND active_owner.role = 'OWNER' AND active_owner.status = 'ACTIVE'
    ORDER BY active_owner.id
    LIMIT 1
  ) u ON TRUE
  WHERE s.enabled = TRUE AND (
    s.next_run_at <= now() OR EXISTS (
      SELECT 1 FROM public.tenant_backup_runs r
      WHERE r.agency_id = s.agency_id AND r.scheduled_local_date = s.next_local_date
        AND r.status = 'RUNNING' AND r.started_at <= now() - INTERVAL '5 minutes'
    )
  )
  ORDER BY s.next_run_at, s.agency_id
  LIMIT 100;
$$;
COMMENT ON FUNCTION public.list_due_tenant_backup_agencies() IS
  'Worker-only candidate listing: returns due agency IDs and schedule metadata after active OWNER validation; never returns tenant records or backup content.';
REVOKE ALL ON FUNCTION public.list_due_tenant_backup_agencies() FROM PUBLIC;

ALTER TABLE tenant_backup_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_backup_schedules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_backup_schedules_select_owner ON tenant_backup_schedules
  FOR SELECT USING (
    agency_id = current_agency_id() AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.agency_id = current_agency_id() AND u.id = current_user_id()
        AND u.role = 'OWNER' AND u.status = 'ACTIVE'
    )
  );
CREATE POLICY tenant_backup_schedules_insert_owner ON tenant_backup_schedules
  FOR INSERT WITH CHECK (
    agency_id = current_agency_id() AND updated_by = current_user_id() AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.agency_id = current_agency_id() AND u.id = current_user_id()
        AND u.role = 'OWNER' AND u.status = 'ACTIVE'
    )
  );
CREATE POLICY tenant_backup_schedules_update_owner ON tenant_backup_schedules
  FOR UPDATE USING (
    agency_id = current_agency_id() AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.agency_id = current_agency_id() AND u.id = current_user_id()
        AND u.role = 'OWNER' AND u.status = 'ACTIVE'
    )
  ) WITH CHECK (
    agency_id = current_agency_id() AND updated_by = current_user_id() AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.agency_id = current_agency_id() AND u.id = current_user_id()
        AND u.role = 'OWNER' AND u.status = 'ACTIVE'
    )
  );

ALTER TABLE tenant_backup_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_backup_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_backup_runs_select_owner ON tenant_backup_runs
  FOR SELECT USING (
    agency_id = current_agency_id() AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.agency_id = current_agency_id() AND u.id = current_user_id()
        AND u.role = 'OWNER' AND u.status = 'ACTIVE'
    )
  );
CREATE POLICY tenant_backup_runs_insert_owner ON tenant_backup_runs
  FOR INSERT WITH CHECK (
    agency_id = current_agency_id() AND created_by = current_user_id() AND updated_by = current_user_id() AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.agency_id = current_agency_id() AND u.id = current_user_id()
        AND u.role = 'OWNER' AND u.status = 'ACTIVE'
    )
  );
CREATE POLICY tenant_backup_runs_update_owner ON tenant_backup_runs
  FOR UPDATE USING (
    agency_id = current_agency_id() AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.agency_id = current_agency_id() AND u.id = current_user_id()
        AND u.role = 'OWNER' AND u.status = 'ACTIVE'
    )
  ) WITH CHECK (
    agency_id = current_agency_id() AND updated_by = current_user_id() AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.agency_id = current_agency_id() AND u.id = current_user_id()
        AND u.role = 'OWNER' AND u.status = 'ACTIVE'
    )
  );
CREATE POLICY tenant_backup_runs_delete_owner ON tenant_backup_runs
  FOR DELETE USING (
    agency_id = current_agency_id() AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.agency_id = current_agency_id() AND u.id = current_user_id()
        AND u.role = 'OWNER' AND u.status = 'ACTIVE'
    )
  );

REVOKE ALL ON tenant_backup_schedules, tenant_backup_runs FROM PUBLIC;
DO $$
DECLARE runtime_role TEXT; platform_role TEXT;
BEGIN
  FOREACH runtime_role IN ARRAY ARRAY['travel_app_runtime', 'travel_app_runtime_local'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON tenant_backup_schedules TO %I', runtime_role);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_backup_runs TO %I', runtime_role);
    END IF;
  END LOOP;
  FOREACH platform_role IN ARRAY ARRAY['travel_app_platform', 'travel_app_platform_local'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = platform_role) THEN
      -- The worker uses the platform pool only to enter an explicit agency context;
      -- FORCE RLS and OWNER policies still apply to both tables.
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON tenant_backup_schedules TO %I', platform_role);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_backup_runs TO %I', platform_role);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.list_due_tenant_backup_agencies() TO %I', platform_role);
    END IF;
  END LOOP;
END $$;

INSERT INTO schema_migrations (version) VALUES ('118') ON CONFLICT (version) DO NOTHING;
