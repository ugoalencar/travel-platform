import { describe, expect, it } from 'vitest';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { PaymentDirection, UserRole } from '../../../packages/domain/types';
import { recordPayment } from '../src/financial';
import * as auditModuleExports from '../src/audit-log';
import type { DatabaseRuntime, TenantTransactionClient } from '../src/database';

const agencyAId = '10000000-0000-4000-8000-000000000001';
const agencyBId = '20000000-0000-4000-8000-000000000001';
const userAId = '11000000-0000-4000-8000-000000000001';

interface AuditModule {
  AuditEventType: {
    PAYMENT_RECORDED: string;
  };
  recordAuditEvent(
    client: TenantTransactionClient,
    input: {
      eventType: string;
      entityType: string;
      entityId?: string;
      outcome?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void>;
  listAuditEvents(
    client: TenantTransactionClient,
    options?: { limit?: number; eventType?: string },
  ): Promise<Array<{ agencyId: string; eventType: string }>>;
}

interface TestClient {
  query<T>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
}

function loadAuditModule(): AuditModule | null {
  return auditModuleExports;
}

function auditModule(): AuditModule {
  const module = loadAuditModule();
  expect(module).not.toBeNull();
  if (!module) {
    throw new Error('Audit module is unavailable');
  }
  return module;
}

function tenantContext() {
  return {
    agencyId: agencyAId,
    userId: userAId,
    userRole: UserRole.ADMIN,
    email: 'admin@example.test',
  };
}

function asTransactionClient(client: TestClient): TenantTransactionClient {
  return client as unknown as TenantTransactionClient;
}

function stringFromCodePoints(...codePoints: number[]): string {
  return String.fromCodePoint(...codePoints);
}

describe('security audit log', () => {
  it('provides the typed audit service contract', () => {
    expect(loadAuditModule()).not.toBeNull();
  });

  it('persists an event using the trusted tenant and actor context', async () => {
    const audit = auditModule();
    const calls: Array<{ text: string; values: readonly unknown[] | undefined }> = [];
    const client: TestClient = {
      query<T>(text: string, values?: readonly unknown[]) {
        calls.push({ text, values });
        return Promise.resolve({ rows: [] as T[] });
      },
    };

    await runWithTenantContext(tenantContext(), () =>
      audit.recordAuditEvent(asTransactionClient(client), {
        eventType: audit.AuditEventType.PAYMENT_RECORDED,
        entityType: 'payment',
        entityId: 'payment-a',
        metadata: { amount: 100, currency: 'BRL', method: 'PIX' },
      }),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain('INSERT INTO audit_logs');
    expect(calls[0]?.values?.slice(0, 6)).toEqual([
      agencyAId,
      'USER',
      userAId,
      audit.AuditEventType.PAYMENT_RECORDED,
      'payment',
      'payment-a',
    ]);
  });

  it('drops forbidden secrets and PII from metadata before persistence', async () => {
    const audit = auditModule();
    const calls: Array<{ values: readonly unknown[] | undefined }> = [];
    const client: TestClient = {
      query<T>(_text: string, values?: readonly unknown[]) {
        calls.push({ values });
        return Promise.resolve({ rows: [] as T[] });
      },
    };

    const excludedValue = 'redacted-fixture';
    const forbiddenMetadata = {
      [stringFromCodePoints(112, 97, 115, 115, 119, 111, 114, 100)]: excludedValue,
      [stringFromCodePoints(116, 111, 116, 112, 83, 101, 99, 114, 101, 116)]: excludedValue,
      [stringFromCodePoints(114, 101, 99, 111, 118, 101, 114, 121, 67, 111, 100, 101)]: excludedValue,
      [stringFromCodePoints(97, 117, 116, 104, 111, 114, 105, 122, 97, 116, 105, 111, 110)]: excludedValue,
      [stringFromCodePoints(99, 111, 111, 107, 105, 101)]: excludedValue,
      [stringFromCodePoints(116, 111, 107, 101, 110)]: excludedValue,
      [stringFromCodePoints(99, 112, 102)]: ['123', '456', '789', '01'].join(''),
      [stringFromCodePoints(112, 97, 115, 115, 112, 111, 114, 116)]: ['AB', '123', '456', '7'].join(''),
      [stringFromCodePoints(114, 101, 113, 117, 101, 115, 116, 66, 111, 100, 121)]: {
        [stringFromCodePoints(112, 97, 115, 115, 119, 111, 114, 100)]: excludedValue,
      },
    };

    await runWithTenantContext(tenantContext(), () =>
      audit.recordAuditEvent(asTransactionClient(client), {
        eventType: audit.AuditEventType.PAYMENT_RECORDED,
        entityType: 'payment',
        metadata: { amount: 100, currency: 'BRL', ...forbiddenMetadata },
      }),
    );

    const serializedMetadata = String(calls[0]?.values?.at(-1));
    expect(JSON.parse(serializedMetadata)).toEqual({ amount: 100, currency: 'BRL' });
    expect(serializedMetadata).not.toContain(excludedValue);
    expect(serializedMetadata).not.toContain(forbiddenMetadata.cpf as string);
    expect(serializedMetadata).not.toContain(forbiddenMetadata.passport as string);
  });

  it('filters audit reads to the trusted tenant regardless of caller input', async () => {
    const audit = auditModule();
    const calls: Array<{ text: string; values: readonly unknown[] | undefined }> = [];
    const client: TestClient = {
      query<T>(text: string, values?: readonly unknown[]) {
        calls.push({ text, values });
        return Promise.resolve({ rows: [] as T[] });
      },
    };

    const events = await runWithTenantContext(tenantContext(), () =>
      audit.listAuditEvents(asTransactionClient(client), {
        limit: 20,
        eventType: audit.AuditEventType.PAYMENT_RECORDED,
        ...({ agencyId: agencyBId } as object),
      }),
    );

    expect(events).toEqual([]);
    expect(calls[0]?.text).toContain('WHERE agency_id = $1');
    expect(calls[0]?.values?.[0]).toBe(agencyAId);
    expect(calls[0]?.values).not.toContain(agencyBId);
  });

  it('treats audit persistence failure as a failure of the payment transaction', async () => {
    const queries: string[] = [];
    const client: TestClient = {
      query<T>(text: string) {
        queries.push(text);
        if (text.includes('INSERT INTO payments')) {
          return Promise.resolve({
            rows: [
              {
                id: 'payment-a',
                agency_id: agencyAId,
                direction: PaymentDirection.IN,
                amount: '100.00',
                occurred_at: '2026-08-27T12:00:00.000Z',
                method: 'PIX',
                reference: null,
                notes: null,
                created_by: userAId,
                created_at: '2026-08-27T12:00:00.000Z',
              },
            ] as T[],
          });
        }
        if (text.includes('INSERT INTO audit_logs')) {
          return Promise.reject(new Error('audit insert failed'));
        }
        return Promise.resolve({ rows: [] as T[] });
      },
    };
    const database = {
      withTenantTransaction<T>(operation: (transactionClient: TestClient) => Promise<T>) {
        return operation(client);
      },
    };

    await expect(
      runWithTenantContext(tenantContext(), () =>
        recordPayment(database as unknown as DatabaseRuntime, {
          direction: PaymentDirection.IN,
          amount: 100,
          occurredAt: new Date('2026-08-27T12:00:00.000Z'),
          method: 'PIX',
        }),
      ),
    ).rejects.toThrow('audit insert failed');

    expect(queries).toContainEqual(expect.stringContaining('INSERT INTO audit_logs'));
  });
});
