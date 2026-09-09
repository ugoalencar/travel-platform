### Task 1: Record Installment Source Of Truth

**Files:**
- Create: `docs/decisions/D5-FINANCIAL-INSTALLMENTS-DEMO-DECISION.md`
- Modify: `docs/product/PRODUCT_GAP_ANALYSIS.md`

**Interfaces:**
- Consumes: current schema where `receivables` has `UNIQUE(agency_id, sale_id)`.
- Produces: explicit decision for whether demo installments use `revenues` or require receivable schema redesign.

- [ ] **Step 1: Create the decision document**

Create `docs/decisions/D5-FINANCIAL-INSTALLMENTS-DEMO-DECISION.md` with this content:

```markdown
# D5: Financial Installments For Local Business Simulation

Status: Accepted for local demo planning
Date: 2026-09-03

## Context

The local business simulation requires one sale of BRL 18,000 to be shown as
three customer installments of BRL 6,000 each.

The current `receivables` table has a unique `(agency_id, sale_id)` constraint,
which prevents multiple receivable rows for the same sale.

## Decision

For the first deterministic local demo, use `revenues` as the installment
schedule and keep `receivables` as the sale-level open obligation.

The demo must label this clearly:

- Sale total: source of truth is `sales.total`.
- Installment schedule: source of truth is `revenues` linked to `sale_id`.
- Payment received: source of truth is `payments` plus `payment_allocations`.
- Open receivable summary: source of truth is `receivables`.

## Consequences

This avoids a migration during demo stabilization.

The product still needs a future financial modeling decision if `receivables`
should become installment-level instead of sale-level.

No customer portal page may expose this internal distinction.
```

- [ ] **Step 2: Update gap analysis**

In `docs/product/PRODUCT_GAP_ANALYSIS.md`, change the installment recommendation to say the first implementation uses `revenues` for demo installments and keeps receivable schema unchanged.

- [ ] **Step 3: Verify docs**

Run:

```powershell
rg -n "T[B]D|T[O]DO|<{7}|={7}|>{7}" docs\decisions\D5-FINANCIAL-INSTALLMENTS-DEMO-DECISION.md docs\product\PRODUCT_GAP_ANALYSIS.md
```

Expected: no matches, exit code 1.


