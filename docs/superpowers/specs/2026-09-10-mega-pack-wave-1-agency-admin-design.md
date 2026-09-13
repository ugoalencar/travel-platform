# Mega Pack Wave 1: Agency Admin Foundation Design

## Objective

Implement the first Mega Pack wave as a safe, incremental agency administration foundation. This wave completes agency profile, branding, settings, team visibility, department scaffolding, and permission visibility without changing the core auth model, tenant model, RLS framework, RBAC hierarchy, financial formulas, or provider integrations.

## Current Context

The repository already has:

- `agencies.settings` JSON storage in the initial schema.
- Tenant-scoped `users` with RLS and the role hierarchy `OWNER > ADMIN > MANAGER > AGENT > VIEWER`.
- Platform plans, subscriptions, billing settings, entitlements, and feature flags.
- Agency app settings UI at `apps/agency/src/pages/SettingsPage.tsx`.
- API settings reads and notification preference updates in `services/api/src/settings-queries.ts` and `services/api/src/app.ts`.
- Sidebar gaps for `Papéis e Acessos`, `Integrações`, `Parametrizações`, and `Logs e Auditoria`.

This wave should reuse those surfaces rather than creating a parallel administration app.

## Scope

In scope:

- Agency profile read/update for editable tenant-owned metadata: display name, email, phone, legal document, website, timezone, locale, and default currency.
- Agency branding settings stored in `agencies.settings`: logo URL, primary color, secondary color, portal title, and support contact.
- Team roster improvements using the existing `users` table: list, status display, role display, and read-only permission matrix.
- Department scaffolding stored in additive tenant-scoped tables: departments and user-department memberships.
- Notification preferences stay user-scoped and continue using the existing `notification_preferences` table.
- Agency settings UI becomes a tabbed admin surface: Profile, Branding, Team, Departments, Roles & Access, Notifications.
- API validation, RBAC, audit-friendly behavior, and tenant-scoped transactions.
- Focused backend, frontend, database, and security tests.

Out of scope for this wave:

- Inviting users by email.
- Changing login, auth providers, MFA, production auth, or dev auth.
- Editing the base RBAC role hierarchy.
- Custom per-route permission engine.
- Provider integrations.
- Partner portal, customer onboarding links, contracts, signatures, products, insurance, upsell, and campaigns.
- Financial calculation changes.

## Recommended Approach

Use the existing `agencies.settings` JSON for low-risk settings that do not require relational querying. Add relational tables only for departments because they need membership and future filtering. This minimizes migration blast radius while giving the Mega Pack a real foundation for agency administration.

Alternative rejected: create separate `agency_branding`, `agency_profile`, and `permission_restrictions` tables immediately. That would be more normalized, but it creates more RLS and API surface before the product has proven the exact query needs.

Alternative rejected: keep everything frontend-only. That would make the UI look complete while leaving no authoritative backend state, which is not acceptable for the Mega Pack.

## Data Model

Existing `agencies` fields remain the canonical agency identity. Mutable administration metadata is read from and written to `agencies.settings` under a versioned object:

```json
{
  "admin": {
    "version": 1,
    "profile": {
      "legalDocument": "string",
      "website": "string",
      "timezone": "America/Sao_Paulo",
      "locale": "pt-BR",
      "defaultCurrency": "BRL"
    },
    "branding": {
      "logoUrl": "string",
      "primaryColor": "#0f172a",
      "secondaryColor": "#2563eb",
      "portalTitle": "string",
      "supportEmail": "string",
      "supportPhone": "string"
    }
  }
}
```

Add a new next-numbered migration with:

- `departments`: `id`, `agency_id`, `name`, `description`, `active`, `created_at`, `updated_at`.
- `user_departments`: `id`, `agency_id`, `department_id`, `user_id`, `created_at`.

Both tables must have tenant composite foreign keys, indexes by `agency_id`, `ENABLE RLS`, `FORCE RLS`, CRUD policies tied to `app.current_agency_id`, and integration test coverage.

## API Design

Add or extend endpoints under existing protected agency auth:

- `GET /settings/agency`: returns profile, branding, user role, and capability flags.
- `PATCH /settings/agency`: OWNER/ADMIN only; updates editable profile and branding fields.
- `GET /settings/team`: returns users with role, status, joined date, and department names when available.
- `GET /settings/roles`: returns the fixed RBAC matrix as data for display only.
- `GET /settings/departments`: OWNER/ADMIN/MANAGER read.
- `POST /settings/departments`: OWNER/ADMIN create.
- `PATCH /settings/departments/:id`: OWNER/ADMIN update.
- `PATCH /settings/notifications`: keep existing user-scoped behavior.

All writes must run inside `DatabaseRuntime.withTenantTransaction`. The backend must ignore frontend-supplied `agencyId`.

## UI Design

Update the agency Settings page into a real administration workspace:

- Profile tab: editable agency metadata for OWNER/ADMIN; read-only for other roles.
- Branding tab: color swatches/inputs, logo URL, portal title, and support contact preview.
- Team tab: searchable roster and role/status badges.
- Departments tab: department list and simple create/edit modal for authorized roles.
- Roles & Access tab: read-only role matrix explaining current fixed permissions.
- Notifications tab: current user notification preferences with editable toggles.

The existing sidebar should keep one settings route for this wave; internal tabs can satisfy the current gap labels without introducing multiple incomplete routes.

## Authorization And Security

- Frontend role checks are presentation only.
- Backend enforces all write permissions.
- OWNER and ADMIN may update agency profile, branding, and departments.
- MANAGER may read departments and team.
- AGENT and VIEWER may read basic settings and update only their own notification preferences.
- No browser request may choose `agencyId`, tenant, or role.
- New tenant-scoped tables must have RLS and cross-tenant tests.
- Settings responses must not expose secrets, billing internals, or platform-only data.

## Testing

Backend:

- Unit tests for settings parsing and validation.
- HTTP tests for successful profile/branding update by OWNER/ADMIN.
- HTTP tests for forbidden updates by AGENT/VIEWER.
- Department CRUD tests.
- Cross-tenant test proving Agency B cannot read/update Agency A department rows.

Frontend:

- Settings page renders all tabs.
- OWNER/ADMIN sees editable controls.
- AGENT/VIEWER sees read-only controls where appropriate.
- Notifications can be toggled and submitted.
- API failure states remain visible and non-destructive.

Repository gates:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run test:db` if migrations are added
- `npm run migrations:validate` if migrations are added
- `npm run build`

## Acceptance Criteria

- Agency administrators can update profile and branding values from the agency app.
- Team and role information is clearer and tied to backend state.
- Departments exist as a safe foundation for future staff/permission work if implemented.
- No auth, tenant, RLS, RBAC, or financial architecture is weakened.
- Existing Mega Pack waves can build on this without duplicating settings surfaces.

## Decision

Department persistence is included in this wave. The implementation must start from database/RLS and API tests before wiring the UI.
