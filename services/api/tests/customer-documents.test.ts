import { describe, expect, it } from 'vitest';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { DocumentType, DocumentVerificationStatus } from '../../../packages/domain/types';
import {
  createDocument,
  deleteDocument,
  getDocumentById,
  listDocuments,
  updateDocument,
} from '../src/customer-documents';
import { ValidationError } from '../src/errors';
import {
  AGENCY_A,
  AGENCY_B,
  CONTEXT_A,
  CONTEXT_B,
  CUSTOMER_A,
  createFakeDatabase,
  documentRow,
} from './helpers/fake-database';

const validInput = {
  customerId: CUSTOMER_A,
  documentType: DocumentType.PASSAPORTE,
  documentNumber: 'AB123456789',
};

describe('customer documents -- tenant scoping', () => {
  it('fails closed when no tenant context is established', async () => {
    const database = createFakeDatabase();

    await expect(listDocuments(database, CUSTOMER_A)).rejects.toThrow();
    await expect(getDocumentById(database, 'doc-1')).rejects.toThrow();
    await expect(createDocument(database, validInput)).rejects.toThrow();
    await expect(updateDocument(database, 'doc-1', { notes: 'x' })).rejects.toThrow();
    await expect(deleteDocument(database, 'doc-1')).rejects.toThrow();
    expect(database.queries).toHaveLength(0);
  });

  it('binds the caller own agency id on every statement', async () => {
    const database = createFakeDatabase(() => [documentRow()]);

    await runWithTenantContext(CONTEXT_A, async () => {
      await listDocuments(database, CUSTOMER_A);
      await getDocumentById(database, 'doc-1');
      await createDocument(database, validInput);
      await updateDocument(database, 'doc-1', { notes: 'x' });
      await deleteDocument(database, 'doc-1');
    });

    for (const query of database.find('customer_documents')) {
      expect(query.values[0]).toBe(AGENCY_A);
      expect(query.values).not.toContain(AGENCY_B);
    }
  });

  it('cannot read another tenant documents', async () => {
    const database = createFakeDatabase(() => []);

    const documents = await runWithTenantContext(CONTEXT_B, () =>
      listDocuments(database, CUSTOMER_A),
    );

    expect(documents).toEqual([]);
    expect(database.findOne('customer_documents').values[0]).toBe(AGENCY_B);
  });
});

describe('customer documents -- CRUD across document types', () => {
  it.each(Object.values(DocumentType))('creates a %s document', async (documentType) => {
    const database = createFakeDatabase(() => [documentRow({ document_type: documentType })]);

    const document = await runWithTenantContext(CONTEXT_A, () =>
      createDocument(database, { ...validInput, documentType }),
    );

    expect(document.documentType).toBe(documentType);
  });

  it('never writes the generated is_expired column', async () => {
    const database = createFakeDatabase(() => [documentRow()]);

    await runWithTenantContext(CONTEXT_A, () => createDocument(database, validInput));

    const insert = database.findOne('INSERT INTO customer_documents');
    const columnList = insert.text.slice(0, insert.text.indexOf('VALUES'));
    expect(columnList).not.toContain('is_expired');
    // It is still read back, since Postgres computes it.
    expect(insert.text.slice(insert.text.indexOf('RETURNING'))).toContain('is_expired');
  });

  it('reads expiry state from the database rather than recomputing it', async () => {
    const database = createFakeDatabase(() => [
      documentRow({ expiry_date: '2020-01-01', is_expired: true }),
    ]);

    const document = await runWithTenantContext(CONTEXT_A, () =>
      getDocumentById(database, 'doc-1'),
    );

    expect(document?.isExpired).toBe(true);
    expect(document?.expiryDate).toBeInstanceOf(Date);
  });

  it('reports a future-dated document as not expired', async () => {
    const database = createFakeDatabase(() => [
      documentRow({ expiry_date: '2099-01-01', is_expired: false }),
    ]);

    const document = await runWithTenantContext(CONTEXT_A, () =>
      getDocumentById(database, 'doc-1'),
    );

    expect(document?.isExpired).toBe(false);
  });

  it('returns null for a document outside this tenant', async () => {
    const database = createFakeDatabase(() => []);

    await expect(
      runWithTenantContext(CONTEXT_A, () => getDocumentById(database, 'doc-other')),
    ).resolves.toBeNull();
  });

  it('lists only non-deleted documents', async () => {
    const database = createFakeDatabase(() => [documentRow()]);

    await runWithTenantContext(CONTEXT_A, () => listDocuments(database, CUSTOMER_A));

    expect(database.findOne('SELECT').text).toContain('deleted_at IS NULL');
  });
});

