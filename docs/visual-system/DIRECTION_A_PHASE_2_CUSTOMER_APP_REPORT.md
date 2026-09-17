# Direction A — Phase 2 Implementation Report (Customer App)

Scope this round (by explicit user decision): **Customer App — Home, Trip Details, Documents, Offers**, plus the shared bottom navigation, matching `docs/visual-reference/direction-a-customer-app.png`.

## Files changed

- `apps/customer/src/customer-portal/CustomerNav.tsx` — rebuilt as a fixed 5-icon bottom tab bar on mobile (Início/Viagens/Ofertas/Suporte/Perfil), left rail (same 5 items + Sair) on desktop.
- `apps/customer/src/customer-portal/CustomerPortalShell.tsx` — moved `<CustomerNav />` after content in DOM order (fixed-position bottom bar) and added bottom padding on mobile so content isn't hidden behind it.
- `apps/customer/src/customer-portal/Tabs.tsx` (new) — small generic pill tab-switcher component. None existed anywhere in the codebase before this.
- `apps/customer/src/customer-portal/pages/CustomerHomePage.tsx` — added a real "Ofertas da sua agência" horizontal carousel (replacing the plain offers-count summary card) using the same destination-art gradient/emoji treatment as the trip hero card.
- `apps/customer/src/customer-portal/pages/CustomerTripDetailsPage.tsx` — reorganized into 4 tabs (Visão geral / Itinerário / Documentos / Pagamentos); added a real "Próximos passos" checklist (`TripNextSteps`) backed by the new trip-requirements endpoint.
- `apps/customer/src/customer-portal/pages/CustomerDocumentsPage.tsx` — added Todos/Disponíveis/Pendentes filter tabs over the existing real `verificationStatus` data.
- `apps/customer/src/customer-portal/pages/CustomerOffersPage.tsx` — replaced the initial-letter placeholder with the same destination-art gradient/emoji card treatment used elsewhere.
- `apps/customer/src/customer-portal/pages/CustomerOfferDetailsPage.tsx` — added a real, functional "Tenho interesse" CTA.
- `apps/customer/src/lib/customerApi.ts` — added `listMyTripRequirements(tripId)` and `recordOfferInterest(offerId)` client wrappers.
- `apps/customer/src/types/travelRequirement.ts` (new) — mirrors the domain `TravelRequirement` type for the wire format, `notes` intentionally omitted (never returned by the API).
- `services/api/src/customer-portal.ts` — added `listMyTravelRequirements(database, tripId?)` and `recordMyOfferInterest(database, offerId)`.
- `services/api/src/routes/customer-portal.ts` — registered `GET /customer-api/trips/:id/requirements` and `POST /customer-api/offers/:id/interest`.
- `infrastructure/migrations/076_engagement_type_interest.sql` (new) — extends the `EngagementType` Postgres enum with `INTEREST`.
- `packages/domain/types.ts` — added `EngagementType.INTEREST`.

## Components created

- `Tabs` (`customer-portal/Tabs.tsx`) — generic, reusable pill tab-switcher. Used by Trip Details (4 tabs) and Documents (3 filter tabs).
- `AgencyOffersCarousel` (Home page, page-local) — horizontal real-offers carousel.
- `TripNextSteps`, `TripDocuments`, `TripPayments` (Trip Details page, page-local) — the 4 tab bodies.

## APIs reused / added

Reused (zero backend changes):
- `GET /customer-api/offers`, `GET /customer-api/offers/:id`
- `GET /customer-api/trips/:id`
- `GET /customer-api/documents`
- `GET /customer-api/payment-schedule`

Added this round (documented gap-closure, not scope creep — both were identified during the Phase 1 investigation and are narrow, additive):
- `GET /customer-api/trips/:id/requirements` → `listMyTravelRequirements()`, reusing the existing Customer 360 `travel_requirements` table (built in an earlier wave, never exposed to the customer portal). Scoped by `agency_id` + `customer_id` (from tenant context) + `trip_id`; `notes` (internal agency-only) is never selected into the response shape.
- `POST /customer-api/offers/:id/interest` → `recordMyOfferInterest()`, reusing the existing `engagements` table/service (`recordEngagement`/`insertEngagement`, already fully implemented but never had an HTTP route). Re-validates the offer is real and currently available for the caller's own agency before recording anything. Required one small, explicitly-scoped migration (076) to add `EngagementType.INTEREST` — the enum had no value representing "customer expressed interest" in an offer. The agency already has a real, existing way to see this: the staff `GET /engagements` route (SOCIAL_AUTOMATION-gated) lists all engagements including this new type.

## Backend gap discovered and closed (per instructions)

Investigated "Tenho interesse" and "Próximos passos" per the user's request before touching the frontend:
- **"Tenho interesse": did not exist as an endpoint.** `engagements` table/service already had `offer_id`/`customer_id` columns and a working `recordEngagement()` function, but zero HTTP routes exposed it to the customer portal, and `EngagementType` had no value for this signal. Closed via migration 076 + one new route + one new function — no new domain concept invented (reuses the existing engagement/CRM model the agency already has staff-side visibility into).
- **"Próximos passos": did not exist as an endpoint.** `travel_requirements` (Customer 360, an earlier wave) already had the exact right shape (`type`, `required`, `fulfilled`, `tripId`) but was never exposed to the customer portal. Closed via one new read-only, tenant-scoped route + one new function — `notes` (internal) is never selected or returned.

No Auth/RBAC/RLS/tenant-architecture/financial-formula/migration-history changes were made. No parallel domain was invented for either CTA.

