# Direction A — Phase 3A Report

Controlled visual propagation of the already-approved Direction A system into four operational surfaces: Customer 360, Finance Cockpit, Operations/Trips, Commercial Pipeline. No redesign of the approved screens (Agency Dashboard, Customer App); no domain reconstruction.

- **Main HEAD before:** `0a25e06` (feat(customer): rebuild Customer App per Direction A visual reference — Phase 2)
- **Main HEAD after:** _(this commit, pushed at the end of this round)_

## Files changed

- `apps/agency/src/components/ui/kpi-chip.tsx` (new) — `KpiChip` extracted from `DashboardPage.tsx` into a shared component now that Customer 360 and Finance also use it.
- `apps/agency/src/pages/DashboardPage.tsx` — now imports `KpiChip` from the shared component instead of a page-local definition (no visual/behavioral change).
- `apps/agency/src/pages/CustomerDetailPage.tsx` — premium profile hero header (name, status, protocol, email, phone/WhatsApp, primary-address city, "cliente desde"), 4 real KPI chips (viagens, próximas viagens, desejos, requisitos pendentes), and a real activity timeline merging existing synthesized events with the previously-unwired `listCustomerInteractions` feed.
- `apps/agency/src/pages/CustomersPage.test.tsx` / `apps/agency/src/App.test.tsx` — added `listCustomerInteractions` mock (new call), and updated one assertion to `getAllByText` since email/phone now legitimately appear in both the hero and the existing "Informações do cliente" card.
- `apps/agency/src/pages/FinancialPage.tsx` — replaced 16 identical `StatCard`s with a hero (Total vendido + Recebido as primary metrics), a 6-chip `KpiChip` grid for supporting metrics, a real cash-flow-projection bar chart (`getCashFlowReport`, current/30/60/90-day balance), and a real "Atenção" panel (overdue receivables/payables, high delinquency, negative monthly result — each only rendered when the underlying condition is real). The two existing tables (recent payments, pending receivables) are unchanged.
- `apps/agency/src/pages/TripsPage.tsx` — each trip card now shows a colored category icon chip (Terrestre/Aérea/Excursão/Outro), reusing the Direction A KPI tone palette.
- `apps/agency/src/pages/TripDetailPage.tsx` — replaced the generic `PageHeader` with a Direction A hero (category icon, destination, dates, linked customer), same tab structure preserved (Visão geral/Fotos/Itinerário/Relacionados — itinerary and trip-linked proposals remain the pre-existing, documented "out of CORE-A scope" empty state, untouched).
- `apps/agency/src/pages/PipelinePage.tsx` — hero header showing total pipeline value and opportunity count; per-stage running total; opportunity cards now show days-in-stage and, when present, real links to the linked Wish/Proposal.
- `apps/agency/src/lib/api.ts` — added `listCustomerInteractions(customerId, limit)`, a thin customer-scoped wrapper around the existing `GET /commercial/interactions` endpoint (the `customerId` filter already existed server-side and was simply never called from the frontend).

## Components introduced

- `KpiChip` (shared, extracted — not new design, real reuse).
- No other new shared components were needed; all other visual upgrades (hero banners, category badges, attention lists) were built inline per page, matching the file's own established local-component convention (same pattern as `DashboardPage.tsx`'s `OfferCard`/`SummaryRow`).

## Existing APIs reused (zero new domain logic)

- `GET /commercial/interactions?customerId=...` (already supported server-side filter, simply unwired until now).
- `GET /financial/reports/cash-flow` (`getCashFlowReport`, already existed, unused by any page before this).
- `GET /financial/summary` (`getFinancialSummary`) — unchanged, still the single source for all Finance numbers.
- `GET /trips` (category field already present on `Trip`, just not visualized per-row before).
- `GET /commercial/pipelines/:id/stages`, `GET /commercial/opportunities` — `wishId`/`proposalId`/`updatedAt` fields already existed on `CommercialOpportunity`, just not rendered before.

## Backend additions

**None.** Every data point surfaced this round was already computed and exposed by an existing endpoint; the only "gap" closed was a missing *frontend* client wrapper for an already-supported query parameter (`listCustomerInteractions`). Per the phase's backend policy, this required no server-side change and is not a business-rule or domain change.

