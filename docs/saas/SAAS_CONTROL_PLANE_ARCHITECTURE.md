# SaaS Control Plane Architecture

**Status**: Commercial Platform Launch - Wave A Foundation  
**Date**: 2026-08-30  
**Version**: 1.0.0-rc1

## Executive Summary

Travel Platform is transitioning from a single-tenant multi-agency platform to a full commercial SaaS offering. This document defines:

1. **Current State**: Multi-tenant architecture (Agency = Tenant) with PostgreSQL RLS
2. **New Layers**: Platform-level tables, auth systems, and business logic
3. **Key Principle**: Platform and tenant contexts remain completely separate with RLS enforcement
4. **Integration Model**: All external providers (Stripe, Mercado Pago, social networks) are pluggable/abstracted

## Current Architecture

### Application Structure

```
┌────────────────────────────────────────────────────┐
│                  CLIENTS                           │
├──────────────────┬────────────────┬────────────────┤
│ Agency App       │ Broker App     │ Customer App   │
│ (Existing)       │ (Existing)     │ (Existing)     │
└──────────────────┴────────────────┴────────────────┘
           │                │                │
           ▼                ▼                ▼
┌────────────────────────────────────────────────────┐
│            Fastify API (Node.js)                   │
│  - Auth, Tenant Context, Routes, Domain Logic     │
└────────────────────────────────────────────────────┘
           │
           ▼
┌────────────────────────────────────────────────────┐
│  PostgreSQL + Row-Level Security (tenant isolation)│
│  - Tenant scope: agency_id on all tenant tables    │
└────────────────────────────────────────────────────┘
```

### Tenant Model

- **Tenant Unit**: Each Agency
- **Tenant Isolation**: 
  - Application-level: agency_id middleware validation
  - Database-level: PostgreSQL RLS policies
  - Fail-safe: RLS prevents query bypass
- **User Context**: JWT contains agency_id + role (USER, MANAGER, ADMIN)
- **Multi-Agency**: Single SaaS instance serves many agencies

### Current Tables (Tenant-Scoped)

All tables include `agency_id` foreign key and RLS policies:
- agencies, users, brokers, customers, trips, offers, proposals, sales, payments, etc.

### Authentication Current State

- **JWT Structure**: 
  ```json
  {
    "sub": "user-id",
    "agency_id": "agency-id",
    "role": "MANAGER",
    "exp": 1234567890
  }
  ```
- **Token Location**: httpOnly cookie
- **MFA**: Not currently implemented
- **Password Hash**: bcrypt

## New Platform Layer (SaaS Control Plane)

### New Application Surfaces

```
┌─────────────────────────────────────────────────────────────┐
│                    PUBLIC INTERNET                          │
├──────────────────────────────────────────────────────────────┤
│  Marketing App (/): Landing page, pricing, lead forms       │
└──────────────────────────────────────────────────────────────┘
         │ Demo Request │ Start Trial │ Login │
         ▼              ▼             ▼       ▼
┌──────────────────────────────────────────────────────────────┐
│                  API Gateway Layer                           │
│  - Route by path (/app, /customer, /super-admin, /api/...)  │
│  - Auth (tenant or platform)                                │
│  - Rate limiting, CORS                                       │
└──────────────────────────────────────────────────────────────┘
    │               │                  │                 │
    ▼               ▼                  ▼                 ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Agency App   │ │ Customer     │ │ Platform     │ │ Marketing    │
│ (/app)       │ │ Portal       │ │ Admin        │ │ API (/api)   │
│ (existing)   │ │ (/customer)  │ │ (/super-admin)  │ (new)        │
│              │ │ (existing)   │ │ (new)        │ │              │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

### Platform-Level Tables (New)

All platform tables have `NO agency_id` - they are SaaS-wide, not tenant-scoped.

#### Authentication & Users (Migrations 025-026)

```sql
-- Platform super admin users
platform_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role platform_user_role,        -- OWNER, ADMIN, SUPPORT_ADMIN, BILLING_ADMIN, etc.
  mfa_enabled BOOLEAN,
  mfa_secret TEXT,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)

