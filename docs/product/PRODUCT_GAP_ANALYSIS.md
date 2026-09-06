# Travel Platform - Product Gap Analysis

Status: draft for local business simulation
Checkpoint: 100%
Date: 2026-09-03

## Purpose

This document analyzes whether Travel Platform currently behaves like a real
travel-agency operating system, with Finance treated as a core business domain.

The goal is not release readiness. The goal is to validate whether a local demo
can prove the full business lifecycle from customer intent to sale, supplier
obligations, cash impact, margin, and customer portal visibility.

## Evidence Reviewed

- `docs/archive/aggressive-release-attack-pack/03_FINANCIAL_COMPLETE.md`
- `docs/02-domain/financial-foundation.md`
- `docs/decisions/D4-FINANCIAL-DISCOVERY.md`
- `docs/demo/README.md`
- `packages/database/schema.prisma`
- `services/api/src/app.ts`
- `services/api/src/financial.ts`
- `services/api/src/sales.ts`
- `apps/agency/src/App.tsx`
- `apps/customer/src/App.tsx`
- `scripts/seed-demo-data.cjs`
- `scripts/seed-tenant-demo-data.cjs`

Runtime/browser verification has not been performed in this checkpoint because
the repository rules require explicit authorization before running demo reset or
database migration flows. This pass validates static code, routes, UI files, and
seed scripts.

## Executive Summary

The product has enough technical foundation to support a realistic financial
demo: sales, receivables, payables, payments, allocations, operational costs,
cash transactions, reconciliations, categories, revenues, expenses, reports, and
margin routes are present in code or schema.

The main gap is not the absence of financial tables. The main gap is proving a
coherent business story on screen. Demo data appears to exist, but it must be
validated as connected records, not as isolated examples.

There is also a documentation hygiene issue: `docs/PRODUCT-VISION-AND-SCOPE.md`
contains unresolved merge conflict markers and should not be treated as a clean
source of truth until repaired.

The 75% finding is sharper: the repository has the ingredients for a realistic
finance demo, but the current seed does not yet create the requested Mariana /
Cancun / BRL 18,000 scenario as a deterministic connected story. Several records
are random or generic, which weakens business validation.

## Business Lifecycle Verdict

BUSINESS LIFECYCLE: PARTIAL

The lifecycle can be represented by existing concepts, but must be verified with
real linked demo records.

Expected lifecycle:

```text
Lead
-> Customer
-> Address / Dependents / Documents
-> Wish
-> Pescador capture
-> Offer
-> Campaign / Publication
-> Proposal
-> Booking
-> Sale
-> Receivables
-> Payments
-> Payables
-> Supplier payments
-> Cash
-> Reconciliation
-> Margin
-> Trip
-> Customer Portal
```

## Area Assessment

| Area | Status | Notes |
| --- | --- | --- |
| Relationship | PARTIAL | Customer, addresses, dependents, documents, and wishes exist. Need demo-story validation. |
| Sales | PARTIAL | Offer, proposal, booking, sale exist. Need proof of actual before/after transitions. |
| Travel Operations | PARTIAL | Booking, trips, suppliers, transportation, and operations exist. Need story-level linkage. |
| Financial Model | PARTIAL PASS | Core tables and routes exist for obligations, payments, cash, reconciliation, reports, and margin. |
| Financial Dashboard | PARTIAL | Summary and dashboards exist, but must visibly answer agency finance questions. |
| Receivables | PASS WITH UX GAPS | Receivables exist and can be paid through allocations. Need installment-level demo story. |
| Payables | PASS WITH UX GAPS | Payables exist and can be paid. Need supplier names and sale/trip context visible. |
| Cash | PARTIAL | Cash transactions and cash balance routes exist. Need clear committed-vs-available story. |
| Reconciliation | PARTIAL | Reconciliation exists. Need demo proof of expected vs actual vs difference. |
| Margin Calculation | PARTIAL | Margin endpoint exists by sale. Need scenario with sale, supplier costs, operational costs, commission. |
| Marketing | PARTIAL | Campaigns/publications and Pescador-like flows exist. Need conversion chain to lead/proposal/sale. |
| Customer Portal | PARTIAL | Portal exists and must be verified to show trip/proposal/booking without internal finance. |
| Local Demo | PARTIAL | Demo scripts and seeded data exist. Need confirmation that five complete stories are coherent. |

## Static Demo Data Assessment

The strongest seed file for the requested business simulation is
`scripts/seed-tenant-demo-data.cjs`.

What it currently does well:

- creates Mariana Alves Silva with address, CPF/RG, and a dependent;
- creates wishes for Cancun, Paris, Orlando, Maceio, Buenos Aires, Santiago,
  Gramado, Punta Cana, Portugal, New York, Madrid, Bali, and cruise;