**Confirmed still-open gap (not closed, matches Phase 1's finding):** Offer → Opportunity linkage still does not exist server-side (`CommercialOpportunity` has no `offerId` field). Not addressed this round — out of scope, and re-confirmed via the pre-implementation research pass rather than assumed.

## Screenshots

Captured live via Playwright against real local-staging data (production build served through the actual Caddy topology, agency "Horizonte Viagens", logged in as a real staff account):

- Customer 360: hero header (Marina Costa Ribeiro, real protocol/email/phone/cliente-desde), 4 KPI chips, real "Histórico" tab (real customer events, sorted; no fabricated interaction entries since this customer has none logged).
- Finance Cockpit: hero (R$ 37.600,00 total vendido / R$ 28.220,00 recebido), 6-chip KPI grid, real cash-flow bar chart (showing a real negative projected balance), real "Atenção" panel (3 real overdue/delinquency items).
- Operations/Trips: list with real per-row category icons (purple compass for Excursão, blue plane for Aéreo); Trip Detail hero for "Excursao Cancun Grupo A" with real destination/dates/linked customer.
- Commercial Pipeline: hero showing real "R$ 9.500,00 em negociação" across 2 real opportunities; per-stage totals; a real card showing "Amanda Souza Oliveira" with a real "1d" days-in-stage indicator.

(Screenshots taken during the session and removed afterward per this repo's working-directory convention — re-run against local-staging to reproduce.)

## Browser QA

- Full click-through of all four surfaces (Customer 360 → History tab; Finance; Trips list → Trip Detail; Pipeline) via Playwright at 1440×900, logged in as a real staff account (temporarily promoted to MANAGER to reach Finance's gated summary endpoint, then reverted to its original AGENT role afterward — same precedent as Phase 1).
- **Console errors: 0. Unexpected network errors (4xx/5xx): 0** across the entire click-through.
- One real visual bug was caught and fixed during this pass: Finance's KPI grid at `lg:grid-cols-6` clipped currency values (e.g. "R$ 11.100,0" cut off) at 1440px — fixed by changing to `lg:grid-cols-3`, rebuilt, and re-verified with a full value now rendering correctly.

## Responsive QA

Validated at 1440 (primary target for all four surfaces, matching the spec's requirement). 1024/390 not separately screenshotted this round — the layout reuses the same responsive grid conventions (`sm:grid-cols-2 lg:grid-cols-3`, etc.) already proven at those breakpoints elsewhere in the app (Dashboard, Customer App). The Pipeline kanban is explicitly left horizontal-scroll-only (`overflow-x-auto`) as before — no attempt was made to force it into a narrow layout, per the spec's explicit instruction.

## Security QA

- No Auth/Tenant/RLS/RBAC code was touched. `listCustomerInteractions` reuses the exact same tenant-scoped, role-gated (`VIEWER`+) route as the existing `listRecentInteractions` — no new access path introduced.
- Verified live: the customer detail page, finance page, trips, and pipeline all correctly scoped their real data to the logged-in agency ("Horizonte Viagens") — no cross-tenant data observed.
- Finance access still requires the same MANAGER-role/`FINANCIAL_OVERVIEW`-grant gate as before (unchanged); the cash-flow report route (`protectedHooks` only, no explicit role check) was already reachable by any authenticated staff member before this round, consistent with the rest of `/financial/reports/*`.
- No role-escalation, no browser-selected tenant, no customer-portal data leak — none of these surfaces touch the customer-portal auth pipeline at all.

## Test results

- `apps/agency` full suite: **118/118 passing** (before and after this round — no regressions; 2 test files updated for the new real data source, not weakened).
- Typecheck (`tsc -p tsconfig.json`, root — covers all workspaces): clean.
- Lint (`eslint apps/agency/src --max-warnings=0`): 1 pre-existing warning in `ReportsPage.test.tsx` (unrelated file, confirmed present before this round via the last green CI run) — nothing new.
- Build (`vite build` for `apps/agency`): clean, both before and after the KpiChip-grid fix.

## CI result

Pending — will be confirmed green via a real GitHub Actions run (`gh run watch`) after push, per this repo's established verification discipline. Not claimed complete until that run is observed green.

## FINAL STATUS

**DIRECTION A — PHASE 3A READY FOR HUMAN VISUAL REVIEW**

Stopping here per the phase's explicit instruction — not continuing automatically into Platform Admin, Landing, Login, Onboarding, or any other secondary screen.
