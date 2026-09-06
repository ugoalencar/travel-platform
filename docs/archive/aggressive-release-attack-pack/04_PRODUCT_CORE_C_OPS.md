# AGENT 04 — PRODUCT CORE C / BUSINESS OPS
## Dashboard + Offers + Financial + Reporting + Settings

Branch: `release/c-business-ops`

Do this as one complete area, but validate incrementally after EACH subsection. Never stack the next subsection on a red state.

## C1 Dashboard + Offers

Replace fixture metrics with server-derived tenant-scoped metrics. Use actual Offer domain. Do not implement Pescador unless already launch-required.

Test aggregate isolation across tenants and avoid N+1 queries.

Run lint/typecheck/tests/build before C2.

## C2 Financial

Inventory payment/receivable/sale totals first.

Implement only domain-supported:
- total sold
- received
- pending
- receivables
- recent payments
- margin if existing domain supports it

Server-authoritative amounts. Decimal-safe. Test rounding and duplicate payment mutation. Review RBAC for revenue/cost/margin/payments.

Run lint/typecheck/financial/security/db/build before C3.

## C3 Reporting

Real server-side tenant reports such as sales by period, bookings by status, proposal conversion, top destinations, trip status and supported financial summaries.

Server-side date/status/user filters where supported. No loading whole tables into Node for aggregation. Add cross-tenant aggregate tests.

Run lint/typecheck/reporting/security/db/build before C4.

## C4 Settings

Real Agency profile + Team + existing commercial preferences/notifications/integrations.

Do not invent schema. Preserve role hierarchy. No fake MFA controls.

Run lint/typecheck/settings/RBAC/tenant/build.

## Exit

DASHBOARD
OFFERS
FINANCIAL
REPORTING
SETTINGS
TYPECHECK
BUILD
TENANT AGGREGATES
FINANCIAL AUTHZ
P0
P1
READY FOR INTEGRATION / BLOCKED

Do not push, PR or merge.