-- Platform user roles
ENUM platform_user_role: PLATFORM_OWNER, PLATFORM_ADMIN, SUPPORT_ADMIN, BILLING_ADMIN, MARKETING_ADMIN, READ_ONLY_AUDITOR
```

#### Subscriber Tenants (Migrations 027-028)

```sql
subscriber_tenants (
  id TEXT PRIMARY KEY,
  agency_id TEXT UNIQUE NOT NULL REFERENCES agencies(id),  -- Links to existing tenant
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  legal_name TEXT NOT NULL,
  trade_name TEXT,
  cnpj TEXT UNIQUE,
  plan_id TEXT REFERENCES plans(id),
  subscription_status subscription_status,                 -- TRIAL, ACTIVE, PAST_DUE, etc.
  trial_starts_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  billing_status billing_status,                           -- ACTIVE, PAST_DUE, SUSPENDED
  courtesy_status courtesy_status,                         -- NONE, ACTIVE, EXPIRED, CONVERTED
  activated_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  storage_bytes_used BIGINT,
  user_count INT,
  customer_count INT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- Status enums
ENUM subscription_status: TRIAL, ACTIVE, PAST_DUE, GRACE_PERIOD, SUSPENDED, CANCELLED, COURTESY
ENUM billing_status: ACTIVE, PAST_DUE, SUSPENDED, FAILED
ENUM courtesy_status: NONE, ACTIVE, EXPIRED, CONVERTED
ENUM billing_interval: MONTHLY, YEARLY, QUARTERLY
```

#### Plans & Entitlements (Migrations 029-030)

```sql
plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                    -- "Free", "Professional", "Enterprise"
  description TEXT,
  price_amount DECIMAL(12,2),
  price_currency TEXT DEFAULT 'BRL',
  billing_interval billing_interval,
  max_users INT,
  max_customers INT,
  storage_gb INT,
  features JSONB,                        -- Feature flags as JSON
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ
)

entitlements (
  id TEXT PRIMARY KEY,
  plan_id TEXT REFERENCES plans(id),
  feature TEXT NOT NULL,                 -- "MAX_USERS", "FEATURE_OCR", etc.
  limit_value INT,
  created_at TIMESTAMPTZ
)
```

#### Subscriptions (Migrations 031-032)

```sql
subscriptions (
  id TEXT PRIMARY KEY,
  subscriber_tenant_id TEXT REFERENCES subscriber_tenants(id),
  plan_id TEXT REFERENCES plans(id),
  billing_interval billing_interval,
  amount DECIMAL(12,2),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  next_billing_date TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  cancel_requested_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  provider_reference TEXT,               -- Stripe subscription ID if integrated
  provider_name TEXT,                    -- "stripe", "mercado_pago", "local"
  created_at TIMESTAMPTZ
)
```

#### Courtesies (Migration 033)

```sql
courtesy_accounts (
  id TEXT PRIMARY KEY,
  subscriber_tenant_id TEXT REFERENCES subscriber_tenants(id),
  plan_id TEXT REFERENCES plans(id),
  reason TEXT,                           -- "Launch partner", "Marketing agreement"
  granted_by TEXT REFERENCES platform_users(id),
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  auto_convert_to_paid BOOLEAN,
  notes TEXT,
  created_at TIMESTAMPTZ
)
```

#### Billing (Migrations 034-035)

```sql
billing_invoices (
  id TEXT PRIMARY KEY,
  subscriber_tenant_id TEXT REFERENCES subscriber_tenants(id),
  subscription_id TEXT REFERENCES subscriptions(id),
  amount DECIMAL(12,2),
  status invoice_status,                 -- DRAFT, SENT, PAID, OVERDUE, etc.
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  paid_date TIMESTAMPTZ,
  provider_reference TEXT,
  created_at TIMESTAMPTZ
)

billing_payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT REFERENCES billing_invoices(id),
  amount DECIMAL(12,2),
  status payment_status,                 -- PENDING, SUCCEEDED, FAILED
  payment_method TEXT,                   -- "credit_card", "pix", "transfer"
  provider_reference TEXT,
  created_at TIMESTAMPTZ
)

billing_webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT,
  provider_event_id TEXT UNIQUE,         -- Idempotency key
  event_type TEXT,                       -- "payment.succeeded", etc.
  body JSONB,
  processed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ
)
```

#### Leads & Sales (Migrations 036-037)

```sql
leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  whatsapp TEXT,
  user_count INT,
  customer_volume INT,
  interest TEXT,
  source TEXT,                           -- "landing_page", "cold_email", "referral"
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  referral_code TEXT,
  status lead_status,                    -- NEW, CONTACTED, QUALIFIED, TRIAL, WON, LOST
  assigned_to TEXT REFERENCES platform_users(id),
  notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

