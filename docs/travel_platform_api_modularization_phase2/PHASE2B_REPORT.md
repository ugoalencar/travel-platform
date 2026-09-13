# Phase 2B Report — CRM/Trips/Commercial Extraction

## Summary

Extracted CRM, Trips, Bookings, Proposals, Wishes, Commercial Cockpit, and
Customer Portal routes into dedicated modules. Cleaned up dead air/land services
imports and parse functions left over from incomplete Phase 2A wiring.

## Results

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| app.ts LOC | 6,802 | 4,580 | −2,222 |
| Inline routes | ~93 | 89 | −4 (air/land services + bookings) |
| Route modules | 8 | 20 | +12 |
| Characterization tests | 24/24 | 24/24 | ✅ |
| Existing test suite | 53/53 | 53/53 | ✅ |
| tsc --noEmit | pass | pass | ✅ |
| eslint (routes/) | 0 errors | 0 errors | ✅ |
| npm run build | pass | pass | ✅ |

## Modules Created (Phase 2B — 7 new)

| File | LOC | Routes |
|------|-----|--------|
| `routes/customers.ts` | 230 | GET/POST /customers, GET/PATCH /customers/:id, GET /customers/:id/wishes, /trips |
| `routes/wishes.ts` | 216 | GET/POST /wishes, GET/PATCH /wishes/:id |
| `routes/proposals.ts` | 113 | GET/POST /proposals, GET/PATCH /proposals/:id, send/cancel/accept/decline |
| `routes/trips.ts` | 1,017 | GET/POST /trips, GET/PATCH /trips/:id, GET/POST /bookings, GET /bookings/:id, POST /bookings/:id/cancel, all /air-services/*, all /land-services/* |
| `routes/commercial-cockpit.ts` | 406 | All /commercial/* routes (opportunities, tasks, interactions, pipelines, reports) |
| `routes/customer-portal.ts` | 137 | All /customer-api/* routes (me, trips, offers, proposals, bookings, documents) |

## Modules Wired (Phase 2A — 9 previously unwired)

| File | Routes |
|------|--------|
| `routes/assets.ts` | GET/POST /assets |
| `routes/engagements.ts` | GET /engagements |
| `routes/entitlements.ts` | GET /entitlements |
| `routes/connectors.ts` | POST /connectors/internal-mock/simulate |
| `routes/campaigns.ts` | GET/POST /campaigns, GET /campaigns/:id, POST /campaigns/:id/offers, /status |
| `routes/publications.ts` | GET/POST /publications, GET /publications/:id, snapshot/publish/status |
| `routes/automations.ts` | GET/POST /automations, GET /automations/:id, activate/pause |
| `routes/coupons.ts` | GET/POST /coupons, POST /coupons/grants, /redemptions |
| `routes/offers.ts` | GET/POST /offers, GET/PATCH /offers/:id |

## Dead Code Removed

- 3 import blocks (air-services, land-services, bookings)
- 9 parse functions (air/land/booking input parsers)
- 20 dead constants (field allowlists, enum values)
- 1 unused ValidationError import (coupons.ts)

## Registration Audit

All 20 route modules verified:
- File exists ✅
- Export function exists ✅
- Import exists in app.ts ✅
- Register call exists in app.ts ✅
- No old inline duplicate remains ✅

## Known Issues

- `settings-queries.ts` `updateNotificationSettings` splice bug preserved (not in scope)
- Phase 2C routes (financial, sales, reporting, employees, commissions, platform) remain inline — 89 routes
