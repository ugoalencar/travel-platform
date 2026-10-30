# Agency Module Controls — Design

**Date:** 2026-10-26  
**Status:** Approved by product owner on 2026-10-26  
**Scope:** Travel Platform Full, local implementation only

## Goal

Allow an agency Owner/Admin to simplify the Full workspace by disabling optional
modules, then re-enable them later without losing or rewriting data. Module
availability is agency-wide; individual user permissions remain a separate,
narrower access layer.

## Product decisions

- All existing and newly created agencies start with every catalogued module
  enabled. This preserves current behavior and allows gradual simplification.
- Disabling a module hides its navigation and blocks its direct UI/API access.
- Existing records and cross-module financial history are preserved. Re-enabling
  a module restores access to its retained data.
- Owner/Admin can change agency module settings. Other roles cannot.
- An agency setting cannot grant a capability excluded by the agency's platform
  entitlement/plan. Plan entitlements remain a separate ceiling.
- User-level area grants and role permissions continue to apply after a module
  is enabled; enabling a module does not grant every employee access.
- Dependencies are explicit. An enabled module cannot have an enabled
  prerequisite disabled. The UI explains which dependents must first be turned
  off; the server enforces the same invariant.
- No deployment, remote data change, or Lite implementation is included.

## Existing architecture and constraints

- `feature_flags` are documented as platform/release kill switches, not an
  authorization mechanism. They will not be reused for tenant access control.
- `agent_area_grants` grants areas to individual users; it does not represent
  agency-wide module availability.
- Pescador, campaigns, assets, automations, publications and connectors already
  use platform entitlements in their API routes. The effective access rule must
  be both agency-module-enabled and entitled; agency settings must not bypass
  platform entitlement checks.
- Insurance policies can create receivables; therefore module guards belong on
  user-facing API entry points, not internal financial services or historical
  records. Existing financial consequences and data remain available to the
  core finance module.
- Full is the functional baseline under DEC-007. This implementation is Full
  only; Lite parity is a later, separate scope.

## Module catalog and classification

The first implementation defines a typed, versioned-in-code catalog for every
optional agency route family and navigation route. Unmatched routes remain in
the essential core by default; adding an optional route requires an explicit
catalog prefix and an ownership test. Use specific prefixes to avoid blocking
unrelated essential endpoints in shared route families.
The initial catalog has these groups:

### Always-on core (cannot be disabled)

- Agency identity, authentication, users and access settings
- Customers and supplier records
- Sales, bookings and travel products required to create and identify a sale
- Core finance, including receivables/payables, cash, commission, agency revenue
  and the historical reports needed to reconcile those records

The catalog must make these entries visibly locked as “Essencial”. A locked
module is not a user permission grant: existing role checks remain in force.

### Optional modules

- Pipeline and prospecting (`/pipeline` and its opportunity/stage routes)
- Pescador (`/pescador`), subject to the existing PESCADOR entitlement
- Wishes and customer segmentation
- Insurance (`/insurance`), subject to customer, sales and finance core
- Marketing, split along existing entitlement boundaries for campaigns/coupons,
  creative assets/media, social publishing, and social automation/connectors
- Sales import, as an optional entry point that depends on Sales
- Operational extensions that depend on the core trip/sale records

The implementation has assigned the optional route families and frontend
paths identified in the active Full route inventory. A route with mixed domain
responsibilities remains core until explicitly assigned. The module catalog
and dependency graph are checked for unknown keys, duplicate optional-prefix
ownership, invalid dependencies, and cycles.

### Dependency rules

- Pipeline/prospecting depends on Customers.
- Insurance depends on Customers and Sales/Finance.
- Sales import depends on Sales.
- Pescador publishing/capture dependencies on Offers/Media must be confirmed
  against the actual API calls before they are encoded.
- Marketing submodules must follow their existing entitlements and actual
  cross-module calls; no entitlement is inferred from a UI label.
- Core modules have no disable operation. Optional module dependencies may point
  to core or optional modules.

If any dependency is not yet classified, the implementation must fail the
catalog validation test and keep the affected disable control unavailable until
the relationship is resolved.

## Data and API design

- Add an agency-scoped module-setting table in a new additive migration. Rows
  store the module key, enabled state, last actor and timestamps. The agency
  foreign key, primary key, CHECK constraints, forced RLS, and runtime grants
  follow repository migration patterns. `updated_by` is a historical actor
  reference without a user FK because user identities are intentionally
  excluded from agency backups; the immutable audit event records the actor.
- Missing rows mean enabled, preserving behavior for all existing agencies and
  new agencies without requiring a destructive backfill. The read API returns
  the full catalog with the effective state, dependencies, essential status,
  and entitlement availability.
- Add authenticated endpoints to read the caller's agency catalog and update
  optional module settings. Write authorization is Owner/Admin on the server;
  never accept `agencyId` from the request body. Resolve tenant identity from
  the authenticated context.
- Validate that the requested key exists, is optional, and is entitled. Reject
  disabling a module that is still required by an enabled module. Use a
  transaction and record an audit event for every state change, including
  actor, module, old/new values and dependency context.
- Add a reusable route guard. Authentication and tenant resolution run first;
  module availability is checked before route business logic; existing RBAC and
  entitlement checks still run. Disabled routes return a stable
  `MODULE_DISABLED` response. Settings and core/auth routes remain reachable.
- Internal service calls and historical background/financial processing must
  not be blocked merely because an optional UI module is disabled.

## Frontend behavior

- Add a “Módulos” section in agency settings, available to Owner/Admin.
- Show each module's current state, summary, essential/optional label,
  dependencies, entitlement lock, and why an action is unavailable.
- Hide disabled module navigation. A direct visit to a disabled route shows a
  clear unavailable-module page with a link back to settings when the role can
  manage modules; it must not render the underlying module page.
- Settings remain available when all optional modules are off.
- The interface must not offer toggles for essential modules or bypass server
  validation.

## Test and acceptance plan

1. Unit tests validate the catalog, route coverage, DAG acyclicity, locked core,
   dependency blocking, and entitlement ceiling.
2. API tests prove Owner/Admin can change optional settings, lower roles cannot,
   clients cannot choose another agency, disabled modules reject direct API
   calls, and a missing setting defaults to enabled.
3. Frontend tests prove disabled navigation is hidden, deep links are blocked,
   dependencies/locks are explained, and the settings route remains accessible.
4. Database tests on an explicitly authorized disposable local database verify
   tenant isolation, RLS/grants, transaction behavior, and audit persistence.
5. Existing module behavior and financial side effects continue while the
   module's user-facing area is disabled; re-enable restores access without
   deleting data.
6. Typecheck, lint, targeted tests, Full API/Agency suites, migration validation,
   and local builds pass before claiming completion.

## Out of scope

- Removing the Lite app or merging Lite/Full databases.
- Changing platform entitlements, prices, plans, or Super Admin billing flows.
- Data deletion, archiving, anonymization, or migration.
- Remote environments, production, Gadotti data, deployment, commit or push.
- Automatically changing individual employee permissions.

## Self-review

- No placeholder requirements remain; routes that need finer classification
  have an explicit fail-closed catalog acceptance gate.
- Agency module availability, platform entitlement and per-user authorization
  are three distinct layers and cannot grant one another's authority.
- Default enabled behavior preserves current agency behavior and data.
- Dependency enforcement is defined both in UI and server/API; navigation hiding
  is not treated as security.
- Implementation remains Full-only and local under DEC-007.

