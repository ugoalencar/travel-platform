# Travel Platform API — Route Security Inventory

**Generated:** 2026-08-26  
**Base SHA:** fd59a3758b9995e612dc481aebd0e5b5c528a185  
**Total Routes:** 150

---

## Executive Summary

| Classification | Count | Auth Required |
|---------------|-------|---------------|
| PUBLIC | 2 | No |
| CUSTOMER_SCOPED | 10 | Yes (customer pipeline) |
| STAFF_SCOPED | 135 | Yes (staff pipeline) |
| SYSTEM_INTERNAL | 1 | Yes (shared key) |
| TEST_ONLY | 2 | Yes (staff pipeline) |

**Security Principle:** DENY by default. Every route must be explicitly classified.

---

## Route Classifications

### PUBLIC (2 routes)

| Method | Path | Auth | Justification |
|--------|------|------|---------------|
| GET | `/health` | none | Infrastructure health check. No tenant/business data exposed. |
| GET | `/readiness` | none | Infrastructure readiness check. No tenant/business data exposed. |

---

### CUSTOMER_SCOPED (10 routes)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/customer-api/me` | customerHooks | — |
| GET | `/customer-api/agency-contact` | customerHooks | — |
| GET | `/customer-api/trips` | customerHooks | — |
| GET | `/customer-api/trips/:id` | customerHooks | — |
| GET | `/customer-api/offers` | customerHooks | — |
| GET | `/customer-api/offers/:id` | customerHooks | — |
| GET | `/customer-api/proposals` | customerHooks | — |
| GET | `/customer-api/proposals/:id` | customerHooks | — |
| GET | `/customer-api/bookings` | customerHooks | — |
| GET | `/customer-api/bookings/:id` | customerHooks | — |

---

### STAFF_SCOPED (135 routes)

#### Staff Auth (2 routes)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/me` | protectedHooks | — |
| GET | `/tenant-proof` | protectedHooks | — |

#### Customers (4 routes)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/customers` | protectedHooks | VIEWER |
| GET | `/customers/:id` | protectedHooks | VIEWER |
| POST | `/customers` | protectedHooks | AGENT |
| PATCH | `/customers/:id` | protectedHooks | AGENT |

#### Wishes (4 routes)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/wishes` | protectedHooks | VIEWER |
| GET | `/wishes/:id` | protectedHooks | VIEWER |
| POST | `/wishes` | protectedHooks | AGENT |
| PATCH | `/wishes/:id` | protectedHooks | AGENT |

#### Trips (4 routes)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/trips` | protectedHooks | VIEWER |
| GET | `/trips/:id` | protectedHooks | VIEWER |
| POST | `/trips` | protectedHooks | AGENT |
| PATCH | `/trips/:id` | protectedHooks | AGENT |

#### Offers (4 routes)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/offers` | protectedHooks | VIEWER |
| GET | `/offers/:id` | protectedHooks | VIEWER |
| POST | `/offers` | protectedHooks | MANAGER |
| PATCH | `/offers/:id` | protectedHooks | MANAGER |

#### Proposals (8 routes)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/proposals` | protectedHooks | VIEWER |
| GET | `/proposals/:id` | protectedHooks | VIEWER |
| POST | `/proposals` | protectedHooks | MANAGER |
| PATCH | `/proposals/:id` | protectedHooks | MANAGER |
| POST | `/proposals/:id/send` | protectedHooks | MANAGER |
| POST | `/proposals/:id/cancel` | protectedHooks | MANAGER |
| POST | `/proposals/:id/accept` | protectedHooks | MANAGER |
| POST | `/proposals/:id/decline` | protectedHooks | MANAGER |

#### Transport — Routes (8 routes)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/transport/routes` | protectedHooks | VIEWER |
| GET | `/transport/routes/:id` | protectedHooks | VIEWER |
| POST | `/transport/routes` | protectedHooks | MANAGER |
| PATCH | `/transport/routes/:id` | protectedHooks | MANAGER |
| GET | `/transport/routes/:routeId/points` | protectedHooks | VIEWER |
| POST | `/transport/routes/:routeId/points` | protectedHooks | MANAGER |
| PATCH | `/transport/routes/:routeId/points/:id` | protectedHooks | MANAGER |
| POST | `/transport/routes/:routeId/points/reorder` | protectedHooks | MANAGER |