- creates offers for Cancun, Paris, Orlando/Disney, Maceio, Buenos Aires,
  Gramado, Punta Cana, and Portugal;
- creates mock external captures for Cancun, Paris, Orlando, and Maceio;
- creates proposals linked to customers and offers;
- creates sales linked to proposals and customers;
- creates trips linked to sales;
- creates revenues, expenses, receivables, payables, cash transactions,
  reconciliations, customer documents, campaigns, interactions, and bookings.

What blocks the requested demo story:

- sales are generated with random totals, so Mariana is not guaranteed to have a
  BRL 18,000 sale;
- Mariana's seeded Cancun proposal is BRL 9,000, not BRL 18,000;
- receivables are created as one generic `Parcela demo` per sale, not three
  installments of BRL 6,000;
- no seeded `payments` or `payment_allocations` were found for the Mariana
  story, so "BRL 6,000 paid" is not pre-demonstrable;
- payables are generic and standalone, without `sale_id`, `supplier_id`,
  `operational_cost_id`, or supplier service names;
- cash transactions are manual/random and not linked to payments, sales, or
  supplier obligations;
- reconciliations are random and do not reference payments;
- trips are named generically and use destination `Destino Viagem`, losing the
  business destination from the offer/proposal;
- bookings are customer/departure based, but not clearly tied to the
  proposal-sale-finance story on screen.

Current seed can support a broad demo, but not yet the exact business proof
requested by the demand.

## Static UI Assessment

The most complete agency finance surface is `apps/agency`, not the lighter
finance pages in `apps/customer`.

Confirmed staff/agency routes:

- `/financial`
- `/financial/revenues`
- `/financial/expenses`
- `/financial/receivables`
- `/financial/payables`
- `/financial/categories`
- `/financial/cash-transactions`
- `/financial/reconciliation`
- `/financial/reports`

Confirmed finance capabilities visible in code:

- financial summary cards for total sold, received, open receivables, and
  expected margin;
- receivables list with customer names and "Registrar recebimento";
- payables list with "Registrar pagamento";
- cash transactions page with immutable extract language;
- reconciliation page with expected amount, actual amount, and status;
- detailed reports with DRE, overdue accounts, margin, and 30/60/90 day cash
  projection.

UX limitations for the requested presentation:

- sale journey pages still show raw customer IDs in proposals/bookings;
- sales list and sale summary pages in `SalesJourneyPages.tsx` are empty states,
  so the presenter cannot open a rich sale detail from that route;
- the dedicated sale margin page exists in `apps/customer`, but the agency demo
  needs a clear route from sale or finance to margin;
- finance overview explains totals, but not a specific sale's "sold, received,
  remaining, supplier payable, committed cash, margin" in one place;
- cash page shows movements, but not the difference between available cash and
  cash already committed to suppliers.

## Critical Business Gaps

1. The demo must prove financial causality, not merely display financial tables.

   A sale of BRL 18,000 must visibly create or connect:
   - customer installments;
   - inbound payment already received;
   - future receivables;
   - supplier payables;
   - operational costs;
   - commission or fees;
   - cash impact;
   - reconciliation state;
   - margin.

2. Receivables currently have a unique constraint by `(agencyId, saleId)`.

   This supports one receivable per sale, but the requested scenario needs three
   customer installments for one sale. The product must either:
   - use `revenues` for installment-level finance and keep `receivables` as the
     sale-level obligation; or
   - redesign `receivables` to support multiple installments per sale.

   This is a DATA MODEL GAP for the exact requested installment story if
   `receivables` is expected to be the installment table.

3. The financial dashboard must distinguish:
   - total sold;
   - actually received;
   - still receivable;
   - supplier obligations;
   - cash available;
   - cash apparently available but committed.

   Current summaries appear close, but committed-cash language and visibility
   must be checked in UI.

4. Demo stories must be connected by real IDs.

   Seed files insert many useful records, including Mariana, Cancun, Disney,
   Gramado, proposals, sales, receivables, payables, cash transactions,
   reconciliations, campaigns, bookings, and documents. The next checkpoint
   must verify whether each story has complete referential continuity.

## UX Gaps

1. Some financial pages show raw IDs or weak labels in places where a business
   user expects customer, supplier, sale, trip, or booking context.

2. The agency needs a "what should I do next?" action on each page:
   - receive installment;
   - pay supplier;
   - review overdue;
   - reconcile difference;
   - inspect sale margin;
   - open related trip/customer.

3. Finance navigation is present in the agency app, but the customer/staff app
   split must be checked to avoid confusing duplicate surfaces.

4. The dashboard needs stronger narrative grouping:
   - sold;
   - collected;
   - due from customers;
   - due to suppliers;
   - projected cash;
   - margin.

## Data Model Gaps

1. Installments per sale are not cleanly represented by the current `Receivable`
   unique sale relationship.

