# Travel Platform - Local Demo Script

Status: draft for local business simulation
Checkpoint: 100%
Date: 2026-09-03

## Purpose

This script is for a 15-20 minute local demonstration of Travel Platform as a
real travel-agency operating system.

The presenter should be able to show a coherent business lifecycle without
asking the audience to infer relationships from database tables.

All data must be synthetic and demo-only.

## Demo Principle

The demo must answer real agency questions:

- How much did we sell?
- How much have we received?
- How much is still open?
- Which customers are overdue?
- Which suppliers are due soon?
- What cash is available?
- What cash looks available but is already committed?
- Which trip generated margin?
- Which salesperson sold more?
- What enters and leaves in the next 30/60/90 days?

## Pre-Demo Setup

1. Reset local demo data.

   ```powershell
   npm run demo:reset
   ```

2. Start the local demo.

   ```powershell
   npm run demo
   ```

3. Open the agency portal.

   ```text
   http://localhost:5173
   ```

4. Open the customer portal in a second tab if available.

   ```text
   http://localhost:5174
   ```

5. Confirm the environment is clearly marked as demo/local.

## Demo Readiness Note

The deterministic Mariana / Cancun / BRL 18,000 story is now seeded and
verified by passing tests. The full sale financial story is available at:

```text
Main financial story route:
/financial/sales/d0d50001-0000-4000-8000-000000000009/story
```

Current demo seed strengths:

- Mariana exists with address, document context, and a dependent.
- Cancun wish, Cancun offer, and Cancun external capture exist.
- Sales, receivables, payables, revenues, expenses, cash transactions,
  reconciliations, campaigns, bookings, and trips are seeded.

Current demo seed blockers:

- Mariana's Cancun proposal is not BRL 18,000.
- Sales are random and not stable for presenter rehearsal.
- Receivables are one generic item per sale, not three installments.
- Payables are not linked to the sale, supplier, or service.
- Payments and payment allocations are not pre-seeded for the main story.
- Cash and reconciliation entries are not linked to the main story.
- Trips use generic names/destinations in the tenant seed.

## Main Story: Mariana / Cancun

Use this as the anchor story for the full lifecycle after deterministic seed
data is added.

### Business Facts To Show

- Customer: Mariana
- Destination: Cancun
- Sale: BRL 18,000
- Customer payment plan:
  - BRL 6,000 already paid
  - BRL 6,000 future installment
  - BRL 6,000 future installment
- Supplier obligations:
  - Hotel: BRL 7,000
  - Flight: BRL 5,000
  - Transfer: BRL 800
  - Insurance: BRL 500
- Fees/commission: BRL 700
- Gross margin before commission: BRL 4,700
- Net margin after commission: BRL 4,000

### Segment 1 - Agency Dashboard

Time: 2 minutes

Show:

- active customers;
- open wishes;
- proposals;
- confirmed bookings;
- monthly sales;
- monthly receipts;
- receivables;
- payables;
- upcoming trips;
- commercial funnel;
- cash projection.

Presenter line:

```text
We are starting from the agency owner's view. This screen should already look
like a company has been operating here, not like an empty CRUD system.
```

Validation:

- Dashboard numbers must be derived from the seeded scenarios.
- No metric should be a disconnected fixture.
- For the current seed, verify whether totals are stable. If values change
  between resets, the demo is not presenter-ready.

### Segment 2 - Open Mariana Customer

Time: 1 minute

Show:

- customer profile;
- address;
- dependents when applicable;
- documents;
- wishes;
- proposals;
- sales;
- trips;
- receivables if the staff role is authorized.

Presenter line:

```text
This is the relationship hub. The agency should understand who Mariana is and
what has happened with her without opening six unrelated modules.
```

Validation:

- Customer 360 must not show raw technical IDs as primary business labels.
- Financial data should appear only to authorized staff.
- Mariana exists in the tenant seed, but the exact full financial story still
  needs deterministic linkage.

### Segment 3 - Show Wish

Time: 1 minute

Show:

- destination;
- preferred dates;
- traveler count;
- budget or notes;
- status.

Presenter line:

```text
The wish captures intent. It is not a sale yet, but it gives the commercial team
a concrete reason to search and propose.
```

Validation:

- Wish is linked to Mariana.
- Wish can be traced forward to offer/proposal or clearly explained as source
  context.
- Static seed review indicates Mariana is the first customer and Cancun is the
  first wish, so this part is likely aligned.

### Segment 4 - Show Pescador Capture

Time: 1-2 minutes

Show:

- external/mock source;
- normalized offer data;
- price found;
- review status;
- human approval action.