#### Transport — Suppliers (4 routes)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/transport/suppliers` | protectedHooks | VIEWER |
| GET | `/transport/suppliers/:id` | protectedHooks | VIEWER |
| POST | `/transport/suppliers` | protectedHooks | MANAGER |
| PATCH | `/transport/suppliers/:id` | protectedHooks | MANAGER |

#### Transport — Products (4 routes)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/transport/products` | protectedHooks | VIEWER |
| GET | `/transport/products/:id` | protectedHooks | VIEWER |
| POST | `/transport/products` | protectedHooks | MANAGER |
| PATCH | `/transport/products/:id` | protectedHooks | MANAGER |

#### Transport — Departures (4 routes)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/transport/departures` | protectedHooks | VIEWER |
| GET | `/transport/departures/:id` | protectedHooks | VIEWER |
| POST | `/transport/departures` | protectedHooks | MANAGER |
| PATCH | `/transport/departures/:id` | protectedHooks | MANAGER |

#### Transport — Agenda (1 route)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/transport/agenda` | protectedHooks | VIEWER |

#### Bookings (4 routes)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/bookings` | protectedHooks | VIEWER |
| GET | `/bookings/:id` | protectedHooks | VIEWER |
| POST | `/bookings` | protectedHooks | AGENT |
| POST | `/bookings/:id/cancel` | protectedHooks | MANAGER |

#### Field Operations (7 routes)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/operations` | protectedHooks | VIEWER |
| POST | `/operational-staff` | protectedHooks | MANAGER |
| GET | `/operations/:id` | protectedHooks | VIEWER |
| POST | `/operations` | protectedHooks | AGENT |
| POST | `/operations/:id/assignments` | protectedHooks | MANAGER |
| POST | `/operations/:id/checkpoints/:checkpointId/arrival` | protectedHooks | AGENT |
| POST | `/operations/:id/checkpoints/:checkpointId/departure` | protectedHooks | AGENT |

#### Commercial Cockpit — Opportunities (4 routes)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/commercial/opportunities` | protectedHooks | VIEWER |
| GET | `/commercial/opportunities/:id` | protectedHooks | VIEWER |
| POST | `/commercial/opportunities` | protectedHooks | AGENT |
| PATCH | `/commercial/opportunities/:id` | protectedHooks | AGENT |

#### Commercial Cockpit — Tasks (4 routes)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/commercial/tasks` | protectedHooks | VIEWER |
| GET | `/commercial/tasks/:id` | protectedHooks | VIEWER |
| POST | `/commercial/tasks` | protectedHooks | AGENT |
| PATCH | `/commercial/tasks/:id` | protectedHooks | AGENT |

#### Commercial Cockpit — Interactions (2 routes)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/commercial/interactions` | protectedHooks | VIEWER |
| POST | `/commercial/interactions` | protectedHooks | AGENT |

#### Commercial Cockpit — Search & Dashboard (5 routes)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/commercial/customers/search` | protectedHooks | VIEWER |
| GET | `/commercial/travel-search` | protectedHooks | VIEWER |
| GET | `/commercial/dashboard` | protectedHooks | VIEWER |
| GET | `/commercial/proposals-waiting` | protectedHooks | VIEWER |
| GET | `/commercial/post-sale-candidates` | protectedHooks | VIEWER |

#### Pipeline Config (10 routes)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/commercial/pipelines` | protectedHooks | VIEWER |
| POST | `/commercial/pipelines` | protectedHooks | ADMIN |
| GET | `/commercial/pipelines/:id` | protectedHooks | VIEWER |
| PATCH | `/commercial/pipelines/:id` | protectedHooks | ADMIN |
| GET | `/commercial/pipelines/:id/stages` | protectedHooks | VIEWER |
| POST | `/commercial/pipelines/:id/stages` | protectedHooks | ADMIN |
| PATCH | `/commercial/pipelines/:id/stages/:stageId` | protectedHooks | ADMIN |
| GET | `/commercial/pipelines/:id/access` | protectedHooks | ADMIN |
| POST | `/commercial/pipelines/:id/access` | protectedHooks | ADMIN |
| DELETE | `/commercial/pipelines/:id/access/:userId` | protectedHooks | ADMIN |

