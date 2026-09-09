-- Migration: Platform Audit Logging
-- Purpose: Comprehensive audit trail for compliance and security investigation
-- Status: Core security/compliance requirement
-- Created: 2026-08-30

-- Audit action types
CREATE TYPE audit_action_type AS ENUM (
  'CREATED',
  'UPDATED',
  'DELETED',
  'SUSPENDED',
  'REACTIVATED',
  'GRANTED',
  'REVOKED',
  'PUBLISHED',
  'ARCHIVED',
  'IMPERSONATED',
  'LOGIN',
  'LOGOUT',
  'MFA_ENABLED',
  'MFA_DISABLED',
  'PASSWORD_CHANGED',
  'WEBHOOK_PROCESSED',
  'PAYMENT_PROCESSED'
);

-- Platform audit logs: Comprehensive trail of all platform operations
CREATE TABLE platform_audit_logs (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),

  -- Who did it
  actor_id TEXT NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  actor_email TEXT,                              -- Denormalized for queries after user deletion
  actor_role platform_user_role,                 -- Denormalized for audit queries

  -- What happened
  action audit_action_type NOT NULL,
  resource_type TEXT NOT NULL,                   -- "Subscription", "Coupon", "Plan", "SubscriberTenant"
  resource_id TEXT,                              -- ID of affected resource

  -- Details
  changes JSONB,                                 -- {"old_value": {...}, "new_value": {...}}
  reason TEXT,                                   -- Why this action was taken
  ip_address TEXT,
  user_agent TEXT,

  -- Context
  impersonation_reason TEXT,                     -- If actor was impersonating, reason for impersonation
  impersonated_tenant_id TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX platform_audit_logs_actor_idx ON platform_audit_logs(actor_id);
CREATE INDEX platform_audit_logs_resource_idx ON platform_audit_logs(resource_type, resource_id);
CREATE INDEX platform_audit_logs_action_idx ON platform_audit_logs(action);
CREATE INDEX platform_audit_logs_created_idx ON platform_audit_logs(created_at);
CREATE INDEX platform_audit_logs_actor_action_idx ON platform_audit_logs(actor_id, action);
CREATE INDEX platform_audit_logs_impersonation_idx ON platform_audit_logs(impersonation_reason) WHERE impersonation_reason IS NOT NULL;

-- Sensitive operations log: Extra detailed logging for critical actions
CREATE TABLE sensitive_operations_log (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  audit_log_id TEXT REFERENCES platform_audit_logs(id) ON DELETE CASCADE,

  -- Details about sensitive operation
  operation_type TEXT NOT NULL,                  -- "PLAN_CHANGE", "SUSPENSION", "IMPERSONATION", "WEBHOOK_PROCESSING"
  affected_tenant_id TEXT REFERENCES subscriber_tenants(id) ON DELETE SET NULL,
  affected_user_id TEXT REFERENCES platform_users(id) ON DELETE SET NULL,

  -- Sensitive details (never log passwords or secrets)
  details JSONB,
  approval_required BOOLEAN DEFAULT false,
  approved_by TEXT REFERENCES platform_users(id),
  approved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sensitive_operations_log_tenant_idx ON sensitive_operations_log(affected_tenant_id);
CREATE INDEX sensitive_operations_log_user_idx ON sensitive_operations_log(affected_user_id);
CREATE INDEX sensitive_operations_log_created_idx ON sensitive_operations_log(created_at);
CREATE INDEX sensitive_operations_log_approval_idx ON sensitive_operations_log(approval_required, approved_by);

-- Support access log: Track safe impersonation sessions
CREATE TABLE support_access_log (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),

  support_user_id TEXT NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  impersonated_tenant_id TEXT NOT NULL REFERENCES subscriber_tenants(id) ON DELETE CASCADE,

  reason TEXT NOT NULL,                          -- Why support accessed this tenant
  access_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  access_end TIMESTAMPTZ,                        -- When they exited support mode

  ip_address TEXT,
  user_agent TEXT,

  -- What was accessed
  accessed_resources TEXT[],                     -- Resources viewed/modified during session

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX support_access_log_support_user_idx ON support_access_log(support_user_id);
CREATE INDEX support_access_log_tenant_idx ON support_access_log(impersonated_tenant_id);
CREATE INDEX support_access_log_access_start_idx ON support_access_log(access_start);
CREATE INDEX support_access_log_access_end_idx ON support_access_log(access_end) WHERE access_end IS NOT NULL;

-- Login audit: Track all platform user logins
CREATE TABLE login_audit (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),

  platform_user_id TEXT NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,

  success BOOLEAN NOT NULL,
  failure_reason TEXT,                           -- "Invalid credentials", "Account suspended", "MFA required"

  ip_address TEXT,
  user_agent TEXT,
  country TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX login_audit_user_idx ON login_audit(platform_user_id);
CREATE INDEX login_audit_email_idx ON login_audit(email);
CREATE INDEX login_audit_success_idx ON login_audit(success);
CREATE INDEX login_audit_created_idx ON login_audit(created_at);
CREATE INDEX login_audit_failed_idx ON login_audit(created_at) WHERE NOT success;

-- No RLS on audit tables (platform-scoped, full transparency)

-- Down: Rollback
-- DROP TABLE login_audit;
-- DROP TABLE support_access_log;
-- DROP TABLE sensitive_operations_log;
-- DROP TABLE platform_audit_logs;
-- DROP TYPE audit_action_type;
