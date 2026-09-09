# TRAVEL PLATFORM — SAAS CONTROL PLANE + SUPER ADMIN + SUBSCRIPTIONS + GROWTH ENGINE

## Objective

Transform the existing Travel Platform into a complete multi-tenant SaaS business platform that can be sold commercially by subscription.

The final product must have four clearly separated experiences:

1. Public Marketing / Landing
2. Platform Super Admin / SaaS Control Plane
3. Agency App
4. Customer / Traveler Portal

The platform owner must be able to sell, provision, bill, support, promote, operate, update, and monitor the SaaS without mixing platform-level operations with each agency's internal business data.

---

## Non-negotiable separation

```text
PLATFORM OWNER
    ↓
SUPER ADMIN / CONTROL PLANE
    ↓
SUBSCRIBER AGENCY TENANT
    ↓
AGENCY USERS
    ↓
AGENCY CUSTOMERS / TRAVELERS
```

Never merge:

```text
AGENCY FINANCIAL
= agency sales, revenues, expenses, receivables, payables

PLATFORM FINANCIAL
= subscriptions, plans, SaaS invoices, courtesy accounts,
  discounts, failed charges, MRR, ARR, churn, SaaS costs
```

They are separate domains.

---

## Autonomy

You are authorized to:

- inspect the monorepo and current architecture
- add platform-level models and additive migrations
- add Super Admin UI
- add marketing/landing application
- add subscription lifecycle
- add billing-provider abstraction
- add support/ticketing
- add controlled impersonation
- add feature flags
- add release management
- add promotion/coupon systems
- add lead capture
- add marketing campaign management
- add social-media connector abstractions
- add analytics/UTM tracking
- add CMS-style configuration for the landing page
- create tests and realistic demo fixtures
- update navigation and documentation
- integrate safely

Do not stop for reversible technical choices.

STOP only if:
1. a real external payment provider account/credential is required
2. a social network API credential/app approval is required
3. a production email/SMS provider credential is required
4. an irreversible production migration is required
5. the work would weaken existing Tenant/RLS/RBAC security
6. a legal/commercial policy must be decided by the business owner

---

# PHASE 1 — ARCHITECTURE INVENTORY

Inspect the repository and document the current state and the new SaaS control-plane boundaries.

Create:

`docs/saas/SAAS_CONTROL_PLANE_ARCHITECTURE.md`

Document:
- current apps
- auth model
- tenant model
- platform-vs-tenant ownership
- Agency App routes
- Customer Portal routes
- billing/marketing code if any
- audit logging
- feature flags
- provider abstractions
- data ownership and security boundaries

Do not rewrite the working tenant architecture unless required.

---

# PHASE 2 — APPLICATION SURFACES

Create/formalize:

## Public Marketing App
Landing, pricing, promotions, lead capture, trial/demo CTA, login entry.

## Platform Super Admin
Dedicated platform-owner console, preferably separate app/route.

## Agency App
Preserve existing app.

## Customer Portal
Preserve existing traveler-facing app.

Super Admin must never appear inside normal Agency navigation.

---

# PHASE 3 — PLATFORM SUPER ADMIN AUTHORIZATION

Create platform-level roles distinct from tenant roles:

```text
PLATFORM_OWNER
PLATFORM_ADMIN
SUPPORT_ADMIN
BILLING_ADMIN
MARKETING_ADMIN
READ_ONLY_AUDITOR
```

Requirements:
- strong auth
- MFA-compatible
- audit logging
- least privilege
- explicit permission checks
- no accidental tenant bypass
- sensitive actions logged
- reason required where appropriate

Existing tenant RLS must remain intact.

---

# PHASE 4 — SUBSCRIBER / AGENCY MANAGEMENT

Super Admin must manage subscriber agencies.

Fields:
- legal/business name
- trade name
- tenant ID
- owner/contact
- email/phone
- company identifier when applicable
- plan
- subscription status
- trial dates
- billing status
- courtesy status
- created/activation/suspension/cancellation dates
- storage usage
- user usage
- feature entitlements
- support status
- last activity

Statuses:

```text
TRIAL
ACTIVE
PAST_DUE
GRACE_PERIOD
SUSPENDED
CANCELLED
COURTESY
```

Do not physically delete tenants as normal cancellation.

---

# PHASE 5 — TENANT PROVISIONING

Implement:

```text
Subscription/Trial
→ create tenant
→ assign plan
→ create initial owner membership
→ seed tenant defaults
→ provision entitlements
→ onboarding invitation
→ ACTIVE/TRIAL
```