#### Sales (7 routes)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/sales` | protectedHooks | VIEWER |
| GET | `/sales/:id` | protectedHooks | VIEWER |
| POST | `/sales` | protectedHooks | AGENT |
| PATCH | `/sales/:id` | protectedHooks | AGENT |
| POST | `/sales/:id/confirm` | protectedHooks | MANAGER |
| POST | `/sales/:id/cancel` | protectedHooks | MANAGER |
| POST | `/sales/:id/mark-paid` | protectedHooks | MANAGER |

#### Financial — Read (8 routes)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/financial/receivables` | protectedHooks | MANAGER |
| GET | `/financial/payables` | protectedHooks | MANAGER |
| GET | `/financial/payments` | protectedHooks | MANAGER |
| GET | `/financial/payments/:id/allocations` | protectedHooks | MANAGER |
| GET | `/financial/operational-costs` | protectedHooks | MANAGER |
| GET | `/financial/allocations` | protectedHooks | MANAGER |
| GET | `/financial/sales/:id/margin` | protectedHooks | MANAGER |
| GET | `/financial/dashboard` | protectedHooks | MANAGER |

#### Financial — Write (5 routes)

| Method | Path | Auth | Role |
|--------|------|------|------|
| POST | `/financial/receivables` | protectedHooks | ADMIN |
| POST | `/financial/payables` | protectedHooks | ADMIN |
| POST | `/financial/payments` | protectedHooks | ADMIN |
| POST | `/financial/payments/:id/allocations` | protectedHooks | ADMIN |
| POST | `/financial/operational-costs` | protectedHooks | ADMIN |

#### Pescador (6 routes)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/pescador/captures` | protectedHooks | AGENT |
| POST | `/pescador/captures` | protectedHooks | AGENT |
| POST | `/pescador/captures/:id/review` | protectedHooks | MANAGER |
| POST | `/pescador/captures/:id/approve` | protectedHooks | MANAGER |
| POST | `/pescador/captures/:id/reject` | protectedHooks | MANAGER |
| POST | `/pescador/captures/:id/publish` | protectedHooks | ADMIN |

#### Offer & Growth Engine — Assets (2 routes)

| Method | Path | Auth | Role | Entitlement |
|--------|------|------|------|-------------|
| GET | `/assets` | protectedHooks | VIEWER | CREATIVE_STUDIO |
| POST | `/assets` | protectedHooks | AGENT | CREATIVE_STUDIO |

#### Offer & Growth Engine — Campaigns (5 routes)

| Method | Path | Auth | Role | Entitlement |
|--------|------|------|------|-------------|
| GET | `/campaigns` | protectedHooks | VIEWER | CAMPAIGNS |
| GET | `/campaigns/:id` | protectedHooks | VIEWER | CAMPAIGNS |
| POST | `/campaigns` | protectedHooks | AGENT | CAMPAIGNS |
| POST | `/campaigns/:id/offers` | protectedHooks | AGENT | CAMPAIGNS |
| POST | `/campaigns/:id/status` | protectedHooks | AGENT | CAMPAIGNS |

#### Offer & Growth Engine — Publications (6 routes)

| Method | Path | Auth | Role | Entitlement |
|--------|------|------|------|-------------|
| GET | `/publications` | protectedHooks | VIEWER | SOCIAL_PUBLISHING |
| GET | `/publications/:id` | protectedHooks | VIEWER | SOCIAL_PUBLISHING |
| POST | `/publications` | protectedHooks | AGENT | SOCIAL_PUBLISHING |
| POST | `/publications/:id/snapshot` | protectedHooks | AGENT | SOCIAL_PUBLISHING |
| POST | `/publications/:id/publish` | protectedHooks | MANAGER | SOCIAL_PUBLISHING |
| POST | `/publications/:id/status` | protectedHooks | AGENT | SOCIAL_PUBLISHING |

