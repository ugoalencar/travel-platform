# AGENT 08 — PRODUCT INTEGRATOR

Inputs: only green Product streams from Agents 02–05.

Branch: `release/product-integration`

## Rule

Integrate one stream at a time. After EACH source stream run:
lint
typecheck
relevant tests
build

Never continue while red.

Resolve shared frontend/API conflicts manually. Do not use blanket ours/theirs on domain/security files.

## End-to-end product proof

Staff:
create customer
→ wish
→ trip
→ proposal
→ preview
→ booking
→ sale
→ financial reflects it
→ reports reflect it
→ dashboard reflects it
→ reload/restart → persisted

Customer:
own trip
→ own proposal
→ own booking
→ cross-customer denied

No production fixtures for these paths.

## Full gates

lint
typecheck
agency tests
customer tests
security
db
RLS/FORCE
tenant/customer isolation
migrations
secrets
build

## Exit

PRODUCT INTEGRATION HEAD
PRODUCT FLOW PASS
CUSTOMER FLOW PASS
REAL PERSISTENCE PASS
NO CORE MOCKS PASS
TYPECHECK PASS
BUILD PASS
P0 0
P1 0
READY FOR FINAL RC / BLOCKED