Must be:
- idempotent
- tenant-safe
- auditable
- retry-safe
- fail-closed on partial provisioning

Support:
- resend invitation
- suspend
- reactivate
- cancel
- convert trial to paid
- convert to/from courtesy

---

# PHASE 6 — PLANS AND ENTITLEMENTS

Create configurable plans and feature limits.

Examples of entitlements:
- staff users
- customers
- storage
- Pescador
- Marketing
- Financial
- Customer Portal
- advanced reports
- automation
- OCR allowance
- API/integration access
- support level

Backend must enforce plan restrictions where required.

Super Admin:
- create/edit/archive plans
- assign plan
- configure limits/features
- manage current price and future price safely

Do not silently alter historical subscriber pricing.

---

# PHASE 7 — SUBSCRIPTIONS

Create subscription lifecycle with:
- plan
- billing interval
- amount/currency
- start
- next billing date
- trial
- cancellation request/effective date
- status
- provider reference
- current billing period

Support MONTHLY and YEARLY.

Validate state transitions.

---

# PHASE 8 — COURTESIES

Mandatory.

Super Admin can grant courtesy/free subscription with:
- reason
- start
- expiry
- granted by
- plan/entitlements
- notes
- automatic expiry behavior

Every courtesy action audited.

Dashboard must show active courtesy accounts and estimated waived recurring revenue.

---

# PHASE 9 — BILLING PROVIDER ABSTRACTION

Do not store raw card data.

Create provider abstraction, e.g.:

```text
BillingProvider
- createCustomer()
- createSubscription()
- changePlan()
- cancelSubscription()
- createCheckoutSession()
- getInvoice()
- getPaymentStatus()
- createCoupon()
- processWebhook()
```

If no provider is chosen, keep a local/demo provider and disconnected production adapters.

Do not hardcode Stripe/Mercado Pago/etc unless the product already chose one.

---

# PHASE 10 — BILLING WEBHOOKS

Prepare secure webhook processing:
- signature validation
- idempotency
- replay protection
- event persistence
- retry safety
- audit
- no secret logging

Normalize provider events to internal events.

---

# PHASE 11 — PLATFORM FINANCIAL

Create separate platform-owner financial dashboard.

Show:
- MRR
- ARR
- active subscriptions
- trials
- courtesy accounts
- past due
- cancellations
- new subscriptions
- churn
- monthly SaaS revenue
- expected recurring revenue
- discounts
- failed payments
- revenue by plan

Screens:
- Platform Financial Dashboard
- Subscriptions
- Invoices
- Payments
- Failed Payments
- Refunds
- Discounts
- Courtesy Accounts
- MRR/ARR
- Churn
- Reports

Never mix tenant operational sales into SaaS financial reporting.

---

# PHASE 12 — PROMOTIONS / COUPONS

Super Admin must control promotions for selling the product.

Create:
- promotional campaigns
- coupons
- discounts
- plan eligibility
- validity
- usage limits
- trial extensions
- first-month discount
- annual-plan promotion

Examples:
- 20% off first 3 months
- 30-day trial
- annual discount
- partner coupon
- launch promotion
- Black Friday
- referral campaign

Every promotion must have explicit rules and audit history.

---

# PHASE 13 — LANDING PAGE CMS

Super Admin must configure the commercial landing page without editing source code for normal marketing changes.

Editable:
- hero title/subtitle
- CTA labels/actions
- benefits
- modules/features
- Pescador section
- Customer 360 section
- Marketing section
- Financial section
- Customer Portal section
- plan/pricing cards
- testimonials
- FAQ
- promotional banner
- footer
- contact
- legal links
- SEO title/description
- social sharing metadata

Support:

```text
Draft
Preview
Publish
Unpublish
Schedule
```

Use a safe structured schema, not an unrestricted page builder.

---

# PHASE 14 — LANDING PROMOTION CONTROL

Super Admin controls:
- global promotional banner
- campaign countdown when appropriate
- plan badges
- promotional pricing display
- coupon CTA
- trial CTA
- scheduled activation/deactivation
- campaign attribution

Displayed promotion and backend billing rules must reconcile.

---

# PHASE 15 — LEAD CAPTURE

Landing actions:

```text
Request Demo
Start Trial
Talk to Sales
Contact
```

Lead fields:
- name
- company
- email
- phone/WhatsApp
- number of users
- approximate customer volume
- interest
- source
- UTM source/medium/campaign
- created_at
- status
- assigned owner
- notes

Statuses:

```text
NEW
CONTACTED
QUALIFIED
DEMO_SCHEDULED
TRIAL
WON
LOST
```

---

# PHASE 16 — PRODUCT SALES CRM

Create internal sales CRM for selling Travel Platform itself.

Areas:
- leads
- opportunities
- follow-ups
- notes
- demos
- trial status
- subscription conversion
- lost reasons

Dashboard:
- leads by source
- funnel
- conversion
- trials
- trial-to-paid
- campaign performance

---

# PHASE 17 — SOCIAL MEDIA CONTROL CENTER

Create in Super Admin:

```text
Marketing
├── Campaigns
├── Social Calendar
├── Posts
├── Assets
├── Landing Promotions
├── Leads
└── Analytics
```

Social post:
- channel
- campaign
- internal title
- caption/text
- media
- CTA
- destination URL
- UTM
- scheduled_at
- published_at
- status
- external provider reference

Possible channels:
Instagram, Facebook, LinkedIn, TikTok, YouTube, X, WhatsApp Business.

Do not fake publishing.

Without provider credentials:
- create content
- preview
- schedule internally
- copy/export
- calendar
- UTM tracking
- connection status = NOT_CONNECTED

---

# PHASE 18 — SOCIAL PROVIDER ABSTRACTION

Create provider adapters:

```text
SocialProvider
- connect()
- validateConnection()
- publishPost()
- schedulePost()
- deleteScheduledPost()
- getStatus()
```

Use OAuth/provider APIs only.
Never store social passwords.

---

# PHASE 19 — MARKETING ASSET LIBRARY

Create central library:
- images
- logos
- screenshots
- media references
- campaign association
- tags
- alt text
- usage metadata

Validate uploads and block executable files.

---

# PHASE 20 — UTM / ATTRIBUTION

Support:
- utm_source
- utm_medium
- utm_campaign
- utm_term
- utm_content
- referral code

Persist attribution from lead → trial → subscription when possible.

Report:

```text
Campaign
Visits
Leads
Trials
Paid
Conversion
Revenue attributed
```

If analytics provider is absent, implement a first-party attribution base.

---

# PHASE 21 — COMMERCIAL LANDING DESIGN

Build a professional SaaS landing page with:

1. Hero
2. Value proposition
3. Problems solved
4. Main modules
5. Pescador
6. Customer 360
7. Offers & Marketing
8. Financial
9. Customer Portal
10. Security / tenant isolation
11. Plans
12. Testimonials only if clearly synthetic/demo
13. FAQ
14. CTA
15. Footer

Use real system screenshots/mockups when possible.

Responsive desktop/tablet/mobile.

---

# PHASE 22 — LOGIN / COMMERCIAL ENTRY

Professional entry flow.

Landing CTAs:
- Entrar
- Solicitar demonstração
- Começar teste

Login should clearly separate:
- Agência
- Viajante

No dev headers or technical login controls visible.

---

# PHASE 23 — ONBOARDING

After tenant creation, guided Agency onboarding:

1. Complete agency profile
2. Add logo
3. Invite staff
4. Configure business settings
5. Create/import first customer
6. Create first offer
7. Configure financial categories
8. Configure Customer Portal
9. Finish onboarding

Show progress and allow revisit.

---

# PHASE 24 — SUPPORT CONSOLE

Create:
- tickets
- tenants
- incidents
- errors/integrations
- support notes
- audit trail
- system-health summary

Ticket:
- tenant
- requester
- category
- severity
- title
- description
- status
- assigned agent
- timestamps
- resolution
- incident/release links

Statuses:
OPEN, IN_PROGRESS, WAITING_CUSTOMER, RESOLVED, CLOSED.

Severities:
P0, P1, P2, P3.

---

# PHASE 25 — SAFE SUPPORT IMPERSONATION

Implement only if safe with current auth architecture.

Require:
- authorized platform role
- tenant/user selection
- mandatory reason
- short expiry
- visible support-mode banner
- full audit
- explicit exit
- no password/MFA disclosure

Prefer read-only support mode by default.

Never create an invisible universal backdoor.

---

# PHASE 26 — INCIDENT MANAGEMENT

Create incident tracking:
- severity
- affected tenants
- component
- start/detection
- status
- owner
- timeline
- resolution
- root cause
- linked release/tickets

Statuses:
INVESTIGATING, IDENTIFIED, MONITORING, RESOLVED.

---

# PHASE 27 — FEATURE FLAGS

Feature flags scoped by:
- GLOBAL
- PLAN
- TENANT

Examples:
- OCR beta
- new Pescador extractor
- reports
- social integration
- experimental UI