Presenter line:

```text
The Pescador helps the agency capture opportunities, but it does not publish or
sell external content without human review.
```

Validation:

- Pescador is not inside Finance.
- Captured content is treated as untrusted until reviewed.
- Static seed review found Cancun mock external capture, but it is not yet
  proven to be linked to Mariana's wish/proposal/sale.

### Segment 5 - Convert Or Connect To Offer

Time: 1 minute

Show:

- internal offer;
- price;
- validity;
- destination;
- relation to captured material where supported.

Presenter line:

```text
After review, the agency has an internal commercial offer that can be used in a
proposal.
```

Validation:

- Offer is the agency's internal source of truth for what it is selling.
- External capture remains provenance, not the commercial record itself.
- Static seed review found a Cancun offer, but the offer-to-Mariana-to-sale
  chain still needs deterministic proof.

### Segment 6 - Show Proposal

Time: 2 minutes

Show:

- customer;
- offer/wish context;
- proposed price;
- discount;
- total;
- validity;
- customer-facing preview.

Presenter line:

```text
The proposal is the customer-facing commercial promise. It should be clear,
priced, and connected to the customer's original intent.
```

Validation:

- The proposal should not expose supplier cost or margin.
- The total must be server-authoritative.
- Current tenant seed appears to create a BRL 9,000 Cancun proposal for Mariana,
  not BRL 18,000.

### Segment 7 - Show Booking

Time: 1-2 minutes

Show:

- travelers;
- dates;
- services;
- supplier confirmations;
- documents;
- operational status.

Presenter line:

```text
The booking is the operational commitment. It confirms what must be delivered
after the customer approves the proposal.
```

Validation:

- Booking is operational and does not act as the accounting source of truth.
- Supplier obligations should be traceable to Finance where supported.
- Current bookings are seeded by customer/departure, but not clearly connected
  to the main proposal-sale-finance story.

### Segment 8 - Show Sale

Time: 2 minutes

Show:

- gross sale;
- discount;
- total sale;
- customer;
- proposal;
- salesperson;
- status.

Presenter line:

```text
The sale is the commercial close. From here, Finance must know what should be
received, what must be paid, and what margin is expected.
```

Validation:

- Sale must link to customer and proposal.
- Sale must feed receivable/payment/margin records without duplication.
- Current tenant seed creates sales with random totals, so this segment is not
  rehearsal-safe for the requested BRL 18,000 story.

### Segment 9 - Open Finance Overview

Time: 2 minutes

Show:

- total sold;
- received;
- open receivables;
- supplier payables;
- projected cash;
- realized cash;
- expected margin.

Presenter line:

```text
Finance is not a bookkeeping afterthought here. It tells the agency whether the
business is healthy and whether the visible cash is already committed.
```

Validation:

- The dashboard must explain the Mariana sale without requiring the presenter
  to open every table manually.
- The agency finance dashboard has useful totals, but a sale-specific financial
  story view may still be needed.

### Segment 10 - Show Receivables / Installments

Time: 1-2 minutes

Show:

- BRL 6,000 paid;
- BRL 6,000 future installment;
- BRL 6,000 future installment;
- status;
- due dates;
- payment method if available.

Presenter line:

```text
This is where the agency controls what the customer still owes and what has
already entered cash.
```

Validation:

- If the current data model cannot show multiple receivable installments for
  one sale, mark this explicitly as a data model gap during the demo review.
- Static schema review found a unique `(agency_id, sale_id)` relationship on
  receivables, so three receivables for one sale require redesign or a different
  installment source of truth.

### Segment 11 - Show Payables / Supplier Exposure

Time: 1-2 minutes

Show:

- hotel payable;
- flight payable;
- transfer payable;
- insurance payable;
- due dates;
- status;
- supplier names.

Presenter line:

```text
The agency may have received money from the customer, but part of that cash is
already committed to suppliers.
```

Validation:

- Payables must be linked to sale, supplier, trip/booking, or operational cost.
- Current tenant seed creates standalone payables. They need sale/supplier/
  service linkage for this segment.

### Segment 12 - Show Margin

Time: 1 minute

Show:

- sale revenue;
- supplier costs;
- operational costs;
- commission/fees;
- gross margin;
- net margin.

Presenter line:

```text
This is the difference between selling a trip and understanding whether the trip
was profitable.
```

Validation:

- Margin must be calculated from connected records.
- The formula must be explicit.
- The margin endpoint exists, but the seed needs linked supplier costs,
  operational costs, and commission/fees for Mariana.

