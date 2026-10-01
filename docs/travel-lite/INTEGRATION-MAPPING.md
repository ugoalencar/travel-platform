# Travel Lite — Integration Mapping

Status: preparation only. No remote synchronization runs in this phase. This
document maps what the Lite stack already records for a future Integration
Gateway consumer and how Lite entities relate to the Travel Platform domain.

## Scope

- The Lite API (`services/api-lite`) enqueues every domain change into
  `integration_outbox` inside the same transaction as the business row
  (atomicity: a rolled-back change never leaves an orphan event).
- No worker, webhook, or outbound HTTP client exists yet. Delivery,
  retries, and idempotency are future work.
- The gateway consumer will read `integration_outbox` ordered by
  `created_at`, filter `status = 'PENDING'`, and mark rows `SENT`/`FAILED`.

## Integration fields

### `integration_outbox` (event envelope)

| Column | Purpose |
| --- | --- |
| `event_type` | Closed vocabulary enforced by a `CHECK` (see catalog below). |
| `entity_type` / `entity_id` | Lite entity that changed (UUID). |
| `payload` | Small JSONB hint (identifiers/human labels), not a full snapshot. |
| `status` | `PENDING` → `SENT` \| `FAILED` (delivery state, set by the future consumer). |
| `external_id` | ID assigned by the remote system once known. |
| `source_system` | Always `TRAVEL_LITE` (origin marker). |
| `sync_status` | `NOT_SYNCED` → `SYNCED` \| `FAILED` (business sync state). |
| `attempts` / `last_error` | Delivery bookkeeping for the future consumer. |

### Entity-level mirror fields

These tables carry the same triple, so entities can be resolved when the
remote system already knows an entity but the outbox row was lost:

`tenants`, `customers`, `sellers`, `sales`, `seller_commissions`,
`receivables`, `payables` — each has `external_id TEXT`,
`source_system TEXT NOT NULL DEFAULT 'TRAVEL_LITE'`,
`sync_status TEXT NOT NULL DEFAULT 'NOT_SYNCED'`
(`NOT_SYNCED` \| `SYNCED` \| `FAILED`).

UUIDs are the primary keys everywhere; they are stable cross-system keys.

## Event catalog

Emitted events, trigger, and payload. Payloads are deliberately small;
consumers load the current row by `entity_id` when they need more.

| Event | Trigger (route/action) | Entity | Payload |
| --- | --- | --- | --- |
| `CUSTOMER_CREATED` | `POST /customers` | `customer` | `{ name }` |
| `CUSTOMER_UPDATED` | `PATCH /customers/:id` | `customer` | `{ name }` |
| `CUSTOMER_UPDATED` | `DELETE /customers/:id` (soft) | `customer` | `{ status: 'INACTIVE' }` |
| `SELLER_CREATED` | `POST /sellers` | `seller` | `{ name }` |
| `SELLER_UPDATED` | `PATCH /sellers/:id` | `seller` | `{ name }` |
| `SELLER_UPDATED` | `DELETE /sellers/:id` (soft) | `seller` | `{ status: 'INACTIVE' }` |
| `SALE_CATEGORY_CREATED` | `POST /categories` | `sale_category` | `{ name, sort_order }` |
| `SALE_CATEGORY_UPDATED` | `PATCH /categories/:id` | `sale_category` | `{ name, active, sort_order }` |
| `SALE_CATEGORY_DELETED` | `DELETE /categories/:id` | `sale_category` | `{}` |
| `SALE_CREATED` | `POST /sales` (DRAFT) | `sale` | `{ sale_number }` |
| `SALE_UPDATED` | `PATCH /sales/:id` (DRAFT only) | `sale` | `{ sale_number }` |
| `SALE_CONFIRMED` | `POST /sales/:id/confirm` | `sale` | `{ sale_number }` |
| `SALE_CANCELLED` | `POST /sales/:id/cancel` | `sale` | `{ sale_number }` |
| `RECEIVABLE_CREATED` | confirm (per installment) | `receivable` | `{ sale_number, installment_number }` |
| `COMMISSION_CREATED` | confirm (rule path) | `seller_commission` | `{ sale_number, amount }` |
| `COMMISSION_CREATED` | confirm (no rule) | `seller_commission` | `{ sale_number, pending_rule: true }` |
| `COMMISSION_UPDATED` | `PATCH /commissions/:id` (override) | `seller_commission` | `{ commission_amount, manual: true }` |
| `COMMISSION_UPDATED` | `PATCH /sellers/:id` (rule resolves `PENDING_RULE`) | `seller_commission` | `{ commission_amount, recalculated: true }` |
| `COMMISSION_PAID` | `POST /payables/:id/pay` (linked payable) | `seller_commission` | `{ amount }` |
| `PAYMENT_RECEIVED` | `POST /receivables/:id/receive` | `receivable` | `{ amount, status }` |
| `PAYABLE_CREATED` | `POST /payables` | `payable` | `{ amount, description }` |
| `PAYABLE_CREATED` | `POST /commissions/:id/approve` | `payable` | `{ commission_id, amount }` |
| `EXPENSE_PAID` | `POST /payables/:id/pay` | `payable` | `{ amount }` |
| `PAYMENT_REVERSED` | `POST /payments/:id/reverse` | `payment` (original) | `{ reversal_payment_id, amount, target_type, target_id }` |
| `ACCOUNT_CREATED` | `POST /financial-accounts` | `account` | `{ name }` |
| `ACCOUNT_UPDATED` | `PATCH /financial-accounts/:id` | `account` | `{}` |
| `FINANCIAL_CATEGORY_CREATED` | `POST /financial-categories` | `category` | `{ name }` |
| `FINANCIAL_CATEGORY_UPDATED` | `PATCH /financial-categories/:id` | `category` | `{}` |
| `PAYMENT_METHOD_CREATED` | `POST /payment-methods` | `paymentMethod` | `{ name }` |
| `PAYMENT_METHOD_UPDATED` | `PATCH /payment-methods/:id` | `paymentMethod` | `{}` |