#### Offer & Growth Engine — Engagements (1 route)

| Method | Path | Auth | Role | Entitlement |
|--------|------|------|------|-------------|
| GET | `/engagements` | protectedHooks | VIEWER | SOCIAL_AUTOMATION |

#### Offer & Growth Engine — Automations (5 routes)

| Method | Path | Auth | Role | Entitlement |
|--------|------|------|------|-------------|
| GET | `/automations` | protectedHooks | VIEWER | SOCIAL_AUTOMATION |
| GET | `/automations/:id` | protectedHooks | VIEWER | SOCIAL_AUTOMATION |
| POST | `/automations` | protectedHooks | AGENT | SOCIAL_AUTOMATION |
| POST | `/automations/:id/activate` | protectedHooks | MANAGER | SOCIAL_AUTOMATION |
| POST | `/automations/:id/pause` | protectedHooks | MANAGER | SOCIAL_AUTOMATION |

#### Connectors (1 route)

| Method | Path | Auth | Role | Entitlement |
|--------|------|------|------|-------------|
| POST | `/connectors/internal-mock/simulate` | protectedHooks | AGENT | SOCIAL_AUTOMATION |

#### Coupons (4 routes)

| Method | Path | Auth | Role | Entitlement |
|--------|------|------|------|-------------|
| GET | `/coupons` | protectedHooks | VIEWER | CAMPAIGNS |
| POST | `/coupons` | protectedHooks | AGENT | CAMPAIGNS |
| POST | `/coupons/grants` | protectedHooks | AGENT | CAMPAIGNS |
| POST | `/coupons/redemptions` | protectedHooks | AGENT | CAMPAIGNS |

#### Entitlements (1 route)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/entitlements` | protectedHooks | VIEWER |

#### Audit Log (1 route)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/offer-growth/audit-log` | protectedHooks | MANAGER |

---

### SYSTEM_INTERNAL (1 route)

| Method | Path | Auth | Justification |
|--------|------|------|---------------|
| POST | `/platform/entitlements` | systemInternal | Platform stopgap (documented temporary gap) |

---

### TEST_ONLY (2 routes)

| Method | Path | Auth | Condition |
|--------|------|------|-----------|
| POST | `/__test/rate-limit-proof` | protectedHooks | exposeTestRoutes === true |
| POST | `/__test/rollback-proof` | protectedHooks | exposeTestRoutes === true |

---

## Security Verification

### Anonymous Access Denial
- [x] Staff routes deny anonymous access
- [x] Customer portal routes deny anonymous access
- [x] Financial routes deny anonymous access
- [x] Booking routes deny anonymous access
- [x] Operations routes deny anonymous access

### Cross-Identity Access Denial
- [x] Customer token cannot use staff routes
- [x] Staff token cannot use customer routes

### Public Routes
- [x] `/health` — no tenant/business data exposed
- [x] `/readiness` — no tenant/business data exposed

### Dev Auth Safety
- [x] Dev auth available in test mode
- [x] Dev auth rejects unknown principals
- [x] Dev auth blocked in production mode

### Classification Enforcement
- [x] All routes have explicit classification
- [x] All non-public routes have auth pipeline
- [x] All public routes have justification

---

## Files Changed

| File | Purpose |
|------|---------|
| `services/api/src/route-classification.ts` | Route security classification system |
| `services/api/src/route-inventory.ts` | Complete route inventory with metadata |
| `services/api/src/app.ts` | Integration with route classification |
| `services/api/tests/sec-a-api-exposure.test.ts` | Security tests for SEC-A |

---

## Final Verdict

**COMPLETE** — All 150 routes classified, security tests added, typecheck passes.

**Recommendation:** Route classification registry is now the source of truth. Any new routes must be registered in `route-inventory.ts` with explicit classification.
