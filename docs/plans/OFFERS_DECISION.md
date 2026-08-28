# Decision: apps/agency Offers screen vs apps/customer Offers screen

## Context

An audit found two Offers implementations in the monorepo:

- `apps/customer/src/pages/OffersPage.tsx` (+ `OfferDetailsPage`,
  `OfferFormPage`, `OfferEditPage`): fully functional, backed by real
  `GET/POST/PATCH /offers` routes (`services/api/src/offers.ts`), with
  RBAC (`VIEWER` to list/read, `MANAGER` to write), tenant scoping, and
  test coverage (`apps/customer/src/pages/OffersPage.test.tsx`,
  `services/api/tests/offers.test.ts`, `offer-routes.test.ts`).
- `apps/agency/src/pages/nav-pages.tsx` `OffersPage`: a `StubPage` with
  three hardcoded rows, no API call at all.

Despite the app name, `apps/customer`'s `OffersPage` is **not**
customer-portal facing — it calls `/api/offers`, which the dev proxy
routes to the staff-facing `protectedHooks` route with ADMIN dev-auth
headers (see `apps/customer/vite.config.ts`'s `devAuthProxyConfig`). The
actual customer-portal offers screen is the separate
`CustomerOffersPage`/`CustomerOfferDetailsPage` pair, which calls
`/customer-api/offers`. So `apps/customer` currently bundles both an
internal back-office UI and a true customer-portal UI in one app.

`apps/agency` (per its own vite.config.ts and this branch's earlier
commits) is the new, design-approved staff/agency UI prototype, intended
to be the internal back-office shell going forward. It has no
AuthProvider/TenantContext of its own yet and, until this change, no
backend wiring at all.

## Decision: (a) — reuse the same real API, new UI on top

`apps/agency`'s `OffersPage` now calls the exact same backend contract
(`GET /offers`) that `apps/customer`'s staff-facing `OffersPage` already
uses, through the same dev-auth proxy convention (`apps/agency/vite.config.ts`
now mirrors `apps/customer/vite.config.ts`'s `devAuthProxyConfig`, ADMIN
role, agency A). The `Offer`/`OfferStatus` types and the request/response
shape in `apps/agency/src/lib/api.ts` are a direct mirror of
`apps/customer/src/types/offer.ts` and `apps/customer/src/lib/api.ts`'s
`listOffers`/`getOffer` — same fields, same status semantics (server always
returns the derived EXPIRED status), same routes. No new backend
capability was introduced; no new fields were invented; the Pescador
external-offer-capture pipeline was left untouched and out of scope.

We did **not** choose (b) — redirecting `apps/agency/offers` to
`apps/customer`'s implementation, or deleting `apps/customer`'s
`OffersPage` — for three reasons:

1. **Different Vite build targets, no shared frontend package.** The two
   apps are independent workspace packages (`@travel-platform/agency`,
   `@travel-platform/customer`) with their own `dist` bundles. There is no
   existing shared frontend lib (`packages/domain` is backend-only:
   tenant-context, tenant-scoped-queries). Introducing one is a real
   architectural change (new workspace package, build wiring, tests) that
   is out of scope for this ticket and risks destabilizing both apps for
   a two-function surface (`listOffers`/`getOffer`).
2. **`apps/customer`'s `OffersPage` is not provably dead.** It has its own
   passing test suite and may still be linked/reachable in the current
   `apps/customer` shell. Deleting or redirecting it is a breaking change
   to a working, tested screen with no equivalent write path
   (create/edit/detail) yet built in `apps/agency`.
3. **Minimal, reversible change.** Duplicating a ~25-line type mirror and
   a ~15-line fetch client is a small, explicit, well-commented cost.
   Every field, route, and status value is called out as mirroring
   `apps/customer`'s exact contract, so the two stay verifiably in sync
   by inspection, and a future consolidation into a shared package (once
   one is justified by a second or third consumer) is a pure extraction
   with no behavior change.

## Follow-up (not done here, explicitly out of scope)

- `apps/agency` only implements the read path (list). Create/edit
  (`OfferFormPage`/`OfferEditPage` equivalents) were not requested by this
  ticket's spec and were not built.
- If/when `apps/agency` fully replaces `apps/customer`'s staff-facing
  screens, `apps/customer/src/pages/OffersPage.tsx` (and its sibling
  Offer detail/form pages) should be removed in a dedicated follow-up,
  and a real decision made about extracting a shared
  `packages/frontend-api`-style client at that point, once there are two
  or more shipping consumers of it.