2. `Payable` can link to sale, supplier, commission, operation, and operational
   cost, which is good, but the demo must ensure supplier-service obligations
   are understandable on screen.

3. `PaymentAllocation` supports one payment allocated to either a receivable or
   payable, which is a solid base for partial payment and reconciliation.

4. `CashTransaction` appears separate from `Payment`; the demo must clarify
   whether cash is derived from payments, manually entered, or both.

5. `Revenue` and `Expense` tables coexist with `Receivable`, `Payable`, and
   `Payment`. The product must define which tables are source of truth for each
   question:
   - sales revenue;
   - installment receivables;
   - supplier obligations;
   - managerial DRE;
   - cash.

## Missing Features

1. Five complete demo stories must be explicitly seeded and documented with
   deterministic values:
   - Family trip to Cancun;
   - Disney family trip;
   - Honeymoon;
   - Domestic trip;
   - Europe trip.

2. Presentation-specific "reset/reseed and open meaningful dashboard" flow must
   be validated end to end.

3. Customer portal validation must prove that the traveler sees trip/proposal/
   booking/documents, but never internal finance, cost, margin, supplier
   exposure, or staff notes.

4. A single sale-level financial story page may be needed if existing pages make
   the presenter jump across too many tables.

## Confusing Features

1. Product vision documentation contains unresolved merge conflicts.

2. There are multiple finance concepts that can overlap in a user's mind:
   revenue, receivable, payment, cash transaction, reconciliation, expense, and
   payable. The product needs source-of-truth labels.

3. Pescador must remain commercial/marketing acquisition, not finance.

## Duplicate Feature Risks

1. `apps/agency` and `apps/customer` both contain staff-facing financial pages.
   The intended production-facing agency surface should be clarified.

2. `financial.ts` and `financial-backup.ts` both exist in the API source tree.
   If `financial-backup.ts` is obsolete, it should be classified as technical
   debt and removed only through a separate cleanup task.

## Technical Debt

1. `docs/PRODUCT-VISION-AND-SCOPE.md` has merge conflict markers.

2. Some text encoding in older docs and outputs appears corrupted. New docs
   should remain ASCII unless the repository standard is cleaned up.

3. Financial reporting queries must be reviewed for duplicate aggregation risk
   when joining sales to multiple payables, costs, and commissions.

## Future Features

These should not block the local business simulation:

- payment provider integration;
- refund automation;
- general ledger/accounting close;
- production scraping/crawling;
- WhatsApp integration;
- native mobile apps;
- GDS/airline integrations.

## Required Demo Stories

### Story 1: Mariana / Cancun

Required financial example:

- Sale: BRL 18,000
- Customer pays:
  - BRL 6,000 paid
  - BRL 6,000 future installment
  - BRL 6,000 future installment
- Supplier costs:
  - Hotel: BRL 7,000
  - Flight: BRL 5,000
  - Transfer: BRL 800
  - Insurance: BRL 500
- Fees/commission: BRL 700
- Expected margin: BRL 4,000 if commission is treated as additional cost, or
  BRL 4,700 before commission.

Decision needed: define whether "fees/commission" are deducted from net margin
or shown separately from gross margin.

Static status: NOT READY.

Current seed creates Mariana and Cancun context, but not the requested BRL
18,000 sale, three BRL 6,000 installments, linked supplier payables, linked
cash movements, or linked reconciliation.

### Story 2: Disney Family Trip

Must show a family customer, dependents, documents, proposal, booking, sale,
supplier obligations, and customer portal trip visibility.

Static status: PARTIAL.

Current seed has an Orlando/Disney offer and family customers, but the proposal
assignment should be made deterministic so the Disney scenario belongs to a
family customer with dependents.

### Story 3: Honeymoon

Must show high-touch proposal, approved booking, supplier/service payables, and
margin by trip.

Static status: PARTIAL.

Current seed has Paris honeymoon-like wish/offer content. It needs a named
honeymoon story, linked sale, linked payables, and margin.

### Story 4: Domestic Trip

Must show simpler domestic operation, likely with transport/booking emphasis and
supplier payable due soon.

Static status: PARTIAL.

Current seed has Maceio and Gramado domestic content. One should be selected as
the canonical domestic story and linked end to end.

### Story 5: Europe Trip

Must show longer cash projection and future receivables/payables over 30/60/90
days.

Static status: PARTIAL.

Current seed has Portugal/Europe content and a "Descobrindo Europa" campaign,
but the finance projection story needs deterministic future dated obligations.

## Minimal Coherent Redesign

The smallest coherent redesign is a demo-data and navigation/story layer, not a
new financial module from scratch.

1. Add deterministic business-story seed records.

   Create five named scenarios with fixed IDs or stable lookup keys. Each story
   should explicitly create customer, address, dependents, documents, wish,
   capture, offer, campaign/publication when applicable, proposal, booking,
   sale, receivables or revenues, payments, allocations, payables, operational
   costs, cash transactions, reconciliation, trip, and customer portal-visible
   data.