describe('customer documents -- verification status workflow', () => {
  it.each(Object.values(DocumentVerificationStatus))(
    'accepts a transition to %s',
    async (verificationStatus) => {
      const database = createFakeDatabase(() => [
        documentRow({ verification_status: verificationStatus }),
      ]);

      const document = await runWithTenantContext(CONTEXT_A, () =>
        updateDocument(database, 'doc-1', { verificationStatus }),
      );

      expect(document?.verificationStatus).toBe(verificationStatus);
      expect(database.findOne('UPDATE customer_documents').values).toContain(verificationStatus);
    },
  );

  it('stamps verified_at only on a transition to VERIFIED', async () => {
    const database = createFakeDatabase(() => [documentRow()]);

    await runWithTenantContext(CONTEXT_A, () =>
      updateDocument(database, 'doc-1', {
        verificationStatus: DocumentVerificationStatus.VERIFIED,
      }),
    );

    const update = database.findOne('UPDATE customer_documents');
    expect(update.text).toContain("'VERIFIED'");
    expect(update.text).toContain('verified_at =');
  });

  it('rejects an unknown verification status', async () => {
    const database = createFakeDatabase(() => [documentRow()]);

    await expect(
      runWithTenantContext(CONTEXT_A, () =>
        updateDocument(database, 'doc-1', {
          verificationStatus: 'APPROVED' as DocumentVerificationStatus,
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('customer documents -- soft delete', () => {
  it('stamps deleted_at rather than removing the row', async () => {
    const database = createFakeDatabase(() => [documentRow({ deleted_at: '2026-08-29' })]);

    const document = await runWithTenantContext(CONTEXT_A, () =>
      deleteDocument(database, 'doc-1'),
    );

    expect(database.find('DELETE FROM')).toHaveLength(0);
    expect(document?.deletedAt).toBeInstanceOf(Date);
  });

  it('returns null when the document was already deleted', async () => {
    const database = createFakeDatabase(() => []);

    await expect(
      runWithTenantContext(CONTEXT_A, () => deleteDocument(database, 'doc-1')),
    ).resolves.toBeNull();
  });
});

describe('customer documents -- validation', () => {
  it('rejects a blank document number', async () => {
    const database = createFakeDatabase();

    await expect(
      runWithTenantContext(CONTEXT_A, () =>
        createDocument(database, { ...validInput, documentNumber: '   ' }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(database.queries).toHaveLength(0);
  });

  it('rejects an unknown document type', async () => {
    const database = createFakeDatabase();

    await expect(
      runWithTenantContext(CONTEXT_A, () =>
        createDocument(database, { ...validInput, documentType: 'DRIVER' as DocumentType }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects blanking the document number through update', async () => {
    const database = createFakeDatabase(() => [documentRow()]);

    await expect(
      runWithTenantContext(CONTEXT_A, () =>
        updateDocument(database, 'doc-1', { documentNumber: '' }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('customer documents -- audit trail and masking', () => {
  it('records both audit trails on create with a masked document number', async () => {
    const database = createFakeDatabase(() => [documentRow()]);

    await runWithTenantContext(CONTEXT_A, () => createDocument(database, validInput));

    const documentAudit = database.findOne('document_audit_events');
    const generalAudit = database.findOne('audit_logs');

    expect(documentAudit.values).toContain('DOCUMENT_CREATED');
    expect(generalAudit.values).toContain('CUSTOMER_DOCUMENT_CREATED');

    const serialized = JSON.stringify([...documentAudit.values, ...generalAudit.values]);
    expect(serialized).not.toContain('AB123456789');
    expect(serialized).toContain('AB123456***');
  });

  it('records a view event when a document is read individually', async () => {
    const database = createFakeDatabase(() => [documentRow()]);

    await runWithTenantContext(CONTEXT_A, () => getDocumentById(database, 'doc-1'));

    expect(database.findOne('document_audit_events').values).toContain('DOCUMENT_VIEWED');
  });

  it('does not record a view event for a document that was not found', async () => {
    const database = createFakeDatabase(() => []);

    await runWithTenantContext(CONTEXT_A, () => getDocumentById(database, 'doc-1'));

    expect(database.find('document_audit_events')).toHaveLength(0);
  });

  it('records an update event naming only the changed columns', async () => {
    const database = createFakeDatabase(() => [documentRow()]);

    await runWithTenantContext(CONTEXT_A, () =>
      updateDocument(database, 'doc-1', { documentNumber: 'ZZ999888777' }),
    );

    const audit = database.findOne('document_audit_events');
    const serialized = JSON.stringify(audit.values);
    expect(audit.values).toContain('DOCUMENT_UPDATED');
    expect(serialized).toContain('document_number');
    expect(serialized).not.toContain('ZZ999888777');
  });

  it('records a soft-delete event', async () => {
    const database = createFakeDatabase(() => [documentRow({ deleted_at: '2026-08-29' })]);

    await runWithTenantContext(CONTEXT_A, () => deleteDocument(database, 'doc-1'));

    expect(database.findOne('document_audit_events').values).toContain('DOCUMENT_SOFT_DELETED');
  });

  it('never emits a full document number into any recorded statement', async () => {
    const database = createFakeDatabase(() => [documentRow()]);

    await runWithTenantContext(CONTEXT_A, () => createDocument(database, validInput));

    const auditStatements = database.find('audit');
    for (const query of auditStatements) {
      expect(JSON.stringify(query.values)).not.toContain('AB123456789');
    }
  });
});
