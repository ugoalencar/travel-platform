-- Support Cases Table
CREATE TABLE IF NOT EXISTS support_cases (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  subscriber_tenant_id TEXT NOT NULL REFERENCES subscriber_tenants(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'OPEN', -- OPEN, IN_PROGRESS, RESOLVED, CLOSED
  priority VARCHAR(50) DEFAULT 'MEDIUM', -- LOW, MEDIUM, HIGH, CRITICAL
  assigned_to_id TEXT REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ(6) DEFAULT now(),
  updated_at TIMESTAMPTZ(6) DEFAULT now()
);

CREATE INDEX support_cases_subscriber_tenant_id_idx ON support_cases(subscriber_tenant_id);
CREATE INDEX support_cases_status_idx ON support_cases(status);
CREATE INDEX support_cases_created_at_idx ON support_cases(created_at DESC);
