-- Notification Preferences Table
-- Per-user notification settings, scoped by agency for tenant isolation.
CREATE TABLE IF NOT EXISTS notification_preferences (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_notifications BOOLEAN NOT NULL DEFAULT true,
  proposal_updates BOOLEAN NOT NULL DEFAULT true,
  booking_updates BOOLEAN NOT NULL DEFAULT true,
  payment_updates BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  UNIQUE (agency_id, user_id)
);

CREATE INDEX notification_preferences_agency_user_idx ON notification_preferences (agency_id, user_id);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY;

CREATE POLICY notification_preferences_select_tenant ON notification_preferences
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY notification_preferences_insert_tenant ON notification_preferences
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY notification_preferences_update_tenant ON notification_preferences
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY notification_preferences_delete_tenant ON notification_preferences
  FOR DELETE USING (agency_id = current_agency_id());
