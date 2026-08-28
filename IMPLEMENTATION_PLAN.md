# CORE C IMPLEMENTATION PLAN - 8 TASKS

## Overview
Execute CORE C subsystems (Dashboard, Offers, Financial, Reporting, Settings) in isolated worktree.
Maintain AUDIT FIRST principle - reuse existing domain models.
All tasks enforce quality gates: lint/typecheck/test/security/build.

## TASK 1: C1 Dashboard Metrics Server-Side Implementation
- Replace fixture metrics with real tenant-scoped metrics from /commercial/dashboard aggregate
- Ensure Offer domain endpoints exist and respond
- Test: Verify metrics endpoint returns correct schema
- Commit: "feat(dashboard): wire real tenant-scoped metrics"

## TASK 2: C1 Dashboard + Offers Validation & Testing
- Cross-tenant isolation tests (Agency A cannot see Agency B metrics)
- N+1 query prevention validation
- Load, error, and success states on frontend
- Run gates: lint, typecheck, tests, build
- Commit: "test(dashboard): validate cross-tenant isolation and performance"

## TASK 3: C2 Financial Domain Inventory & Planning
- Audit existing Payment, Sale, Receivable domain models
- Document supported fields: total_sold, received, pending, receivables, recent_payments, margin
- Plan backend endpoints needed
- Commit: "audit(financial): inventory domain models and requirements"

## TASK 4: C2 Financial Server-Side Implementation
- Implement financial endpoints (if missing)
- Decimal-safe amount handling
- Test rounding behavior
- Test duplicate payment mutation safety
- Server-authoritative amounts enforcement
- Commit: "feat(financial): implement server-authoritative decimal-safe totals"

## TASK 5: C2 Financial Authorization & Security Testing
- Review and test RBAC for revenue/cost/margin/payments
- Cross-tenant isolation tests for financial data
- Security gates: security, db, tenant isolation
- Run gates: lint, typecheck, financial/security/db/build
- Commit: "test(financial): validate RBAC and cross-tenant isolation"

## TASK 6: C3 Reporting Implementation
- Implement server-side reports: sales by period, bookings by status, proposal conversion, top destinations, trip status
- Implement server-side filters: date, status, user (where supported)
- Avoid N+1 queries - use aggregation queries
- Cross-tenant aggregate tests
- Run gates: lint, typecheck, reporting/security/db/build
- Commit: "feat(reporting): implement server-side reports with filters"

## TASK 7: C4 Settings Implementation
- Implement Agency profile + Team settings (reuse existing models)
- Commercial preferences/notifications/integrations
- Preserve role hierarchy - no changes to RBAC model
- No fake MFA controls
- Run gates: lint, typecheck, settings/RBAC/tenant/build
- Commit: "feat(settings): implement agency profile and team settings"

## TASK 8: Final Validation & Integration
- All previous gates passing (lint, typecheck, build, security)
- Dashboard validation: metrics, offers, isolation
- Financial validation: authorization, rounding, security
- Reporting validation: queries, filters, isolation
- Settings validation: profile, team, preferences
- Tenant aggregates validation
- Financial authorization validation
- Create final commit: "release(core-c): complete financial, reporting, settings implementation"
- Document P0/P1 status
- Ready for integration review (no merge to main)

## Quality Gates (ALL TASKS)
- lint: npm run lint
- typecheck: npm run typecheck
- tests: npm run test
- security: npm run security-check
- build: npm run build
- db: migrations valid, RLS enforced, FORCE RLS tested
- tenant-isolation: cross-tenant read/write tests
- persistence: data survives reload

## Exit Criteria
All of: DASHBOARD, OFFERS, FINANCIAL, REPORTING, SETTINGS, TYPECHECK, BUILD, TENANT AGGREGATES, FINANCIAL AUTHZ, P0, P1
Status: READY FOR INTEGRATION / BLOCKED
