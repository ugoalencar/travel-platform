# D2: Driver/Guide Operational Identity — Discovery Pack

**Status:** Discovery only. No decision made here.

---

## 1. What exists today (verified against `origin/main`)

- `User` model (`packages/database/schema.prisma`): `id`, `agencyId`,
  `email`, `name`, `role` (`UserRole`: OWNER, ADMIN, MANAGER, AGENT,
  VIEWER), `passwordHash`, `status`, `lastLoginAt`. One identity type for
  all staff, differentiated only by `role`.
- `TenantContext` (`packages/domain/tenant-context.ts`): established from a
  JWT/dev-auth header on every request, carries `agencyId`, `userId`,
  `role` (staff-shaped) — there is a separate
  `establishCustomerTenantContext` path for `CustomerAccount` identities,
  confirming the codebase already distinguishes "staff principal" from
  "customer principal" at the tenant-context layer, but there is no third
  "field operator" principal shape.
- Field Operations (`services/api/src/transport-operations.ts`): creates
  `TransportOperation` and confirms `OperationCheckpoint` rows. Every
  action is attributed to whichever `User` is authenticated — there is no
  `driverId`/`guideId` column on `TransportOperation` or
  `OperationCheckpoint`, and no assignment relation between a `User` and a
  `ScheduledDeparture`/`TransportOperation`. Any staff user with sufficient
  `role` can act on any operation belonging to the agency.
- Dev auth (`services/api/src/dev-auth.ts`): reads `x-dev-role` header,
  validates against `UserRole` enum — no separate "driver" role exists in
  the enum.

## 2. Options (factual comparison, not a recommendation)

### Option A — Extend `User` + `UserRole`
Add a `DRIVER`/`GUIDE` value to `UserRole`, reuse `User` as-is.

- **Login:** Free — reuses the existing JWT/session mechanism unchanged.
- **Assignment:** Would need a new join table/column
  (`TransportOperation.assignedUserId` or similar) since none exists.
- **Security:** Simplest RBAC surface — one enum, one set of role checks
  already wired through `requireRole()`-style middleware. Risk: driver
  accounts sit inside the same privilege model as office staff, so scoping
  "a driver can only touch their assigned operation" needs new
  per-resource authorization logic beyond role checks (today's RBAC is
  role-level, not resource-assignment-level, for every existing vertical).
- **Audit trail:** Free — every table already stamps actions against a
  `User` id implicitly via the authenticated principal, no schema change
  needed for who-did-what at the checkpoint-confirmation level.
- **Mobile UX:** No special handling exists today; a driver would log into
  the same `apps/customer` bundle as staff (see ARCH-CUSTOMER-APP-01 — the
  Field Operations views already live inside the same app as admin), unless
  routed to a fully separate mobile-optimized surface.
- **GPS/push readiness:** No new identity concept needed for this; a device
  token / last-known-location field could hang off `User` directly.

### Option B — Staff/Profile record linked to `User`
Add a `StaffProfile` (or `OperatorProfile`) table with `userId` FK to
`User`, carrying operational-only fields (license number, vehicle
assignment, phone for field contact, device tokens).

- **Login:** Still via `User` — no change to auth.
- **Assignment:** `TransportOperation`/`ScheduledDeparture` would reference
  `StaffProfile.id` (or the underlying `User.id`) for assignment; a profile
  gives a clean place to add operational metadata without polluting `User`
  with fields irrelevant to office staff.
- **Security:** Keeps RBAC on `User.role` as today, adds a data-scoping
  layer via presence/absence of a profile plus an assignment FK — still
  needs new authorization logic to restrict "driver sees only their
  assigned operations," same gap as Option A.
- **Audit trail:** Same as Option A — actions still stamped via `User.id`;
  `StaffProfile` adds queryable operational context (which vehicle, which
  license) without changing who performed the action.
- **Mobile UX:** Same starting point as Option A (`apps/customer` today);
  a profile table is a natural place to store mobile-specific preferences
  later (last device, notification opt-in) without touching `User`.
- **GPS/push readiness:** `StaffProfile` is a more natural home for
  device tokens / last-known-location than bolting them onto `User`
  (`User` today has no columns of this kind, and staff `User` rows
  shouldn't all carry location fields when most are office staff).

### Option C — Dedicated new operational identity model
A fully separate `Operator`/`Driver` entity, potentially with its own
authentication path independent of `User`.

- **Login:** Requires new auth plumbing analogous to `CustomerAccount`'s
  `establishCustomerTenantContext` — the codebase already demonstrates this
  pattern for one non-staff principal type, so it is a known shape, but it
  is a second parallel auth surface to build and maintain (in addition to
  the existing staff-JWT and customer-JWT paths).
- **Assignment:** Cleanest conceptually — `TransportOperation.operatorId`
  FK to a purpose-built table, no reuse of an unrelated staff-permission
  model.
- **Security:** Most naturally scoped — an `Operator` principal shape can
  be constrained by construction (its JWT/session simply cannot carry
  office-staff `role` claims), avoiding the "role check isn't enough, also
  need resource-assignment check" gap present in Options A/B. Costs: another
  RLS-relevant principal type to reason about across every query touching
  `TransportOperation`/`OperationCheckpoint`.
- **Audit trail:** Requires deciding whether checkpoint confirmations are
  attributed to `Operator.id` or still to `User.id` for any staff-performed
  overrides — today, every audit-relevant column in the schema references
  `User`/`Customer`, never a third principal type, so this is new ground.
- **Mobile UX:** Enables a genuinely separate operator-only frontend
  surface (aligned with the `apps/operations` split proposed in
  ARCH-CUSTOMER-APP-01) without any staff-admin code ever being reachable
  from a driver's login.
- **GPS/push readiness:** Cleanest home for device/location data since the
  table exists purely for this purpose; also cleanest boundary for future
  push-notification targeting (notify exactly "operators assigned to
  departures today" without filtering out office `User` rows).

## 3. Cross-cutting facts, not opinions

- None of the three options currently has any assignment relation to build
  on — `TransportOperation` and `ScheduledDeparture` carry no
  driver/guide/operator FK today under any name. Whatever is chosen still
  needs that relation added.
- RLS/tenant isolation (ADR-002) applies regardless of option: any new
  table needs `agencyId` as the tenant column with the same composite-FK
  pattern used everywhere else in `schema.prisma`.
- GPS tracking itself is out of scope for all three options — it is listed
  as DEFERRED in the product vision non-goals regardless of which identity
  model is chosen; this pack only assesses which option leaves the door
  open for it later.

## References
- `packages/database/schema.prisma` (`User`, `UserRole`, `TransportOperation`, `OperationCheckpoint`)
- `packages/domain/tenant-context.ts`
- `services/api/src/dev-auth.ts`
- `services/api/src/transport-operations.ts`
- `docs/adr/ARCH-CUSTOMER-APP-01-findings.md`
- `docs/adr/ARCHITECTURAL-FINDINGS-REGISTRY.md` (D2 entry)