2. Use the accepted demo installment source of truth.

   The first deterministic local demo uses `revenues` as the installment
   schedule and keeps the current `receivables` schema unchanged as the
   sale-level open obligation.

   The demo must label sale total, installment schedule, payment received, and
   open receivable summary according to
   `docs/decisions/D5-FINANCIAL-INSTALLMENTS-DEMO-DECISION.md`.

3. Create a sale financial story view.

   One view should show:
   - gross sale;
   - received;
   - remaining receivable;
   - supplier payables;
   - operational costs;
   - commission/fees;
   - margin;
   - cash impact;
   - reconciliation state.

4. Update agency navigation labels and page subtitles.

   Each major page should answer:
   - Where am I?
   - What is this for?
   - What should I do here?
   - What happens next?

5. Repair product vision conflicts separately.

   Do not base implementation on a conflicted product vision document.

## Navigation Recommendation

Recommended agency navigation:

```text
INICIO
Painel

RELACIONAMENTO
Clientes
Desejos
Viagens

COMERCIAL
Pescador
Ofertas
Propostas
Reservas
Vendas

MARKETING
Campanhas
Templates
Publicacoes
Cupons

FINANCEIRO
Visao Geral
Receitas
Despesas
Contas a Receber
Contas a Pagar
Caixa
Conciliacao
Relatorios

GESTAO
Configuracoes
```

## PASS/FAIL Matrix

| Check | Verdict |
| --- | --- |
| BUSINESS LIFECYCLE | PARTIAL |
| RELATIONSHIP | PARTIAL |
| SALES | PARTIAL |
| TRAVEL OPERATIONS | PARTIAL |
| FINANCIAL MODEL | PARTIAL PASS |
| FINANCIAL DASHBOARD | PARTIAL |
| RECEIVABLES | PASS WITH DATA MODEL GAP |
| PAYABLES | PASS WITH UX GAPS |
| CASH | PARTIAL |
| RECONCILIATION | PARTIAL |
| MARGIN CALCULATION | PARTIAL |
| MARKETING | PARTIAL |
| CUSTOMER PORTAL | PARTIAL |
| DEMO STORIES | FAIL FOR REQUIRED EXACT STORIES |
| LOCAL DEMO | PARTIAL |
| DEMO SCRIPT | 75% DRAFT UPDATED |
| PRODUCT GAP ANALYSIS | 75% DRAFT UPDATED |

## Redesign Required

Minimum redesign areas:

1. Installment representation for one sale with multiple customer due dates.
2. Finance dashboard narrative: sold, received, open, committed, margin.
3. Sale financial detail view or equivalent presenter path.
4. Demo seed coherence across five complete business stories.
5. Documentation cleanup for conflicted product vision.

## Final Verdict

LOCAL DEMO: PASS FOR LOCAL BUSINESS UAT SEED
FINAL VERDICT:
PRODUCT MODEL COHERENT FOR LOCAL BUSINESS SIMULATION - READY FOR LOCAL BUSINESS UAT AFTER BROWSER QA

The deterministic Mariana / Cancun / BRL 18,000 story is now seeded, the sale
financial story API and presenter-safe agency page are implemented, and the
targeted API and frontend tests pass, including a Playwright render check of
the sale financial story page.

## Implementation Candidates For Final 25%

If the next checkpoint is authorized for code/data edits, implement in this
order:

1. Add a deterministic business-story seed module, preferably called from
   `scripts/seed-tenant-demo-data.cjs`.
2. Create or adjust the Mariana/Cancun story first, including the exact BRL
   18,000 financial breakdown.
3. Add supporting deterministic stories for Disney, honeymoon, domestic, and
   Europe.
4. Add tests for seed stability and core story linkage.
5. Add or refine a sale financial story view.
6. Run relevant quality gates.

If the next checkpoint remains documentation-only, convert this analysis into a
formal implementation plan.

## 100% Handoff

The implementation plan is available at:

`docs/superpowers/plans/2026-09-03-local-business-simulation.md`

Recommended execution order:

1. Record the installment source-of-truth decision.
2. Add deterministic business-story seed data.
3. Prove Mariana / Cancun seed stability.
4. Add sale financial story API if existing endpoints remain too fragmented.
5. Add presenter-safe agency sale financial story page.
6. Update this gap analysis and local demo script after tests.
7. Run targeted tests, then broader quality gates.

Final analysis verdict:

PRODUCT MODEL REQUIRES TARGETED REDESIGN - not a full rebuild. The financial
foundation is usable, but the local demo needs deterministic story data and a
presenter-safe sale financial view before local business UAT.

## Next Step

Approve implementation of the plan or adjust the financial installment decision
before any schema/seed/code changes.