### Segment 13 - Show Cash Flow And Reconciliation

Time: 2 minutes

Show:

- current balance;
- projected 30/60/90 days;
- expected vs actual;
- difference;
- reconciled status.

Presenter line:

```text
Projected cash is what the agency expects. Reconciliation is how it proves what
actually happened.
```

Validation:

- Cash movement must not be a manually edited balance without audit trail.
- Current tenant seed creates manual/random cash transactions and random
  reconciliations. The main story needs payment-linked entries.

### Segment 14 - Customer Portal

Time: 2 minutes

Show from Mariana's perspective:

- trip;
- proposal;
- booking;
- travelers;
- documents;
- profile.

Presenter line:

```text
The customer sees the travel experience, not the agency's internal finance,
margin, supplier exposure, or staff notes.
```

Validation:

- No internal finance is visible.
- No tenant IDs, costs, margin, supplier exposure, or staff metadata are shown.
- This still requires runtime/browser verification.

## Supporting Stories

### Disney Family Trip

Use to demonstrate:

- family/dependent handling;
- passports/documents;
- higher-value proposal;
- booking with multiple travelers;
- future supplier obligations.

Seed note: Orlando/Disney offer exists, but assign it deterministically to a
family customer with dependents.

### Honeymoon

Use to demonstrate:

- high-touch commercial proposal;
- concierge-style services;
- margin per trip;
- customer-facing polished proposal.

Seed note: Paris romantic content exists. Name the story explicitly and link it
to sale, trip, payables, and margin.

### Domestic Trip

Use to demonstrate:

- simpler operation;
- domestic supplier;
- payable due this week;
- lower complexity sale.

Seed note: Maceio and Gramado exist. Pick one canonical domestic story and make
supplier/payable deadlines deterministic.

### Europe Trip

Use to demonstrate:

- long lead time;
- 30/60/90 day cash projection;
- multiple future receivables and payables;
- destination-based revenue reporting.

Seed note: Portugal and a Europe campaign exist. Add future obligations spread
across 30/60/90 days.

## Presenter Timing

| Segment | Time |
| --- | --- |
| Agency Dashboard | 2m |
| Customer 360 | 1m |
| Wish | 1m |
| Pescador / Offer | 2m |
| Proposal | 2m |
| Booking / Sale | 3m |
| Finance Overview | 2m |
| Receivables / Payables | 3m |
| Margin / Cash / Reconciliation | 3m |
| Customer Portal | 2m |

Target total: 18-21 minutes.

## Demo Acceptance Checklist

- [x] The repository has scripts for local demo reset/start.
- [x] The repository has meaningful seeded demo categories.
- [x] Mariana exists in seed data.
- [x] Cancun wish/offer/capture exists in seed data.
- [x] Mariana/Cancun exists as a complete linked BRL 18,000 story.
- [x] Three BRL 6,000 installments exist for the main sale.
- [x] BRL 6,000 paid is represented by payment and allocation records.
- [x] Supplier payables are linked to the main sale and named services.
- [ ] Cash movements are linked to payment/supplier events.
- [ ] Reconciliation is linked to the main payment story.
- [ ] At least four supporting stories exist as deterministic end-to-end flows.
- [ ] Finance dashboard explains the business without six table hops.
- [ ] Sale total, received amount, open amount, supplier costs, and margin are visible.
- [ ] Receivables/payables show business names, not raw IDs as main labels.
- [ ] Cash projection covers near-term obligations.
- [ ] Customer portal shows trip/proposal/booking but no internal finance.
- [ ] Reset/reseed works with stable, repeatable values.

## Known Gaps To Call Out If Still Present

- Current receivable model may not support multiple installments per sale.
- Finance pages may require too much navigation for one sale story.
- Product vision documentation contains unresolved merge conflicts.
- Some existing docs may contain text encoding issues.
- Runtime behavior still needs browser/API verification after this draft.

## Presenter-Safe Route Plan

Use `apps/agency` as the primary finance demo surface:

```text
/financial
/financial/receivables
/financial/payables
/financial/cash-transactions
/financial/reconciliation
/financial/reports
```

Use customer/staff commercial routes only where they show real business names.
Avoid relying on sale journey pages that currently display empty states or raw
technical IDs as the main business label.

## Next Checkpoint: 100%

## 100% Handoff

The implementation plan is available at:

`docs/superpowers/plans/2026-09-03-local-business-simulation.md`

Until that plan is implemented, use this script as the target demo flow rather
than a guaranteed click path. After implementation, update this script with the
exact Mariana / Cancun route, stable sale ID, and verified customer portal path.