Audit changes and keep defaults safe.

---

# PHASE 28 — RELEASE MANAGEMENT

Platform operations screen:
- current version
- latest version
- release history
- rollout status
- incidents
- feature flags
- deployment notes
- migration count

Do not pretend each tenant has its own code version if deployment is shared SaaS.

---

# PHASE 29 — PLATFORM HEALTH

Show when telemetry exists:
- API health
- DB health
- Redis health
- jobs/queues
- error rate
- latency
- failed logins
- failed payments
- Pescador failures
- storage
- incidents

If telemetry is not connected, display NOT_CONNECTED.
Never fabricate production metrics.

---

# PHASE 30 — PLATFORM AUDIT

Track:
- plan changes
- subscription changes
- courtesy changes
- suspension/reactivation
- billing adjustments
- support impersonation
- feature flags
- landing publication
- promotions
- social publishing
- incidents
- platform roles/users

Never log secrets.

---

# PHASE 31 — SUPER ADMIN NAVIGATION

Recommended:

```text
VISÃO GERAL
- Dashboard SaaS

ASSINANTES
- Agências
- Assinaturas
- Trials
- Cortesias
- Planos

FINANCEIRO DA PLATAFORMA
- Dashboard
- Faturas
- Pagamentos
- Inadimplência
- Reembolsos
- MRR / ARR
- Churn
- Relatórios

VENDAS
- Leads
- Pipeline
- Demonstrações
- Conversões

MARKETING
- Landing Page
- Promoções
- Campanhas
- Social Calendar
- Posts
- Assets
- Cupons
- Analytics

SUPORTE
- Tickets
- Incidentes
- Tenants
- Modo Suporte

OPERAÇÕES
- Saúde
- Feature Flags
- Releases
- Integrações
- Auditoria

CONFIGURAÇÕES
- Plataforma
- Segurança
- Usuários Super Admin
```

---

# PHASE 32 — PLATFORM DASHBOARD

Cards:
- active agencies
- trials
- courtesy
- past due
- MRR
- ARR
- churn
- new leads
- conversion
- open tickets
- P0/P1 incidents
- current version

Charts:
- subscriber growth
- MRR evolution
- churn
- lead conversion
- subscriptions by plan

Use real stored data or clearly labeled demo fixtures.

---

# PHASE 33 — DEMO MODE

Extend `npm run demo:reset` with synthetic Super Admin data.

Seed:
- 12 subscriber agencies
- 4 plans
- trials
- active subscribers
- 2 courtesy accounts
- 1 past-due account
- invoices
- leads
- campaigns
- scheduled posts
- support tickets
- one resolved incident
- feature flags
- release history

No real company/customer data.

---

# PHASE 34 — SECURITY

Mandatory tests:
- tenant admin cannot access platform admin
- customer cannot access platform admin
- platform roles respect permissions
- courtesy/plan changes audited
- safe impersonation
- cross-tenant support controlled
- billing/social credentials not exposed
- webhooks validated
- landing CMS sanitized
- uploads validated
- no secret logging

Required:
P0 = 0
P1 = 0

---

# PHASE 35 — MIGRATIONS

All schema work additive.

Never rewrite applied historical migrations.

Zero-to-head must continue passing.

Document every table as one of:

```text
PLATFORM_SCOPED
TENANT_SCOPED
PUBLIC_MARKETING
```

Do not force fake agency_id into platform-owned data.

---

# PHASE 36 — TESTS

Cover:

Subscriber lifecycle:
trial, paid, past due, grace, suspended, reactivated, cancelled, courtesy.

Plans:
entitlements, limits, upgrades, downgrades.

Billing:
normalized events, idempotency, duplicate webhook, failed payment.

Platform Financial:
MRR, ARR, churn, discounts, courtesy rules.

Landing:
draft, preview, publish, scheduling, lead capture, UTM.

Marketing:
campaigns, social calendar, disconnected provider state.

Support:
tickets, role restrictions, impersonation.

Operations:
feature flags, incidents, releases, audit.

---

# PHASE 37 — HUMAN-LIKE QA

Platform owner flow:

```text
Super Admin Login
→ Dashboard
→ Create Plan
→ Create Promotion
→ Configure Landing
→ Preview
→ Publish
→ Create Demo Lead
→ Convert to Trial
→ Provision Agency
→ Subscription
→ Grant Courtesy
→ Revoke Courtesy
→ Platform Financial
→ Support Ticket
→ Safe Support Mode
→ Exit Support Mode
→ Feature Flag
→ Release
→ Audit
```