The vocabulary is defined twice on purpose (defense in depth):

- Database: `CHECK (event_type IN (...))` in `001_initial_schema.sql`.
- Code: `OUTBOX_EVENT_TYPES` in `services/api-lite/src/outbox.ts`.

Both lists must stay identical; tests cover the main emit paths.

## Entity mapping (Lite → platform domain)

| Lite entity | Notes for the remote/platform side |
| --- | --- |
| `tenants` | One Lite tenant = one agency/company. Slug is the login key. |
| `users` | Lite roles (`MASTER`/`ADMIN`/`MANAGER`/`SELLER`/`VIEWER`) and permission overrides are local (see ACCESS-CONTROL.md); no platform user sync. |
| `customers` | Soft delete only (`INACTIVE`); CPF normalized to digits, validated. |
| `sellers` | `user_id` links an optional Lite user; commission rule is denormalized on the row. |
| `sales` | Sequential per-tenant `sale_number` (`VENDA-000001`); status flow `DRAFT → CONFIRMED → PARTIALLY_PAID → PAID` or `CANCELLED`. |
| `receivables` | Installments generated at confirm; never edited afterwards except payment status. |
| `seller_commissions` | Snapshot of the rule at confirm time; `PENDING_RULE` means no value yet (never `0`). |
| `payables` | Both expenses and commission obligations (via `commission_id`). |
| `payments` + `payment_allocations` + `financial_transactions` | One payment allocates to exactly one receivable/payable; the ledger row is immutable. |

## Delivery contract (future)

1. Consumer claims `PENDING` rows with `FOR UPDATE SKIP LOCKED`.
2. Idempotency key: outbox `id` (UUID) — the remote must treat repeats as no-ops.
3. Success: `status = 'SENT'`, `sync_status = 'SYNCED'`, `external_id` filled.
4. Failure: `attempts += 1`, `last_error` set, `sync_status = 'FAILED'`;
   after N attempts keep `status = 'FAILED'` for manual replay.
5. Never enqueue events outside a tenant transaction, never emit payload
   secrets (tokens/passwords are never part of payloads).

## Related sources

- Schema: `infrastructure/migrations-travel-lite/001_initial_schema.sql`
- Enqueue helper: `services/api-lite/src/outbox.ts`
- Audit trail (separate from outbox): `services/api-lite/src/audit-log.ts`
