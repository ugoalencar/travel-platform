# Mega Pack Wave 1 Agency Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Mega Pack wave: agency profile/branding settings, team visibility, persisted departments with RLS, role matrix display, and editable notification preferences.

**Architecture:** Extend the existing agency Settings vertical instead of creating a parallel admin app. Store low-query profile/branding metadata in `agencies.settings.admin`, add tenant-scoped department tables for future staff workflows, and enforce all write permissions in Fastify routes.

**Tech Stack:** Node.js, TypeScript, Fastify, PostgreSQL migrations, RLS, React, Vitest, npm workspaces.

## Global Constraints

- Do not change core auth, tenant model, RLS framework, RBAC hierarchy, financial formulas, or provider integrations.
- Do not edit existing applied migrations; add `infrastructure/migrations/048_agency_admin_departments.sql`.
- Do not trust `agencyId` from frontend, body, headers, or query params.
- New tenant-scoped tables must use `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and policies tied to `app.current_agency_id`.
- OWNER and ADMIN can update agency profile, branding, and departments.
- MANAGER can read team and departments.
- AGENT and VIEWER can read basic settings and update only their own notification preferences.
- No secrets, billing internals, or platform-only data may appear in agency settings responses.

---

## File Structure

- Create `infrastructure/migrations/048_agency_admin_departments.sql`: additive department tables, RLS, indexes, grants comments.
- Modify `tests/integration/database/database.integration.test.ts`: include `departments` and `user_departments` in expected tables and tenant-table RLS checks.
- Modify `tests/integration/database/002_prepare_local_roles.sql`: grant runtime access to new department tables when present.
- Create `services/api/tests/settings-routes.test.ts`: HTTP/RBAC/cross-tenant coverage for settings and departments.
- Modify `services/api/src/settings-queries.ts`: parsing, profile/branding reads/writes, roles matrix, departments CRUD.
- Modify `services/api/src/app.ts`: register `PATCH /settings/agency`, `GET /settings/roles`, and department endpoints.
- Modify `services/api/src/route-inventory.ts`: classify the new settings routes if route inventory requires explicit entries.
- Modify `apps/agency/src/lib/api.ts`: add typed settings API helpers if the page needs them.
- Modify `apps/agency/src/pages/SettingsPage.tsx`: replace the read-only Settings screen with the Wave 1 tabbed admin workspace.
- Create or modify `apps/agency/src/pages/SettingsPage.test.tsx`: UI coverage for tabs, editability, and notification submit.

## Task 1: Department Migration And RLS

**Files:**
- Create: `infrastructure/migrations/048_agency_admin_departments.sql`
- Modify: `tests/integration/database/database.integration.test.ts`
- Modify: `tests/integration/database/002_prepare_local_roles.sql`

**Interfaces:**
- Produces tables: `departments(id, agency_id, name, description, active, created_at, updated_at)` and `user_departments(id, agency_id, department_id, user_id, created_at)`.
- Produces RLS behavior: current tenant can CRUD own rows; other tenants and missing tenant context are denied.

- [ ] **Step 1: Add failing DB table expectation**

Add `departments` and `user_departments` to `EXPECTED_TABLES` in `tests/integration/database/database.integration.test.ts`. Add both tables to the tenant-scoped RLS table list.

- [ ] **Step 2: Run DB test to verify failure**

Run: `npm run test:db`

Expected: FAIL because `departments` and `user_departments` do not exist.

- [ ] **Step 3: Add migration 048**

Create `infrastructure/migrations/048_agency_admin_departments.sql` with:

```sql
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT departments_agency_fk FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE RESTRICT,
  CONSTRAINT departments_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT departments_agency_name_key UNIQUE (agency_id, name),
  CONSTRAINT departments_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS user_departments (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  department_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_departments_department_fk
    FOREIGN KEY (agency_id, department_id) REFERENCES departments(agency_id, id) ON DELETE CASCADE,
  CONSTRAINT user_departments_user_fk
    FOREIGN KEY (agency_id, user_id) REFERENCES users(agency_id, id) ON DELETE CASCADE,
  CONSTRAINT user_departments_unique UNIQUE (agency_id, department_id, user_id)
);

CREATE INDEX IF NOT EXISTS departments_agency_idx ON departments(agency_id);
CREATE INDEX IF NOT EXISTS user_departments_agency_idx ON user_departments(agency_id);
CREATE INDEX IF NOT EXISTS user_departments_user_idx ON user_departments(agency_id, user_id);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments FORCE ROW LEVEL SECURITY;
ALTER TABLE user_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_departments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS departments_select_tenant ON departments;
DROP POLICY IF EXISTS departments_insert_tenant ON departments;
DROP POLICY IF EXISTS departments_update_tenant ON departments;
DROP POLICY IF EXISTS departments_delete_tenant ON departments;
DROP POLICY IF EXISTS user_departments_select_tenant ON user_departments;
DROP POLICY IF EXISTS user_departments_insert_tenant ON user_departments;
DROP POLICY IF EXISTS user_departments_update_tenant ON user_departments;
DROP POLICY IF EXISTS user_departments_delete_tenant ON user_departments;

