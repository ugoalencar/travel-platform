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