ENUM lead_status: NEW, CONTACTED, QUALIFIED, DEMO_SCHEDULED, TRIAL, WON, LOST
```

#### Promotions & Coupons (Migrations 038-039)

```sql
coupons (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  discount_type discount_type,           -- PERCENTAGE, FIXED_AMOUNT, FREE_TRIAL_EXTENSION
  discount_value DECIMAL(12,2),
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  max_uses INT,
  uses_count INT DEFAULT 0,
  eligible_plans TEXT[],                 -- Array of plan IDs
  status coupon_status,                  -- ACTIVE, INACTIVE, EXPIRED, EXHAUSTED
  created_at TIMESTAMPTZ
)

ENUM discount_type: PERCENTAGE, FIXED_AMOUNT, FREE_TRIAL_EXTENSION
ENUM coupon_status: ACTIVE, INACTIVE, EXPIRED, EXHAUSTED

promotional_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  budget DECIMAL(12,2),
  status campaign_status,                -- DRAFT, ACTIVE, PAUSED, COMPLETED
  created_at TIMESTAMPTZ
)
```

#### Landing Page Configuration (Migration 040)

```sql
landing_page_config (
  id TEXT PRIMARY KEY,
  section TEXT,                          -- "hero", "features", "pricing", etc.
  key TEXT,
  value TEXT,
  type TEXT,                             -- "text", "number", "json", etc.
  version INT,
  published_at TIMESTAMPTZ,
  draft_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)

landing_promotions (
  id TEXT PRIMARY KEY,
  type TEXT,                             -- GLOBAL_BANNER, PLAN_BADGE, TRIAL_CTA, COUNTDOWN
  content JSONB,
  enabled BOOLEAN,
  scheduled_from TIMESTAMPTZ,
  scheduled_until TIMESTAMPTZ,
  priority INT,
  campaign_id TEXT,
  created_at TIMESTAMPTZ
)
```

#### Platform Audit (Migration 041)

```sql
platform_audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES platform_users(id),
  timestamp TIMESTAMPTZ DEFAULT now(),
  action TEXT,                           -- CREATED, UPDATED, SUSPENDED, etc.
  resource_type TEXT,                    -- Subscription, Coupon, etc.
  resource_id TEXT,
  changes JSONB,
  reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ
)

ENUM audit_action: CREATED, UPDATED, DELETED, SUSPENDED, REACTIVATED, GRANTED, REVOKED, PUBLISHED, ARCHIVED
```

#### Feature Flags (Migration 042)

```sql
feature_flags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  scope feature_flag_scope,              -- GLOBAL, PLAN_ID, TENANT_ID, USER_ID
  target_id TEXT,                        -- Plan ID, Tenant ID, User ID depending on scope
  enabled BOOLEAN DEFAULT false,
  config JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

ENUM feature_flag_scope: GLOBAL, PLAN_ID, TENANT_ID, USER_ID
```

### New Platform Authentication

#### JWT Structure (Extended)

Platform users get a different JWT with platform-specific claims:

```json
{
  "sub": "platform-user-id",
  "email": "admin@example.com",
  "platform_role": "PLATFORM_ADMIN",
  "type": "platform",
  "exp": 1234567890,
  "iat": 1234567800
}
```

#### Tenant Users (Unchanged)

```json
{
  "sub": "user-id",
  "agency_id": "agency-id",
  "role": "MANAGER",
  "type": "tenant",
  "exp": 1234567890
}
```

#### Authentication Flows

**Tenant Login** (unchanged):
```
POST /api/auth/login (email, password)
→ Validate credentials
→ Check agency status (ACTIVE)
→ Issue tenant JWT (agency_id + role)
```

**Platform Login** (new):
```
POST /platform/auth/login (email, password)
→ Query platform_users table
→ Validate credentials
→ Check MFA if enabled
→ Issue platform JWT (platform_role)
```

**Route Guards**:
```typescript
// Tenant routes (existing)
GET /api/customers
→ requireTenantAuth()
→ Check JWT type == "tenant"
→ Extract agency_id
→ Apply RLS filter

