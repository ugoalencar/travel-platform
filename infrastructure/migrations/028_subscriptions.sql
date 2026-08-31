-- Migration: Subscriptions
-- Purpose: Track active subscriptions and billing periods
-- Status: Core SaaS subscription tracking
-- Created: 2026-08-30

-- Invoice status enum
CREATE TYPE invoice_status AS ENUM (
  'DRAFT',
  'SENT',
  'VIEWED',
  'PAID',
  'PARTIAL',
  'OVERDUE',
  'CANCELLED',
  'REFUNDED'
);

-- Payment status enum
CREATE TYPE payment_status AS ENUM (
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'REFUNDED'
);

-- Subscriptions: Active subscription for each subscriber
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),

  -- Links
  subscriber_tenant_id TEXT NOT NULL REFERENCES subscriber_tenants(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,

  -- Pricing
  billing_interval billing_interval NOT NULL,  -- MONTHLY, YEARLY, QUARTERLY
  amount DECIMAL(12,2) NOT NULL,               -- 99.90 for 99.90 BRL per period
  currency TEXT NOT NULL DEFAULT 'BRL',

  -- Billing periods
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  next_billing_date TIMESTAMPTZ,               -- When payment is due/expected

  -- Trial tracking
  trial_ends_at TIMESTAMPTZ,                   -- If this is a trial subscription

  -- Cancellation
  cancel_requested_at TIMESTAMPTZ,             -- When user requested cancellation
  cancelled_at TIMESTAMPTZ,                    -- When cancellation took effect

  -- Provider integration
  provider_reference TEXT,                     -- Stripe subscription ID, etc.
  provider_name TEXT,                          -- "stripe", "mercado_pago", "local"

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX subscriptions_subscriber_idx ON subscriptions(subscriber_tenant_id);
CREATE INDEX subscriptions_plan_idx ON subscriptions(plan_id);
CREATE INDEX subscriptions_next_billing_idx ON subscriptions(next_billing_date);
CREATE INDEX subscriptions_created_idx ON subscriptions(created_at);

-- Subscription state transitions audit
CREATE TABLE subscription_state_changes (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,

  from_status subscription_status,
  to_status subscription_status NOT NULL,

  reason TEXT,                         -- "trial_ended", "payment_failed", "manual_suspension"
  changed_by TEXT REFERENCES platform_users(id),  -- NULL if system action

  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX subscription_state_changes_subscription_idx ON subscription_state_changes(subscription_id);
CREATE INDEX subscription_state_changes_changed_at_idx ON subscription_state_changes(changed_at);

-- Invoices: Billing records for each subscription period
CREATE TABLE billing_invoices (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),

  -- Links
  subscriber_tenant_id TEXT NOT NULL REFERENCES subscriber_tenants(id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,

  -- Amounts
  amount DECIMAL(12,2) NOT NULL,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',

  -- Status and dates
  status invoice_status NOT NULL DEFAULT 'DRAFT',
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  issued_at TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,

  -- Provider integration
  provider_reference TEXT,             -- Stripe invoice ID, etc.
  provider_name TEXT,                  -- "stripe", "mercado_pago", "local"

  -- Notes
  notes TEXT,
  custom_line_items JSONB DEFAULT '[]',  -- Additional charges/credits

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX billing_invoices_subscriber_idx ON billing_invoices(subscriber_tenant_id);
CREATE INDEX billing_invoices_subscription_idx ON billing_invoices(subscription_id);
CREATE INDEX billing_invoices_status_idx ON billing_invoices(status);
CREATE INDEX billing_invoices_due_date_idx ON billing_invoices(due_date) WHERE status IN ('SENT', 'VIEWED', 'OVERDUE');
CREATE INDEX billing_invoices_created_idx ON billing_invoices(created_at);

-- Payments: Payment records for invoices
CREATE TABLE billing_payments (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),

  -- Links
  invoice_id TEXT NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,

  -- Amount and method
  amount DECIMAL(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  payment_method TEXT,                 -- "credit_card", "pix", "transfer", "check"

  -- Status
  status payment_status NOT NULL DEFAULT 'PENDING',
  attempted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_reason TEXT,

  -- Provider integration
  provider_reference TEXT,             -- Stripe payment ID, etc.
  provider_name TEXT,                  -- "stripe", "mercado_pago", "local"

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX billing_payments_invoice_idx ON billing_payments(invoice_id);
CREATE INDEX billing_payments_status_idx ON billing_payments(status);
CREATE INDEX billing_payments_completed_idx ON billing_payments(completed_at);

-- No RLS on billing tables (platform-scoped tables)
-- Access control enforced via application code (BILLING_ADMIN role required)

-- Down: Rollback
-- DROP TABLE billing_payments;
-- DROP TABLE billing_invoices;
-- DROP TABLE subscription_state_changes;
-- DROP TABLE subscriptions;
-- DROP TYPE payment_status;
-- DROP TYPE invoice_status;
