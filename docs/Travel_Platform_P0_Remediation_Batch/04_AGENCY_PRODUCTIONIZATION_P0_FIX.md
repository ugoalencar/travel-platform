# P0-4 — AGENCY APP PRODUCTIONIZATION / NO FIXTURES

Target: exact blocked `release/final-rc-02` HEAD.

Branch:
`fix/rc02-agency-productionization`

Mission:
Eliminate production-reachable hardcoded agency fixtures while preserving the approved UI.

Do not redesign the visual system.

Inventory every production-reachable:
fixture
mock
demo adapter
hardcoded user
hardcoded agency
hardcoded customer
hardcoded metrics
hardcoded proposal/booking/sale
fallback-to-demo behavior

Classify each:
A. test-only
B. dev-only
C. production-reachable

Only C is P0.

Requirements:
- normal production path uses real API
- no silent fallback to fixture when API fails
- loading/error/empty states instead
- no hardcoded tenant/role/customer identity
- no fake ADMIN
- no demo data compiled into production route behavior
- explicit dev/test fixtures may remain behind non-production code paths

Verify these routes against real API:
dashboard
customers
wishes
trips
proposals
bookings
sales
financial
reports
settings

Search source AND built production artifacts where practical.

Run:
lint
typecheck
agency tests
integration tests
security tests
production build
startup smoke

Return:
BRANCH
HEAD
PRODUCTION-REACHABLE FIXTURES BEFORE
PRODUCTION-REACHABLE FIXTURES AFTER
REAL API ROUTES
NO FAKE IDENTITY
PROD BUILD
STARTUP SMOKE
P0
P1
READY FOR P0 INTEGRATION / BLOCKED

DO NOT PUSH/PR/MERGE.
