# Financial Foundation

Batch 02 adds the local financial foundation: `receivables`, `payables`,
`payments`, `payment_allocations`, and `operational_costs` in
`010_financial_foundation.sql`.

Implemented scope:

- Staff financial dashboard and Receivable listing.
- Tenant-scoped RLS and Prisma/domain type coverage.
- Sale-to-Receivable creation for positive-total Sales.
- Payment allocation data model used by Sale mark-paid validation.

Deferred scope:

- Payment provider integrations.
- Refund flows.
- Accounting ledger/general ledger.
- Automated reconciliation beyond the explicit PaymentAllocation records.
