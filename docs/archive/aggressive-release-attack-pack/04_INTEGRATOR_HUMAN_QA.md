# STREAM 04 — PRODUCT COMPLETION INTEGRATOR + HUMAN QA

## Inputs
1. Customer 360/Documents/OCR-ready
2. Offers & Marketing editable
3. Financial complete

## Branch
Create:
`release/product-completion-final`

Integrate one stream at a time.

After each:
lint
typecheck
relevant tests
security
build

Do not continue from red.

## Migration policy
All schema changes additive.
Do not rewrite migrations historicalmente aplicadas.

## Human-like QA

### Customer
Create customer
→ address
→ dependent
→ passport metadata
→ upload test image
→ reload
→ verify persisted
→ verify masking/security
→ verify customer portal self-scope

### Offers/Marketing
Create offer
→ edit
→ duplicate
→ template
→ creative
→ campaign
→ publication draft
→ coupon
→ reload
→ verify persistence

### Financial
Create sale-linked revenue
→ create expense
→ accounts receivable/payable
→ mark partial/paid where supported
→ dashboard updates
→ reports reconcile
→ verify Pescador outside Finance navigation

### Cross-module
Pescador capture
→ review
→ create Offer
→ use Offer in Campaign
→ generate Proposal/Booking/Sale
→ financial records

## UX defects
P0/P1 fix immediately.
P2 fix if localized/low risk.
P3 document for visual-polish phase.

## Full gates
lint
typecheck
unit
API
agency
customer
security
database
migrations
build
production build

## Final report
FINAL HEAD
CUSTOMER 360 PASS
DOCUMENTS PASS
OCR-READY PASS
OFFERS PASS
MARKETING PASS
FINANCIAL DASHBOARD PASS
RECEIVABLES/PAYABLES PASS
REPORTS PASS
PESCADOR SEPARATION PASS
CROSS-MODULE FLOW PASS
P0 0
P1 0
FINAL VERDICT = READY FOR FINAL VISUAL POLISH