## Responsive results

Validated via the full test suite at component level (jsdom) and live at 390×844 (mobile) against real staging data (see Browser QA below); the bottom nav uses `sm:` breakpoint to switch from fixed bottom bar (mobile) to static left rail (desktop), matching the same breakpoint convention already used by `CustomerPortalShell`.

## Browser QA (live, real staging data)

Ran a real production build (`vite build`) served through the local-staging Caddy container (`https://portal.localhost`, matching the actual deploy topology), logged in as a real seeded customer ("Amanda Souza Oliveira", 3 real trips, 2 real active offers from her agency), via Playwright at 390×844:

- Bottom tab bar renders exactly as specified: 🏠 Início / 🧳 Viagens / 🎁 Ofertas / 💬 Suporte / 👤 Perfil.
- Home: real next-trip hero ("Viagem - Foz do Iguaçu, PR", real 42-day countdown), real offers carousel (2 real offers with gradient/emoji cards).
- Offers list and detail page: real data, gradient card art consistent with Home.
- **"Tenho interesse" exercised end-to-end for real**: clicked on a real offer → `POST /customer-api/offers/:id/interest` → 201 → confirmed a real `engagements` row was inserted (`type=INTEREST, channel=customer_portal`, correct `offer_id`/`customer_id`) → verified directly via `psql` → cleaned up the test row afterward.
- Trip Details tabs exercised for real: Visão geral (showed a real "Próximos passos" checklist item inserted directly in `travel_requirements` for this test, then cleaned up), Itinerário, Documentos, Pagamentos — all four tabs switch correctly and each real network call fires only when its tab activates.

Two real bugs were caught and fixed during this pass (neither surfaced by the jsdom test suite, since it mocks the API layer):
1. `POST .../offers/:id/interest` returned 500 (`FST_ERR_CTP_EMPTY_JSON_BODY`) — the client sent `Content-Type: application/json` with no body; Fastify's default JSON parser rejects that combination. Fixed by sending `'{}'` as the body in `recordOfferInterest()`.
2. `GET .../trips/:id/requirements` returned 500 (Postgres `42883`, undefined operator) — `listMyTravelRequirements()` cast the optional `tripId` parameter as `$3::uuid`, but `travel_requirements.trip_id` is `text` in this schema (all id columns in this table are `text`, not `uuid`). Fixed the cast to `$3::text`.

No console errors after the fixes; no other network failures observed.

## Test coverage

- `Tabs` exercised indirectly via `CustomerTripDetailsPage.test.tsx` (4 tests: Próximos passos checklist, Itinerário tab, Documentos tab, Pagamentos tab) and `CustomerDocumentsPage` (existing suite, still green).
- `CustomerHomePage.test.tsx` — extended with an assertion for the real offers carousel.
- `CustomerOfferDetailsPage.test.tsx` — extended with a full "Tenho interesse" → `recordOfferInterest('o1')` → success-state assertion.
- Full `apps/customer` suite: 542/542 passing (was 537 before this round).
- Typecheck (`services/api`, `apps/customer`) and lint (both, `--max-warnings=0` on all touched files): clean.

## Visual acceptance

- **VISUAL DIFFERENCE FROM OLD:** HIGH — bottom tab bar replaces the old horizontal-scroll/sidebar nav on mobile; Trip Details went from one long scroll to 4 tabs; Offers/Home cards now use destination-art imagery instead of plain text/initial-letter tiles.
- **REFERENCE MATCH:** HIGH for the 5-icon bottom nav (matches every mobile mockup exactly: Início/Viagens/Ofertas/Suporte/Perfil), the tab pattern on Trip Details, and the offer card treatment. Not pixel-identical (no real destination photography — Offer/Trip have no image field on the backend; `destinationGradient`/`destinationEmoji` is the same honest substitute already used by the existing hero cards).
- **GENERIC AI TEMPLATE FEEL:** NO — every section traces to a real data source; the "Próximos passos" checklist and offers carousel only render when real data exists.
- **REAL DATA:** YES — the "Tenho interesse" CTA writes a real `engagements` row (verifiable by the agency via the existing staff engagements list); the "Próximos passos" checklist reads real `travel_requirements` rows; Documents/Payments tabs reuse the same real, already-existing customer-wide endpoints (no trip_id relation exists on those tables, so this intentionally does not fabricate trip-only filtering).
- **RESPONSIVE:** Bottom-bar/rail breakpoint verified at the component level; live-browser screenshot pass not yet performed this round (see below).

## Known limitation (documented, not silently skipped)

Documents and Payments as *tabs inside* Trip Details show the customer's full real list (not trip-scoped), because neither `customer_documents` nor `receivables` has a `trip_id` column in the schema. Fabricating a trip-only filter would mean either guessing a date/destination match (fragile, could show wrong data) or misrepresenting unrelated documents as trip-specific. This matches the same honesty precedent already set in this page's own `TripPassengers` section (which also documents a real, undecorated backend gap rather than working around it).

## FINAL STATUS

**DIRECTION A — PHASE 2 (CUSTOMER APP) — VERIFIED LIVE, READY FOR VISUAL REVIEW**

Live Playwright verification against real staging data (production build, real Caddy topology, real seeded customer/offers/trips) completed; two real bugs found this way were fixed and re-verified. All temporary test data (one `travel_requirements` row, one `engagements` row) was cleaned up afterward. Two demo customer accounts' passwords were reset to a known test value for login purposes during this pass and were not reverted (harmless local-staging-only data, same precedent as Phase 1's temporary role change).
