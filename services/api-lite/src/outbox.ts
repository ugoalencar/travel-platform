/**
 * Integration outbox — Travel Platform Integration Gateway preparation.
 * Events are enqueued in the SAME transaction as the domain change
 * (atomicity: rollback of the business row also removes the event).
 * No remote sync in this phase; the worker/consumer comes later.
 */
import type { TenantClient } from './database';
import { getTenantId } from './tenant-context';

export const OUTBOX_EVENT_TYPES = [
  'CUSTOMER_CREATED',
  'CUSTOMER_UPDATED',
  'SELLER_CREATED',
  'SELLER_UPDATED',
  'SALE_CATEGORY_CREATED',
  'SALE_CATEGORY_UPDATED',
  'SALE_CATEGORY_DELETED',
  'SALE_CREATED',
  'SALE_UPDATED',
  'SALE_CONFIRMED',
  'SALE_CANCELLED',
  'COMMISSION_CREATED',
  'COMMISSION_UPDATED',
  'COMMISSION_PAID',
  'RECEIVABLE_CREATED',
  'PAYMENT_RECEIVED',
  'PAYMENT_REVERSED',
  'PAYABLE_CREATED',
  'EXPENSE_PAID',
  'ACCOUNT_CREATED',
  'ACCOUNT_UPDATED',
  'FINANCIAL_CATEGORY_CREATED',
  'FINANCIAL_CATEGORY_UPDATED',
  'PAYMENT_METHOD_CREATED',
  'PAYMENT_METHOD_UPDATED',
] as const;

export type OutboxEventType = (typeof OUTBOX_EVENT_TYPES)[number];

export interface OutboxEventInput {
  eventType: OutboxEventType;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
}

export async function enqueueOutboxEvent(client: TenantClient, input: OutboxEventInput): Promise<void> {
  const tenantId = getTenantId();
  await client.query(
    `INSERT INTO integration_outbox (tenant_id, event_type, entity_type, entity_id, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [tenantId, input.eventType, input.entityType, input.entityId, JSON.stringify(input.payload ?? {})],
  );
}