CREATE POLICY departments_select_tenant ON departments
  FOR SELECT USING (agency_id = current_setting('app.current_agency_id', true));
CREATE POLICY departments_insert_tenant ON departments
  FOR INSERT WITH CHECK (agency_id = current_setting('app.current_agency_id', true));
CREATE POLICY departments_update_tenant ON departments
  FOR UPDATE USING (agency_id = current_setting('app.current_agency_id', true))
  WITH CHECK (agency_id = current_setting('app.current_agency_id', true));
CREATE POLICY departments_delete_tenant ON departments
  FOR DELETE USING (agency_id = current_setting('app.current_agency_id', true));

CREATE POLICY user_departments_select_tenant ON user_departments
  FOR SELECT USING (agency_id = current_setting('app.current_agency_id', true));
CREATE POLICY user_departments_insert_tenant ON user_departments
  FOR INSERT WITH CHECK (agency_id = current_setting('app.current_agency_id', true));
CREATE POLICY user_departments_update_tenant ON user_departments
  FOR UPDATE USING (agency_id = current_setting('app.current_agency_id', true))
  WITH CHECK (agency_id = current_setting('app.current_agency_id', true));
CREATE POLICY user_departments_delete_tenant ON user_departments
  FOR DELETE USING (agency_id = current_setting('app.current_agency_id', true));
```

- [ ] **Step 4: Add runtime grants**

In `tests/integration/database/002_prepare_local_roles.sql`, add a guarded block:

```sql
IF to_regclass('public.departments') IS NOT NULL THEN
  GRANT SELECT, INSERT, UPDATE, DELETE ON departments TO travel_app_runtime_local;
END IF;

IF to_regclass('public.user_departments') IS NOT NULL THEN
  GRANT SELECT, INSERT, UPDATE, DELETE ON user_departments TO travel_app_runtime_local;
END IF;
```

- [ ] **Step 5: Verify database**

Run: `npm run migrations:validate`

Expected: PASS and reports 48 migrations.

Run: `npm run test:db`

Expected: PASS with all DB/RLS integration tests green.

## Task 2: Backend Settings Domain

**Files:**
- Modify: `services/api/src/settings-queries.ts`
- Create: `services/api/tests/settings-routes.test.ts`

**Interfaces:**
- Produces `getAgencyProfile`, `updateAgencyProfile`, `getRolesMatrix`, `listDepartments`, `createDepartment`, `updateDepartment`.
- Consumes tenant context only from `getAgencyId()` and `getTenantContext()`.

- [ ] **Step 1: Write failing settings route tests**

Create `services/api/tests/settings-routes.test.ts` using the existing Docker/Postgres pattern from `customer-routes.test.ts`. Apply migrations `001`, `002`, `037`, `048`, then `002_prepare_local_roles.sql`.

Cover:

```ts
it('lets OWNER update agency profile and branding without accepting agencyId spoofing', async () => {});
it('blocks AGENT from PATCH /settings/agency with 403', async () => {});
it('returns the fixed roles matrix from GET /settings/roles', async () => {});
it('lets ADMIN create and update departments under the authenticated tenant', async () => {});
it('keeps Agency A from reading or updating Agency B departments', async () => {});
```

- [ ] **Step 2: Run the new test to verify failure**

Run: `npm --workspace @travel-platform/api run test -- tests/settings-routes.test.ts`

Expected: FAIL because the new endpoints and query functions do not exist.

- [ ] **Step 3: Implement settings parsing and profile/branding update**

In `settings-queries.ts`, extend `AgencyProfile` and add `AgencyBranding`. Read/write `agencies.settings->admin`. Validate:

- `name`: non-empty string up to 160 chars.
- `email`, `supportEmail`: string containing `@` or empty/null.
- `phone`, `supportPhone`: string up to 40 chars.
- `website`, `logoUrl`: `http://` or `https://` URL or empty/null.
- colors: `#[0-9a-fA-F]{6}`.
- timezone/locale/defaultCurrency: string allow-list for `America/Sao_Paulo`, `pt-BR`, `BRL` for this wave.

- [ ] **Step 4: Implement role matrix**

Return a fixed data structure for OWNER, ADMIN, MANAGER, AGENT, VIEWER. This is display-only and must not create a new permission engine.

