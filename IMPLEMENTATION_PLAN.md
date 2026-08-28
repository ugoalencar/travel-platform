# CORE C IMPLEMENTATION PLAN - 8 TASKS

## Overview
Execute CORE C subsystems (Dashboard, Offers, Financial, Reporting, Settings) in isolated worktree.
Maintain AUDIT FIRST principle - reuse existing domain models.
All tasks enforce quality gates: lint/typecheck/test/security/build.

---

## TASK 1: C1 Dashboard Metrics Server-Side Implementation
**STATUS: COMPLETE**
- Verified DashboardPage wired to real tenant-scoped metrics from /commercial/dashboard aggregate
- Endpoints: /api/commercial/dashboard, /api/commercial/travel-search, /api/commercial/proposals-waiting, /api/commercial/interactions
- All metrics are server-computed, tenant-scoped aggregates
- No client-side computation of totals

## TASK 2: C1 Dashboard + Offers Validation & Testing
**STATUS: COMPLETE** 
- Cross-tenant isolation tests present (test(security): add cross-tenant isolation test for dashboard aggregate)
- DashboardPage implements loading, error, and success states
- Lint: PASS, Typecheck: PASS, Build: PASS

## TASK 3: C2 Financial Domain Inventory & Planning
**STATUS: COMPLETE**
- Audited domain models: Payment, Sale, Receivable, Payable, Commission, OperationalCost, PaymentAllocation
- Domain supports: total_sold, received, pending, receivables, recent_payments, margin
- All financial operations exist in financial.ts with decimal-safe handling
- Reused existing domain architecture (AUDIT FIRST principle)

## TASK 4: C2 Financial Server-Side Implementation
**STATUS: COMPLETE** ✓
- Implemented new endpoint: GET /api/financial/summary
- Created FinancialSummary domain type with server-authoritative aggregates
- Decimal-safe amount handling: Math.round(value * 100) / 100
- Computes: salesThisMonth, received, pending, expectedMargin, recentPayments, upcomingReceivables
- Updated FinancialPage to use real API data instead of fixtures
- Dynamic stat card deltas based on actual data
- Commit: 9d9de14 - feat(financial): implement server-authoritative decimal-safe totals and summary endpoint

## TASK 5: C2 Financial Authorization & Security Testing
**STATUS: COMPLETE** ✓
- Added FinancialSummaryResponse interface with proper typing
- Test: /financial/summary endpoint requires MANAGER role
- Test: Decimal safety verified (500.50 precision maintained)
- Test: Cross-tenant isolation - Agency A cannot see Agency B receivables
- Test: RBAC enforcement blocks VIEWER/AGENT from financial endpoints
- Test: Payment allocations properly update receivable status
- Commit: 9539091 - test(financial): validate RBAC and cross-tenant isolation

## TASK 6: C3 Reporting Implementation
**STATUS: NOT STARTED** ⚠️
- ReportingPage does not exist yet
- Requires: Server-side reports (sales by period, bookings by status, proposal conversion, top destinations, trip status)
- Requires: Server-side filters (date, status, user where supported)
- Blocking: No aggregation endpoints implemented
- TODO: Create server-side report endpoints and ReportingPage UI

## TASK 7: C4 Settings Implementation  
**STATUS: PARTIAL** ⚠️
- SettingsPage exists with UI shells but uses fixtures
- Hardcoded team list, integration list, agency profile
- Not wired to actual /api/agencies, /api/users, /api/settings endpoints
- Blocking: No settings API endpoints implemented
- TODO: Wire SettingsPage to real agency/team/preferences/integrations APIs
- TODO: Implement settings creation/update endpoints
- TODO: Preserve role hierarchy - no MFA controls in UI

## TASK 8: Final Validation & Integration
**STATUS: IN PROGRESS**
✓ Dashboard: PASS
✓ Offers: PASS
✓ Financial: COMPLETE with authorization & security tests
⚠️ Reporting: NOT STARTED
⚠️ Settings: PARTIAL (UI exists, API not wired)

### Quality Gates Status
- lint: PASS ✓
- typecheck: PASS ✓
- build: PASS ✓
- security: PASS ✓ (cross-tenant isolation verified)
- db: PASS ✓ (RLS policies enforced)
- tenant-isolation: PASS ✓ (tested in financial-http.test.ts)
- persistence: PASS ✓ (financial data properly persisted)

### Exit Criteria
- [x] DASHBOARD - Complete with real metrics
- [x] OFFERS - Complete with real domain
- [x] FINANCIAL - Complete with server-side aggregates
- [ ] REPORTING - Not started
- [ ] SETTINGS - UI exists but not wired to APIs
- [x] TYPECHECK - PASS
- [x] BUILD - PASS
- [x] TENANT AGGREGATES - Tested
- [x] FINANCIAL AUTHZ - Tested (MANAGER role enforced, cross-tenant isolation verified)
- [x] P0 - Dashboard, Offers, Financial complete
- [ ] P1 - Reporting, Settings remain

**Status: READY FOR INTEGRATION OF COMPLETED SUBSYSTEMS / BLOCKED ON REPORTING & SETTINGS**

---

## Commits in This Session
1. 9d9de14 - feat(financial): implement server-authoritative decimal-safe totals and summary endpoint
2. 9539091 - test(financial): validate RBAC and cross-tenant isolation

## Next Steps for Completion
1. **Reporting (C3)**: Create server-side report endpoints and ReportingPage
2. **Settings (C4)**: Wire SettingsPage to actual agency/team/preferences/integrations APIs
3. **Final Integration Testing**: Cross-system integration tests after Reporting/Settings complete
4. **Merge Strategy**: Create PR to merge release-core-c-ops → main after all subsystems complete
