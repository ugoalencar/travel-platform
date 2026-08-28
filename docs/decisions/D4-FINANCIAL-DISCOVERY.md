# D4: Financial Model — Discovery Pack

**Status:** Discovery only. No decision made here, no schema/migration
written. Purpose is to lay out the real current state and possible
architectures so a future decision has grounded options.

---

## 1. Real current state (verified against `origin/main`)

### Sale (`packages/database/schema.prisma`, model `Sale`)
Fields: `agencyId`, `customerId`, `proposalId` (nullable), `brokerId`
(nullable), `userId`, `amount` (Decimal 10,2), `discount` (Decimal 10,2,
default 0), `total` (Decimal 10,2), `status` (enum `SaleStatus`: PENDING,
CONFIRMED, PAID, CANCELLED, REFUNDED), `notes`, `paidAt` (nullable
timestamp). The `SaleStatus` enum and `Sale` table are present in the
merged schema on `origin/main`; the API vertical implementing CRUD lives
only on the open PR #13 (`feature/sale-vertical`,
`services/api/src/sales.ts`, 283 lines, not merged).

**Unmanaged/read-only in practice:** nothing in the codebase (merged or on
the open PR, as read in this pass) transitions `status` as a side effect of
any event, and nothing sets `paidAt` except a direct field write. There is
no payment record, no partial-payment concept, no idempotency guard around
marking something PAID.

### Supplier (`schema.prisma`, model `Supplier`)
Fields: `agencyId`, `name`, `document`, `contact`, `active`. No cost,
pricing, or payment-terms fields of any kind.

### TransportOperation (`schema.prisma`, model `TransportOperation`)
Fields: `agencyId`, `departureId`, timestamps. Purely an execution marker
("this ScheduledDeparture is now being operated") — no cost fields.

### Commission (`schema.prisma`, model `Commission`)
Fields: `agencyId`, `saleId`, `brokerId` (nullable), `userId` (nullable),
`amount` (Decimal 12,2), `percentage` (Decimal 5,2, nullable), `status`
(enum: PENDING, PAID, CANCELLED), `paidAt`. `UNIQUE(agencyId, id)` added by
PR #12 (merged) so it can be the target of a future composite FK. No
`services/api/src/commissions.ts` exists — no calculation logic, no API.

### Booking / Trip
`Booking` deliberately carries no pricing fields (ADR-004) — it is the
operational reservation layer, separate from `Sale`. `Trip` carries no
financial fields either; it links to `Sale` via optional `saleId`.

### What does NOT exist
No `Payment`, `Invoice`, `Receivable`, `Payable`, `LedgerEntry`, or
`CostEntry` table anywhere in `packages/database/schema.prisma` or
`infrastructure/migrations/`. No financial ADR exists prior to this
discovery pack.

---

## 2. Concepts to eventually architect (not decided here)

### Receivables (money owed by Customer to Agency)
- Option A: derive entirely from `Sale.total` minus a sum of `Payment` rows
  (new table), no separate receivable ledger.
- Option B: explicit `Receivable` row created per `Sale`, tracked
  independently of payments (supports partial write-offs, disputes).
- Consideration: `Sale.status` PAID currently means "fully settled" by
  convention only — nothing enforces that the sum of payments equals
  `total` before allowing PAID.

### Payables (money owed by Agency to Supplier)
- No existing hook point. Would likely need a new `Payable` or
  `SupplierInvoice` table linked to `Supplier` and optionally
  `TransportOperation`/`ScheduledDeparture` for operational cost
  attribution.

### Payments (money movement events)
- Option A: a single `Payment` table with a polymorphic-ish `direction`
  (inbound from Customer / outbound to Supplier / outbound as Commission
  settlement) and a nullable FK to `Sale`/`Payable`/`Commission`.
- Option B: three separate tables (`CustomerPayment`, `SupplierPayment`,
  `CommissionPayout`) — more explicit constraints, less flexible for shared
  reporting (e.g. one "cash flow" view would need a union).
- Either option needs to decide how `Sale.paidAt`/`Sale.status` relate to
  the payment ledger — currently they're a single mutable snapshot with no
  history.

### Operational costs (what it costs the Agency to run a ScheduledDeparture)
- No cost field exists on `ScheduledDeparture`, `TransportOperation`, or
  `Supplier` today. A cost model would need to decide whether cost is
  fixed-per-departure, fixed-per-Supplier-contract, or computed.

### Partial payments
- Requires a `Payment`-like table (see above) rather than the current
  single `paidAt` timestamp, which can only express "fully paid at this
  instant" or "not paid."

### Cash flow
- Would be a derived/reporting view over whatever payment ledger is chosen
  — not a new source-of-truth table by itself.

### Margin (Sale revenue vs operational cost)
- Requires both a settled `Sale.total` (or sum of receivable payments) and
  an operational cost figure per Trip/Booking/TransportOperation — neither
  side is fully modeled yet (cost side doesn't exist at all).

### Commission settlement
- `Commission.amount`/`percentage`/`status` exist but nothing computes
  `amount` from `Sale.total` and a broker's commission rate
  (`Broker.commission` field does exist in schema, Decimal 5,2, default 0 —
  see `schema.prisma` model `Broker`). Settlement (marking PAID, recording
  when/how a broker was paid) has no code path — would plug into the same
  Payment/payout table discussed above.

---

## 3. Cross-cutting open questions (for whoever picks this up)

1. Is `Sale.status`/`paidAt` kept as a denormalized snapshot updated by
   triggers/application logic reacting to a payment ledger, or replaced
   entirely once a ledger exists?
2. Does Commission settlement require Sale to reach PAID first, or can
   commission be computed/paid independently of collection status?
3. Should operational cost live on `Supplier` (contract-level) or on each
   `ScheduledDeparture`/`TransportOperation` (instance-level), or both?
4. Multi-tenancy: any new financial table needs `agencyId` as first FK
   column and composite `(agencyId, id)` uniqueness to match every existing
   table's pattern (ADR-002, ADR-005) — not a decision point, just a
   constraint any option must satisfy.

---

## 4. What this pack does NOT do

- Does not propose a schema.
- Does not propose a migration.
- Does not pick an option among those listed.
- Does not estimate scope/timeline.

## References
- `packages/database/schema.prisma` (Sale, Supplier, TransportOperation,
  Commission, Broker, Booking, Trip models)
- `docs/adr/ADR-004-domain-modeling-wish-customer-sale-booking.md`
- `docs/adr/ARCHITECTURAL-FINDINGS-REGISTRY.md` (D4 entry)
- PR #12 (`feature/commission-repair`, merged) — Commission structural repair
- PR #13 (`feature/sale-vertical`, open) — Sale API vertical
