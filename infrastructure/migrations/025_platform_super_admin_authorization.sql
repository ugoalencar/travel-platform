-- Migration: Platform Super Admin Authorization
-- Purpose: Create platform-level user management distinct from tenant users
-- Status: Foundation for all platform admin features
-- Created: 2026-08-30
-- Direction: up

-- Platform user roles (distinct from tenant roles)
CREATE TYPE platform_user_role AS ENUM (
  'PLATFORM_OWNER',
  'PLATFORM_ADMIN',
  'SUPPORT_ADMIN',
  'BILLING_ADMIN',
  'MARKETING_ADMIN',
  'READ_ONLY_AUDITOR'
);

-- Platform-level super admin users
-- Note: Does NOT include agency_id - this is platform-wide context
CREATE TABLE platform_users (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role platform_user_role NOT NULL,
  mfa_enabled BOOLEAN DEFAULT false,
  mfa_secret TEXT,                    -- Encrypted TOTP secret
  last_login_at TIMESTAMPTZ,
  status TEXT DEFAULT 'ACTIVE',       -- ACTIVE, SUSPENDED, ARCHIVED
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for fast lookups
CREATE INDEX platform_users_email_idx ON platform_users(email);
CREATE INDEX platform_users_role_idx ON platform_users(role);
CREATE INDEX platform_users_status_idx ON platform_users(status);

-- No RLS on platform_users - only platform admins exist in this table
-- Access control enforced via application code

-- Audit table for platform user changes
CREATE TABLE platform_user_audit (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  platform_user_id TEXT NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,               -- PASSWORD_CHANGED, MFA_ENABLED, ROLE_CHANGED, SUSPENDED
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX platform_user_audit_user_idx ON platform_user_audit(platform_user_id);
CREATE INDEX platform_user_audit_created_idx ON platform_user_audit(created_at);

-- Down: Rollback
-- DROP TABLE platform_user_audit;
-- DROP TABLE platform_users;
-- DROP TYPE platform_user_role;