Sales flow:

```text
Landing
→ Request Demo
→ Lead
→ Pipeline
→ Trial
→ Tenant provisioned
→ Agency login
```

Marketing flow:

```text
Campaign
→ landing promotion
→ coupon
→ social post
→ schedule
→ connector status
→ UTM
→ lead attribution
```

Also rerun Agency and Customer critical regression flows.

---

# PHASE 38 — VISUAL POLISH

Super Admin must look like a professional SaaS owner console.

Landing must look commercial and persuasive.

Requirements:
- responsive
- professional hierarchy
- no prototype screens
- no raw IDs as primary labels
- clear plan/status badges
- understandable metrics
- empty/loading/error states
- accessible labels
- keyboard navigation
- zero obvious broken buttons

---

# PHASE 39 — FINAL GATES

Run all real repository gates.

At minimum when present:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:security
npm run migrations:validate
npm run build
```

Also:
- DB integration
- demo reset
- browser tests
- zero-to-head
- secrets scan

Do not accept:
P0 > 0
P1 > 0

Fix all locally reversible P0/P1.

---

# PHASE 40 — DOCUMENTATION

Create:

```text
docs/saas/README.md
docs/saas/SUBSCRIPTIONS.md
docs/saas/PLANS_AND_ENTITLEMENTS.md
docs/saas/PLATFORM_FINANCIAL.md
docs/saas/TENANT_PROVISIONING.md
docs/saas/COURTESIES.md
docs/saas/SUPPORT_OPERATIONS.md
docs/saas/SAFE_IMPERSONATION.md
docs/saas/FEATURE_FLAGS.md
docs/saas/RELEASE_MANAGEMENT.md

docs/marketing/LANDING_CMS.md
docs/marketing/PROMOTIONS.md
docs/marketing/LEADS_AND_ATTRIBUTION.md
docs/marketing/SOCIAL_CONTROL_CENTER.md
```

Update the demo presentation script with the SaaS owner story.

---

# PHASE 41 — COMMITS / INTEGRATION

Use clean scoped commits.

No:
- force push
- --no-verify
- destructive rebase
- git add .
- git add -A

Integrate safely into the designated branch after all gates pass.

---

# FINAL REQUIRED STATE

```text
PUBLIC
└── Landing Page
    ├── Promotions
    ├── Pricing
    ├── Request Demo
    ├── Start Trial
    └── Login

PLATFORM OWNER
└── Super Admin
    ├── SaaS Dashboard
    ├── Agencies / Subscribers
    ├── Plans
    ├── Subscriptions
    ├── Trials
    ├── Courtesies
    ├── Platform Financial
    ├── Leads / Sales CRM
    ├── Landing CMS
    ├── Promotions
    ├── Social Control
    ├── Support
    ├── Incidents
    ├── Feature Flags
    ├── Releases
    ├── Health
    └── Audit

AGENCY
└── Existing Agency App

TRAVELER
└── Existing Customer Portal
```

---

# FINAL RESPONSE FORMAT

```text
FINAL HEAD:
SUPER ADMIN:
PLATFORM AUTH:
TENANT PROVISIONING:
SUBSCRIPTIONS:
PLANS/ENTITLEMENTS:
COURTESIES:
BILLING ABSTRACTION:
PLATFORM FINANCIAL:

LANDING PAGE:
LANDING CMS:
PROMOTIONS:
LEAD CAPTURE:
PRODUCT SALES CRM:
SOCIAL CONTROL CENTER:
SOCIAL PROVIDER ABSTRACTION:
UTM/ATTRIBUTION:

SUPPORT CONSOLE:
SAFE IMPERSONATION:
INCIDENTS:
FEATURE FLAGS:
RELEASE MANAGEMENT:
PLATFORM HEALTH:
AUDIT:

AGENCY REGRESSION:
CUSTOMER REGRESSION:
DEMO RESET:
BROWSER QA:
ZERO-TO-HEAD:
LINT:
TYPECHECK:
TESTS:
SECURITY:
BUILD:

P0:
P1:

EXTERNAL INTEGRATIONS BLOCKED:
<only genuine credential/provider blockers>

FINAL VERDICT:

SAAS COMMERCIAL PLATFORM READY FOR PRESENTATION
```

or:

```text
BLOCKED — <exact blocker>
```

Do not stop because payment/social/email credentials are missing.

When external services are unavailable, keep provider integrations in a safe disconnected/demo state and complete everything else.

Do not return "mostly ready".

Fix all locally reversible P0/P1 before final response.
