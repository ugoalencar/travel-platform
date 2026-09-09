import { describe, expect, it } from 'vitest';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { DocumentAuditEventType, UserRole } from '../../../packages/domain/types';
import {
  getAuditLog,
  getDocumentAuditLog,
  recordDocumentAuditEvent,
} from '../src/document-audit';
import type { TenantTransactionClient } from '../src/database';
import {
  AGENCY_A,
  AGENCY_B,
  auditEventRow,
  CONTEXT_A,
  CONTEXT_B,
  createFakeDatabase,
  CUSTOMER_A,
  USER_A,
} from './helpers/fake-database';

/** Capture what `recordDocumentAuditEvent` emits without a full runtime. */
function captureClient(): {
  client: TenantTransactionClient;
  calls: { text: string; values: unknown[] }[];
} {
  const calls: { text: string; values: unknown[] }[] = [];
  const client = {
    query: (text: string, values?: readonly unknown[]) => {
      calls.push({ text, values: values ? [...values] : [] });
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  } as unknown as TenantTransactionClient;

  return { client, calls };
}

describe('recordDocumentAuditEvent', () => {
  it('inserts -- never updates or deletes -- into the audit table', async () => {
    const { client, calls } = captureClient();

    await runWithTenantContext(CONTEXT_A, () =>
      recordDocumentAuditEvent(client, DocumentAuditEventType.DOCUMENT_CREATED, {
        documentId: 'doc-1',
      }),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain('INSERT INTO document_audit_events');
    expect(calls[0]?.text).not.toMatch(/UPDATE|DELETE/);
  });

  it('stamps the ambient agency and acting user', async () => {
    const { client, calls } = captureClient();

    await runWithTenantContext(CONTEXT_A, () =>
      recordDocumentAuditEvent(client, DocumentAuditEventType.DOCUMENT_VIEWED, {
        documentId: 'doc-1',
      }),
    );

    expect(calls[0]?.values[0]).toBe(AGENCY_A);
    expect(calls[0]?.values).toContain(USER_A);
    expect(calls[0]?.values).not.toContain(AGENCY_B);
  });

  it('lets a system-initiated event override the acting user', async () => {
    const { client, calls } = captureClient();

    await runWithTenantContext(CONTEXT_A, () =>
      recordDocumentAuditEvent(client, DocumentAuditEventType.EXTRACTION_COMPLETED, {
        userId: 'system-worker',
      }),
    );

    expect(calls[0]?.values).toContain('system-worker');
    expect(calls[0]?.values).not.toContain(USER_A);
  });

  it('never writes a synthetic customer-portal principal into the user column', async () => {
    const { client, calls } = captureClient();
    const portalContext = {
      agencyId: AGENCY_A,
      userId: `customer-context:${CUSTOMER_A}`,
      userRole: UserRole.VIEWER,
      email: 'portal@example.test',
    };

    await runWithTenantContext(portalContext, () =>
      recordDocumentAuditEvent(client, DocumentAuditEventType.DOCUMENT_VIEWED, {
        documentId: 'doc-1',
      }),
    );

    expect(JSON.stringify(calls[0]?.values)).not.toContain('customer-context:');
    expect(calls[0]?.values[3]).toBeNull();
  });

  it.each(Object.values(DocumentAuditEventType))('records a %s event', async (eventType) => {
    const { client, calls } = captureClient();

    await runWithTenantContext(CONTEXT_A, () =>
      recordDocumentAuditEvent(client, eventType, { documentId: 'doc-1' }),
    );

    expect(calls[0]?.values).toContain(eventType);
  });

  it('serialises metadata as JSON and leaves non-sensitive keys intact', async () => {
    const { client, calls } = captureClient();

    await runWithTenantContext(CONTEXT_A, () =>
      recordDocumentAuditEvent(client, DocumentAuditEventType.DOCUMENT_CREATED, {
        documentId: 'doc-1',
        metadata: { documentType: 'RG', attempt: 2 },
      }),
    );

    const metadata = calls[0]?.values[6];
    expect(typeof metadata).toBe('string');
    expect(JSON.parse(metadata as string)).toEqual({ documentType: 'RG', attempt: 2 });
  });

  it('masks PII that a caller passed in metadata by mistake', async () => {
    const { client, calls } = captureClient();

    await runWithTenantContext(CONTEXT_A, () =>
      recordDocumentAuditEvent(client, DocumentAuditEventType.DOCUMENT_CREATED, {
        documentId: 'doc-1',
        metadata: { documentNumber: 'AB123456789', cpf: '123.456.789-09' },
      }),
    );

    const serialized = JSON.stringify(calls[0]?.values);
    expect(serialized).not.toContain('AB123456789');
    expect(serialized).not.toContain('456.789-09');
    expect(serialized).toContain('AB123456***');
    expect(serialized).toContain('123.***.***-**');
  });

  it('writes a null metadata column when no metadata was supplied', async () => {
    const { client, calls } = captureClient();

    await runWithTenantContext(CONTEXT_A, () =>
      recordDocumentAuditEvent(client, DocumentAuditEventType.DOCUMENT_VIEWED, {
        documentId: 'doc-1',
      }),
    );

    expect(calls[0]?.values[6]).toBeNull();
  });

  it('fails closed with no tenant context', async () => {
    const { client } = captureClient();

    await expect(
      recordDocumentAuditEvent(client, DocumentAuditEventType.DOCUMENT_VIEWED, {}),
    ).rejects.toThrow();
  });
});

describe('audit log retrieval', () => {
  it('fails closed with no tenant context', async () => {
    const database = createFakeDatabase();

    await expect(getAuditLog(database, CUSTOMER_A)).rejects.toThrow();
    await expect(getDocumentAuditLog(database, 'doc-1')).rejects.toThrow();
  });

  it('returns a customer trail newest first, scoped to the tenant', async () => {
    const database = createFakeDatabase(() => [auditEventRow()]);

    const events = await runWithTenantContext(CONTEXT_A, () =>
      getAuditLog(database, CUSTOMER_A),
    );

    const query = database.findOne('document_audit_events');
    expect(query.text).toContain('customer_id = $2');
    expect(query.text).toContain('ORDER BY created_at DESC');
    expect(query.values[0]).toBe(AGENCY_A);
    expect(events[0]?.createdAt).toBeInstanceOf(Date);
  });

  it('returns a document trail newest first, scoped to the tenant', async () => {
    const database = createFakeDatabase(() => [auditEventRow()]);

    await runWithTenantContext(CONTEXT_A, () => getDocumentAuditLog(database, 'doc-1'));

    const query = database.findOne('document_audit_events');
    expect(query.text).toContain('document_id = $2');
    expect(query.text).toContain('ORDER BY created_at DESC');
  });

  it('cannot read another tenant trail', async () => {
    const database = createFakeDatabase(() => []);

    const events = await runWithTenantContext(CONTEXT_B, () =>
      getAuditLog(database, CUSTOMER_A),
    );

    expect(events).toEqual([]);
    expect(database.findOne('document_audit_events').values[0]).toBe(AGENCY_B);
  });

  it('maps rows onto camelCase events, omitting unset optional columns', async () => {
    const database = createFakeDatabase(() => [
      auditEventRow({ attachment_id: null, metadata: { provider: 'mock' } }),
    ]);

    const events = await runWithTenantContext(CONTEXT_A, () =>
      getDocumentAuditLog(database, 'doc-1'),
    );

    expect(events[0]).toMatchObject({
      id: 'evt-1',
      agencyId: AGENCY_A,
      documentId: 'doc-1',
      userId: USER_A,
      eventType: DocumentAuditEventType.DOCUMENT_CREATED,
      metadata: { provider: 'mock' },
    });
    expect(events[0]).not.toHaveProperty('attachmentId');
  });

  it('applies a default limit and clamps an absurd one', async () => {
    const defaultDb = createFakeDatabase(() => []);
    await runWithTenantContext(CONTEXT_A, () => getAuditLog(defaultDb, CUSTOMER_A));
    expect(defaultDb.findOne('document_audit_events').values[2]).toBe(200);

    const clampedDb = createFakeDatabase(() => []);
    await runWithTenantContext(CONTEXT_A, () => getAuditLog(clampedDb, CUSTOMER_A, 999_999));
    expect(clampedDb.findOne('document_audit_events').values[2]).toBe(1000);
  });

  it('falls back to the default limit for nonsensical input', async () => {
    const database = createFakeDatabase(() => []);

    await runWithTenantContext(CONTEXT_A, () => getDocumentAuditLog(database, 'doc-1', -5));

    expect(database.findOne('document_audit_events').values[2]).toBe(200);
  });

  it('exposes no update or delete helper for the trail', async () => {
    const auditModule: Record<string, unknown> = await import('../src/document-audit');

    for (const exported of Object.keys(auditModule)) {
      expect(exported).not.toMatch(/^(update|delete|purge|clear)/i);
    }
  });
});
