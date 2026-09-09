-- Migration: Billing Webhook Processing
-- Purpose: Track and process billing provider webhooks safely
-- Status: Core for billing integration
-- Created: 2026-08-30

CREATE TABLE billing_webhook_events (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),

  -- Webhook identification
  provider TEXT NOT NULL,                         -- "stripe", "mercado_pago", "local"
  provider_event_id TEXT NOT NULL UNIQUE,         -- Idempotency key: provider's event ID
  event_type TEXT NOT NULL,                       -- "payment.succeeded", "subscription.updated", etc.

  -- Webhook data
  body JSONB NOT NULL,
  signature_valid BOOLEAN,

  -- Processing state
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  processing_error TEXT,                          -- Error message if processing failed

  -- Retry tracking
  retry_count INT DEFAULT 0,
  next_retry_at TIMESTAMPTZ,

  -- Timestamps
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX billing_webhook_events_provider_event_idx ON billing_webhook_events(provider, provider_event_id);
CREATE INDEX billing_webhook_events_processed_idx ON billing_webhook_events(processed);
CREATE INDEX billing_webhook_events_event_type_idx ON billing_webhook_events(event_type);
CREATE INDEX billing_webhook_events_received_idx ON billing_webhook_events(received_at);
CREATE INDEX billing_webhook_events_retry_idx ON billing_webhook_events(next_retry_at) WHERE NOT processed;

-- Audit: Track webhook processing
CREATE TABLE billing_webhook_audit (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  webhook_event_id TEXT NOT NULL REFERENCES billing_webhook_events(id) ON DELETE CASCADE,

  action TEXT NOT NULL,                           -- RECEIVED, VALIDATED, PROCESSED, FAILED, RETRIED
  details JSONB,
  error TEXT,

  processed_by TEXT REFERENCES platform_users(id),  -- NULL if system action
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX billing_webhook_audit_webhook_idx ON billing_webhook_audit(webhook_event_id);
CREATE INDEX billing_webhook_audit_processed_idx ON billing_webhook_audit(processed_at);

-- No RLS on webhook tables (platform-scoped)

-- Down: Rollback
-- DROP TABLE billing_webhook_audit;
-- DROP TABLE billing_webhook_events;