// Platform routes (new)
GET /platform/tenants
→ requirePlatformAuth()
→ Check JWT type == "platform"
→ Check platform_role >= PLATFORM_ADMIN
→ No agency_id filtering
```

### Architectural Boundaries

#### Platform Tables (**No** agency_id)
- platform_users
- subscriber_tenants
- plans, entitlements, subscriptions, courtesies
- billing_invoices, billing_payments, billing_webhook_events
- leads, promotional_campaigns, coupons
- landing_page_config, landing_promotions
- feature_flags, platform_audit_logs

**RLS Policy**: Only platform users with appropriate roles can access.

#### Tenant Tables (**Always** include agency_id)
- agencies, users, customers, brokers
- trips, offers, proposals, sales
- payments, receivables, payables
- All existing tables

**RLS Policy**: Users can only see data from their agency_id.

#### Hybrid Tables (Support both contexts)
- None initially. Each table is either platform-scoped or tenant-scoped.

### Provider Abstractions

#### Billing Provider Interface

```typescript
interface BillingProvider {
  name: string;
  isConnected(): boolean;
  
  createCustomer(email: string): Promise<string>;
  createSubscription(planId, interval, customerId): Promise<SubscriptionRef>;
  changePlan(subscriptionId, newPlanId): Promise<void>;
  cancelSubscription(subscriptionId): Promise<void>;
  createCheckoutSession(planId, email): Promise<CheckoutUrl>;
  getInvoice(invoiceId): Promise<InvoiceDetails>;
  createCoupon(code, discountType, value): Promise<string>;
  validateWebhookSignature(body, signature): boolean;
  handleWebhook(event): Promise<void>;
}
```

**Implementations**:
- `LocalBillingProvider` (in-memory, no actual charges, works offline)
- `StripeBillingProvider` (stub, waits for credentials)
- `MercadoPagoBillingProvider` (stub, waits for credentials)

**Connection Status**: Shows "NOT_CONNECTED" if provider unavailable or not configured.

#### Social Provider Interface

```typescript
interface SocialProvider {
  name: string; // instagram, facebook, linkedin, tiktok, youtube, x, whatsapp
  isConnected(): boolean;
  
  validateConnection(): Promise<boolean>;
  publishPost(post: SocialPost): Promise<ExternalPostId>;
  schedulePost(post: SocialPost, scheduledAt: DateTime): Promise<ExternalPostId>;
  deleteScheduledPost(externalId): Promise<void>;
  getStatus(externalId): Promise<PostStatus>;
}
```

**Implementations**:
- `LocalSocialProvider` (stores locally, no actual publishing)
- `InstagramProvider` (stub)
- `FacebookProvider` (stub)
- ... (other platforms stubbed)

#### Email Service Interface (Future)

```typescript
interface EmailProvider {
  name: string;
  isConnected(): boolean;
  
