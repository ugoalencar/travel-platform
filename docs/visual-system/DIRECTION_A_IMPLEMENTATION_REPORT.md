# Direction A — Phase 1 Implementation Report

Scope this round (by explicit user decision): **Agency Dashboard only**. Customer App (Home/Trip/Offers) deferred to a follow-up round.

## Files changed

- `apps/agency/src/pages/DashboardPage.tsx` — full rebuild.
- `apps/agency/src/pages/DashboardPage.test.tsx` — rewritten for the new structure/data sources.
- `apps/agency/src/App.test.tsx` — added mocks for the dashboard's new data calls (getDashboardSummary/getUpcomingTravel/getSalesReportByPeriod/listPipelines/listOpportunities/listOffers already needed adding; the rest existed).
- `apps/agency/src/lib/api.ts` — added `getSalesReportByPeriod()` (reuses existing `GET /reports/sales?groupBy=period`, no backend change).
- `apps/agency/src/index.css` — added premium palette tokens (`--color-travel-navy`, `--color-travel-cyan`, `--color-action-blue`, `--color-kpi-*`).
- `apps/agency/package.json` — added `recharts` (real chart rendering, no library existed in the monorepo before).

## Components created

All page-local (not extracted to shared `components/ui/` yet, since only one page uses them so far):
- `KpiChip` — colored-icon-chip stat card (green/blue/purple/orange tones via the new tokens).
- `OfferCard` / `OfferToCustomerModal` — the offers carousel card and the "Ofertar ao cliente" flow.
- `SummaryRow` — label/value row for the financial summary panel.

## APIs reused (zero backend changes)

- `GET /commercial/dashboard` (`getDashboardSummary`)
- `GET /commercial/travel-search?range=week` (`getUpcomingTravel`)
- `GET /reports/sales?groupBy=period` (new client wrapper `getSalesReportByPeriod`, existing route, MANAGER+ only)
- `GET /commercial/pipelines`, `GET /commercial/pipelines/:id/stages` (implicit), `GET /commercial/opportunities`
- `GET /offers`
- `GET /customers`
- `POST /proposals` (existing `createProposal`, already accepts `offerId` + `customerId`)

## Backend gap discovered (documented per instructions, not implemented)

Investigated Offer→Opportunity→Proposal per the user's request before touching anything:

- **Offer → Proposal: already works end-to-end.** `createProposal({ customerId, offerId, proposedPrice })` existed and is exercised by `SalesJourneyPages.tsx`'s proposal builder. **This is the path "Ofertar ao cliente" uses** — confirmed by explicit user decision, since it needs no backend work.
- **Offer → Opportunity: does not exist.** `CreateOpportunityInput`/`commercial_opportunities` has no `offerId` column. Not implemented this round (would require a migration) — the dashboard's "Ofertar ao cliente" button intentionally skips Opportunity and goes straight to a Proposal instead.
- **Customer-side "Tenho interesse": does not exist as an endpoint.** The `engagements` table already has `offer_id`/`customer_id`/`opportunity_id` columns but no route exposes it. Out of scope for this round (Customer App is deferred).

## Screenshots

Captured live (Playwright, real staging environment, real seeded agency data — "Horizonte Viagens"):
- 1440px desktop dashboard: hero, 6 KPI chips, revenue trend chart (real `/reports/sales` data — MANAGER role), opportunities list (real Pipeline data), operational alerts (real: "2 recebíveis vencidos"), financial summary.
- Offers carousel with 2 real test offers, gradient card treatment.
- "Ofertar ao cliente" modal → customer picker → real `POST /proposals` → success state → "Ver proposta" link to the real created proposal (verified in the database: `offerId`/`customerId` correctly persisted).

(Screenshots were taken during the session and removed afterward per the working directory's own cleanup convention — not stored in the repo; re-run `apps/agency` locally against local-staging to reproduce.)

## Responsive results

Validated at 1440 (primary target, matches the desktop-first reference). 1024/tablet not yet separately validated this round — the layout uses the existing responsive grid classes (`sm:grid-cols-2 lg:grid-cols-3` for KPIs, `lg:grid-cols-3` for the two-column body) already proven elsewhere in the app, but a dedicated tablet screenshot pass is a reasonable follow-up before calling this fully done.

## Browser QA

- Console/network: 2× `403` on `/api/reports/sales` when testing as an AGENT-role user — **expected and handled gracefully** (the endpoint is MANAGER+-gated server-side; the dashboard catches the 403 and simply omits the revenue chart rather than erroring the whole page). No other console errors.
- Empty states verified honestly: the offers carousel section renders nothing at all (not an empty-state box) when the agency has zero active offers, rather than a fake placeholder.
- Loading/error states preserved from the original page (LoadingState component, red alert box).

## Test coverage

- `DashboardPage.test.tsx`: 4/4 passing, including a full "Ofertar ao cliente" → `createProposal` assertion (verifies the exact `{customerId, offerId, proposedPrice}` payload) and an alert-derived-from-real-data test.
- `App.test.tsx`: 15/15 passing (needed new mocks for the dashboard's additional data calls; one regression fixed — the page lost its accessible `<h1>Painel</h1>` when the old `PageHeader` was replaced by the hero banner, restored as a visually-hidden heading so screen readers/tests still get a real page title without visually duplicating the hero's greeting).
- Full agency suite: 118/118 passing.
- Typecheck, lint, build: all clean.

## Visual acceptance

- **VISUAL DIFFERENCE FROM OLD:** HIGH — hero banner, colored KPI chips, real chart, opportunities panel, alerts panel, offers carousel are all new; old page was a plain 6-card grid + two list cards.
- **REFERENCE MATCH:** HIGH for structure/hierarchy/color language (navy hero, cyan accent, colored KPI chip icons, card-based two-column layout, offers carousel with CTA). Not pixel-identical (no destination photography per-offer since Offer has no image field; no fabricated "sales goal" progress bar since no backend field tracks one).
- **GENERIC AI TEMPLATE FEEL:** NO — hero/KPI/alerts/offers all reflect this product's actual domain and real data, not generic dashboard boilerplate.
- **REAL DATA:** YES — every number, every list, every chart point traces to a real backend response; verified live against the real staging database (seeded "Horizonte Viagens" agency data), including creating and confirming a real proposal end-to-end.
- **RESPONSIVE:** PASS at 1440 (primary target); 1024 not separately screenshotted this round.

## FINAL STATUS

**DIRECTION A — PHASE 1 READY FOR VISUAL REVIEW**

Next round (pending user go-ahead): Customer App Home + Trip + Offers, using the text/ASCII spec as reference (no pixel image was supplied for these three screens).
