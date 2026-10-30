# Agency Module Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let agency Owner/Admin disable optional Full modules without deleting data, with dependencies, entitlements and user permissions enforced independently.

**Architecture:** Define a typed module catalog and route ownership map in the API. Persist only agency overrides in a new RLS-protected table; absent rows mean enabled. Add tenant-scoped settings endpoints and an API pre-handler that runs after authentication/tenant resolution, then make the Agency navigation, direct routes and settings UI use the same catalog returned by the server.

**Tech Stack:** Fastify, TypeScript, PostgreSQL migrations/RLS, React Router, Vitest, Testing Library, Bun for local commands.

## Global Constraints

- Full only; no Lite, online, Gadotti, Supabase, Render, Vercel, commit or push.
- Every existing and new agency starts with all catalogued modules enabled.
- Disabling hides and blocks access while preserving all data and internal financial processing.
- Agency module availability cannot override plan entitlements or per-user RBAC/area grants.
- `agencyId` comes only from authenticated tenant context.
- Use a new additive migration after 116, with forced RLS and runtime grants; never edit prior migrations.
- Write each test before its implementation and observe the intended failing result.
- Preserve all unrelated dirty-worktree changes; do not reset, stash, clean or revert.

---

## File map

- Create `services/api/src/agency-modules.ts`: catalog, dependency validation, route ownership and effective-state service.
- Create `services/api/src/routes/agency-modules.ts`: read/update HTTP endpoints.
- Modify `services/api/src/app.ts`: install the agency module guard after auth and tenant context; register settings routes.
- Modify `services/api/src/errors.ts`: stable disabled-module error if no existing typed error fits.
- Create `infrastructure/migrations/117_agency_module_settings.sql`: agency-scoped overrides, constraints, forced RLS and runtime grants.
- Create API tests under `services/api/tests/agency-modules*.test.ts`; extend route inventory tests to ensure optional route coverage.
- Create `apps/agency/src/pages/AgencyModulesPage.tsx` and its tests; modify SettingsPage, App.tsx, Sidebar.tsx and API client for controls and route protection.
- Update route inventory, `services/api/src/audit-log.ts`, migration integration expectations, database test setup/grants if required, and docs in `docs/03-security/` and `docs/06-frontend/`.

## Task 1: Define the catalog and dependency invariants (TDD) — done

1. Add tests for known modules, exactly one owner per optional route prefix, locked core modules, dependency validity, dependency-cycle rejection, and “cannot disable prerequisite while enabled dependent exists.”
2. Run `bun --no-env-file ../../node_modules/vitest/vitest.mjs run tests/agency-modules.test.ts` from `services/api`; confirm expected failures.
3. Implement a typed catalog for core and optional modules from the reviewed route inventory. Required first-wave optional groups: Pipeline/prospecting, Pescador, Wishes/segmentation, Insurance, Marketing (subgroups matching existing entitlements), Sales import, and optional operational extensions. Record every frontend route and API route prefix; leave no ambiguous ownership.
4. Encode confirmed dependencies: Pipeline → Customers; Insurance → Customers + Sales/Finance; Sales import → Sales. Verify Pescador/Offers/Media and Marketing subgroup relationships in source before adding edges. Keep core locked.
5. Run the focused test again; expect all catalog/dependency tests to pass.

## Task 2: Persist agency overrides and build the service (TDD) — done

1. Add service tests proving missing override means enabled, disabled override means disabled, plan entitlement remains an upper bound, foreign-agency state is never read, invalid/core keys cannot be changed, and dependency errors identify active dependents.
2. Add migration `117_agency_module_settings.sql` with `(agency_id, module_key)` primary key, known-key constraint, `enabled`, actor/timestamps, tenant-scoped user FK if compatible with the canonical schema, `FORCE ROW LEVEL SECURITY`, fail-closed policies and runtime grants. Do not seed `false`; no row means enabled.
3. Implement service methods using `withTenantTransaction`; update a setting and write one standard audit event in the same transaction. Enforce the dependency check while serializing updates for an agency to avoid concurrent toggles violating the graph.
4. Run focused unit tests and migration validator; confirm tests pass and migration chain validates.

## Task 3: Add API read/update and route enforcement (TDD) — done

1. Add HTTP tests for OWNER/ADMIN writes, MANAGER/AGENT/VIEWER denial, caller-tenant scoping, ignored/rejected client `agencyId`, unknown/core keys, unentitled activation, dependency conflicts, and disabled-module direct API calls.
2. Add `GET /settings/modules` returning catalog, effective state, dependency descriptions, essential/optional state, and entitlement availability. Add `PATCH /settings/modules/:key` with `{ enabled: boolean }`; do not accept a tenant identifier.
3. Add the reusable module guard after authentication and tenant establishment but before business handlers. It must match exact route ownership, skip core/settings/auth routes, return stable `MODULE_DISABLED` for disabled optional APIs, and preserve existing RBAC and entitlement checks.
4. Confirm service-internal financial operations and system-generated historical effects do not invoke the user-facing route guard.
5. Run API tests plus `tsc -p services/api/tsconfig.json --noEmit`, scoped ESLint and route-inventory tests.

## Task 4: Build Agency settings, navigation and direct-route protection (TDD) — done

1. Add component tests proving catalog display, locked core, dependency explanation, entitlement lock, toggle success/failure, and refetch after mutation.
2. Add typed client methods and an Owner/Admin “Módulos” settings route/tab. All modules render active initially when there are no override rows.
3. Hide disabled optional nav entries for every role. Preserve unrelated role/area-grant filtering.
4. Add a route boundary that prevents deep-link rendering of disabled modules and shows an explanatory unavailable state. Core settings remains accessible when optional modules are off.
5. Run Agency component tests, typecheck, scoped ESLint and local build.

## Task 5: Verify RLS, audit, compatibility and local usability

1. [x] Add DB integration coverage for tenant isolation, forced RLS, runtime grants and preventing deletion of overrides. Unit/service tests verify atomic audit behavior and data-preserving state changes.
2. [x] Apply all migrations and RLS checks only in the authorized disposable local container. Existing local databases, including the 55644 fixture, were not modified.
3. [x] Run focused API tests (21), Agency component tests (3), API and Agency typechecks, scoped lint, API build, Agency build and migration validation. The full repository suites were not run because the checkout contains unrelated in-progress changes.
4. [ ] Browser smoke against a persistent local preview remains pending. The existing Full runtime uses a database that was not authorized for migration; the validated disposable container was removed by the test runner.
5. [x] Add security and frontend documentation for module, entitlement and user-permission behavior.

## Acceptance gates

- All agencies behave as if every catalogued module is enabled when no override exists.
- Owner/Admin can disable optional modules; all other roles cannot change settings.
- A disabled optional module is blocked by both navigation/deep-link handling and its API routes.
- A dependency cannot be disabled while a dependent remains enabled; UI and API agree.
- Plan entitlement and user permissions remain separate upper/narrower gates.
- No module disable operation deletes, mutates or makes inaccessible core financial records.
- Re-enable restores normal module access and preserved module data.
- Every agency API/frontend route is classified as core or exactly one optional module; catalog validation has no unknown keys, duplicate owners or cycles.
- Required tests, migration validation, lint, typecheck and builds pass before reporting completion.