- [ ] **Step 5: Implement departments CRUD**

Use `crypto.randomUUID()` for ids. Insert/update only with `agency_id = getAgencyId()`. On update, return 404 when no row is found.

- [ ] **Step 6: Verify backend domain tests**

Run: `npm --workspace @travel-platform/api run test -- tests/settings-routes.test.ts`

Expected: PASS.

## Task 3: Fastify Route Wiring And Inventory

**Files:**
- Modify: `services/api/src/app.ts`
- Modify: `services/api/src/route-inventory.ts`

**Interfaces:**
- Consumes functions from `settings-queries.ts`.
- Produces endpoints: `PATCH /settings/agency`, `GET /settings/roles`, `GET /settings/departments`, `POST /settings/departments`, `PATCH /settings/departments/:id`.

- [ ] **Step 1: Add imports**

Add the new settings functions to the existing import block from `./settings-queries`.

- [ ] **Step 2: Register routes in the current Settings section**

Add routes beside the existing `/settings/*` block:

```ts
app.patch('/settings/agency', { preHandler: protectedHooks }, async (request) => {
  requireRole(UserRole.ADMIN);
  const result = await options.database.withTenantTransaction((client) =>
    updateAgencyProfile(client, request.body),
  );
  return result;
});
```

Use `UserRole.VIEWER` for reads, `UserRole.MANAGER` for department reads, and `UserRole.ADMIN` for writes.

- [ ] **Step 3: Update route inventory if required**

Add entries for the new settings routes using existing settings/security classification patterns. Do not create new route classes.

- [ ] **Step 4: Verify route tests and inventory tests**

Run: `npm --workspace @travel-platform/api run test -- tests/settings-routes.test.ts tests/sec-a-api-exposure.test.ts`

Expected: PASS.

## Task 4: Agency Settings UI

**Files:**
- Modify: `apps/agency/src/lib/api.ts`
- Modify: `apps/agency/src/pages/SettingsPage.tsx`
- Create: `apps/agency/src/pages/SettingsPage.test.tsx`

**Interfaces:**
- Consumes API endpoints from Task 3.
- Produces a tabbed Settings workspace with Profile, Branding, Team, Departments, Roles & Access, Notifications.

- [ ] **Step 1: Add failing UI tests**

Test that Settings renders six tabs, shows editable profile fields for ADMIN, shows read-only messaging for AGENT, and calls `PATCH /settings/notifications` when toggles are saved.

- [ ] **Step 2: Run UI test to verify failure**

Run: `npm --workspace @travel-platform/agency run test -- src/pages/SettingsPage.test.tsx`

Expected: FAIL because the new tabs and actions do not exist.

- [ ] **Step 3: Add typed API helpers**

In `apps/agency/src/lib/api.ts`, add helpers or exported types for agency settings, roles, and departments if the existing generic `api` object is not enough.

- [ ] **Step 4: Replace Settings page internals**

Keep the route `/settings`. Implement:

- Profile tab with form fields and save button.
- Branding tab with color inputs and support contact preview.
- Team tab with roster and role/status badges.
- Departments tab with create/edit modal for ADMIN/OWNER.
- Roles & Access tab with fixed matrix.
- Notifications tab with editable toggles.

- [ ] **Step 5: Verify UI**

Run: `npm --workspace @travel-platform/agency run test -- src/pages/SettingsPage.test.tsx`

Expected: PASS.

Run: `npm --workspace @travel-platform/agency run test`

Expected: PASS.

## Task 5: Final Verification

**Files:**
- No new source files unless previous tasks reveal necessary focused tests.

**Interfaces:**
- Verifies all Wave 1 behavior and existing repo quality gates.

- [ ] **Step 1: Targeted backend verification**

Run: `npm --workspace @travel-platform/api run test -- tests/settings-routes.test.ts`

Expected: PASS.

- [ ] **Step 2: Database verification**

Run: `npm run migrations:validate`

Expected: PASS with 48 migrations.

Run: `npm run test:db`

Expected: PASS.

- [ ] **Step 3: Repository gates**

Run:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
```

Expected: all commands exit 0. Lint/build warnings are acceptable only if they are pre-existing warnings and no errors occur.

- [ ] **Step 4: Status report**

Report changed files, test evidence, remaining Mega Pack waves, and updated completion percentage.

## Plan Self-Review

- Spec coverage: covered profile, branding, team, departments, roles, notifications, RLS, RBAC, and UI.
- Placeholder scan: no implementation step relies on an unspecified future provider or external secret.
- Type consistency: API endpoints and function names are consistent across backend and UI tasks.
- Scope control: contracts, onboarding links, partners, products, insurance, upsell, and provider integrations remain outside Wave 1.
