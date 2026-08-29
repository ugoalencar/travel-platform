# AGENT 02 — PRODUCT CORE A
## Customers + Wishes + Trips

Branch: `release/a-core-customer-wish-trip`

Base from exact current `origin/main`.

### Goal

Deliver real persistence and real API-backed UI for Customers, Wishes and Trips. No production fixture fallback.

### Customers

Implement/reuse real list, detail, create, edit, search, filter, pagination.

### Wishes

Implement/reuse list, detail, create, edit and valid domain state transitions.

### Trips

Implement/reuse list, detail, create, edit and valid state transitions. Keep relationships to proposal/booking when supported by the existing domain.

### Backend rules

Reuse existing Fastify routes first. Only add missing minimal routes. Every route is authenticated by default, tenant-scoped, authorized, validated, parameterized and safe-error.

Browser never authoritatively supplies `agency_id`.

### Frontend rules

Preserve approved visual UI. Replace operational fixture adapters with real API adapters. Implement loading, empty, validation, error and success states.

### Persistence proof

Create customer → wish → trip → reload browser → restart API → data still exists.

### Security proof

Agency A cannot list/read/update/enumerate Agency B records. Test guessed IDs.

### Audit

Important mutations emit safe SEC-F events. Never dump sensitive payloads.

### Gates

lint, typecheck, agency tests, customer tests if touched, security, db, RLS, FORCE RLS, tenant isolation, migrations validate, secrets, security check, build.

### Exit report

BRANCH
HEAD
ROUTES USED
ROUTES ADDED
MIGRATIONS
REAL DATA COVERAGE
MOCKS REMOVED
PERSISTENCE
TENANT TESTS
P0
P1
FINAL VERDICT READY FOR INTEGRATION / BLOCKED

Do not push, PR or merge.