  sendEmail(to, subject, template, data): Promise<void>;
  sendBatch(recipients, subject, template): Promise<void>;
}
```

### Data Ownership & Residency

- **Platform Data**: Owned by SaaS operator (Travel Platform company)
  - Subscriber metadata, subscription status, billing records
  - Lead information, sales pipeline
  - Promotional campaigns
  - Audit logs
  - Aggregated metrics (MRR, ARR, churn)

- **Tenant Data**: Owned by subscriber (each travel agency)
  - Customers, trips, offers
  - Proposals, sales, financial records
  - Staff and roles
  - Custom portal configuration
  - **Tenant data is never visible to platform admin** (unless safe impersonation with audit)

### Security Boundaries

1. **Tenant Isolation is Absolute**
   - Platform admin cannot query tenant data without entering safe impersonation mode
   - Safe impersonation mode: Temporary token, short expiry (15 min), audit logged
   - Platform routes never return tenant data
   - Tenant queries never include platform data

2. **Role-Based Access Control (RBAC)**
   - Platform roles: PLATFORM_OWNER, PLATFORM_ADMIN, SUPPORT_ADMIN, BILLING_ADMIN, MARKETING_ADMIN, READ_ONLY_AUDITOR
   - Tenant roles: ADMIN, MANAGER, USER (existing)
   - No role bleeding: Platform roles don't grant tenant access

3. **Audit Trail**
   - Every platform operation logged
   - Actor, timestamp, resource, action, changes tracked
   - Retention: 7 years (compliance)
   - Searchable and exportable for compliance audits

4. **Secrets Management**
   - No passwords, API keys, or tokens logged
   - Stripe/Mercado Pago credentials encrypted at rest
   - OAuth tokens never stored in code
   - Environment variables for secrets (no .env files in repo)

## Implementation Roadmap

### Wave A: Foundation (Weeks 1-2)
1. **Phase 1**: Architecture Inventory (this document)
2. **Phase 2**: Application Surfaces (apps structure)
3. **Phase 3**: Platform Super Admin Authorization (auth infrastructure)
4. **Phase 4**: Subscriber Management (CRUD tenants)
5. **Phase 5**: Tenant Provisioning (workflow automation)

### Wave B: Financial + Leads (Weeks 3-5)
6. **Phase 6**: Plans and Entitlements
7. **Phase 7**: Subscriptions
8. **Phase 8**: Courtesies
9. **Phase 9**: Billing Provider Abstraction
10. **Phase 10**: Billing Webhooks

### Wave C: Support + Operations (Weeks 6-8)
11. **Phase 11**: Platform Financial Dashboard
12. **Phase 12**: Promotions and Coupons
13. **Phase 13**: Landing Page CMS
14. **Phase 14**: Landing Promotion Control
15. **Phase 15**: Lead Capture

### Wave D: Presentation + QA (Weeks 9-10)
16. **Phase 16**: Product Sales CRM
17. **Phase 17**: Social Media Control Center
18. **Phase 18**: Social Provider Abstraction
19. **Phase 19**: Marketing Asset Library
20. **Phase 20**: UTM / Attribution

### Convergence: Landing, Onboarding, Operations (Weeks 11-14)
21-41. Landing page, onboarding, support ops, navigation, demo, security, tests, polish, gates, docs

## Quality Gates

Every phase must pass:
- **Lint**: ESLint + Prettier
- **TypeCheck**: tsc --strict, no any
- **Build**: Turbo build
- **Tests**: Unit + Integration >70% coverage
- **Security**: No secrets, proper RBAC, RLS audit
- **Documentation**: API endpoints documented

## Regression Testing

Throughout implementation:
- Agency App (existing) must function identically
- Customer Portal (existing) must function identically
- No breaking changes to tenant tables or routes
- Existing agency users see zero UI changes

## External Provider Status

Initially, all external providers show **NOT_CONNECTED**:
- Stripe (billing)
- Mercado Pago (billing)
- Instagram, Facebook, LinkedIn, TikTok, X, YouTube, WhatsApp (social)
- Email service (communications)

As credentials are added, connections activate. All functionality works locally/offline.

## Repository Structure

```
travel-platform/
├── apps/
│   ├── agency/                 # Existing agency app
│   ├── customer/               # Existing customer portal
│   ├── platform-admin/         # NEW: Platform super admin UI
│   └── marketing/              # NEW: Public landing page
├── services/
│   └── api/                    # Fastify backend (extended)
├── packages/
│   ├── domain/                 # Shared types (extended with platform types)
│   ├── database/               # Prisma schema (extended)
│   └── ...
├── infrastructure/
│   └── migrations/             # SQL migrations 025-056 (NEW)
├── docs/
│   ├── saas/                   # NEW: SaaS documentation
│   │   ├── SAAS_CONTROL_PLANE_ARCHITECTURE.md (this file)
│   │   ├── PLATFORM_ROUTES.md
│   │   ├── DATABASE_SCHEMA.md
│   │   ├── OPERATIONS.md
│   │   └── ...
│   └── ...
└── ...
```

## Success Criteria

✅ Preserve existing Agency App and Customer Portal (zero regression)  
✅ Implement 41 phases across 4 waves  
✅ All P0/P1 issues resolved  
✅ All quality gates passing  
✅ Browser QA complete (landing, platform admin, existing apps)  
✅ Regression tests passing  
✅ Demo data seeded  
✅ Documentation complete  
✅ Zero external credentials required (all pluggable, local defaults)  
✅ Production-ready SaaS platform  

---

## Next Steps

1. ✅ **Phase 1 Complete**: Architecture Inventory (this document)
2. **Phase 2**: Create application surfaces (apps/platform-admin, apps/marketing)
3. **Phase 3**: Implement platform authentication
4. **Phase 4**: Build subscriber management
5. **Phase 5**: Implement provisioning workflow

See individual phase documentation for detailed implementation steps.
