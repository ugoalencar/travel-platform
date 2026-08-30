import { describe, expect, it } from 'vitest';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import {
  DocumentVerificationStatus,
  OcrProcessingStatus,
  type DocumentExtraction,
} from '../../../packages/domain/types';
import {
  compareExtraction,
  createVerification,
  getLatestVerificationForDocument,
  getVerification,
  recordManualReview,
  verifyAgainstCustomer,
} from '../src/document-verification';
import { NotFoundError, ValidationError } from '../src/errors';
import {
  AGENCY_A,
  AGENCY_B,
  CONTEXT_A,
  CONTEXT_B,
  CUSTOMER_A,
  createFakeDatabase,
  USER_A,
  verificationRow,
} from './helpers/fake-database';

const storedDocument = {
  document_number: 'AB123456789',
  holder_name: 'JOAO SILVA',
  holder_birth_date: '1990-01-01',
  holder_nationality: 'Brazilian',
};

function extraction(data: Record<string, unknown>): DocumentExtraction {
  return {
    id: 'ext-1',
    agencyId: AGENCY_A,
    documentId: 'doc-1',
    provider: 'mock',
    extractedData: data,
    processingStatus: OcrProcessingStatus.COMPLETED,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function comparisonDatabase(rows: Record<string, unknown>[] = [verificationRow()]) {
  return createFakeDatabase((query) => {
    if (query.text.includes('FROM customer_documents')) {
      return [{ customer_id: CUSTOMER_A, ...storedDocument }];
    }
    if (query.text.includes('document_verifications')) {
      return rows;
    }
    return [];
  });
}

describe('compareExtraction -- field matching', () => {
  it('matches every field when the extraction agrees exactly', () => {
    const outcome = compareExtraction(storedDocument, {
      holderName: 'JOAO SILVA',
      holderBirthDate: '1990-01-01',
      holderNationality: 'Brazilian',
      documentNumber: 'AB123456789',
    });

    expect(outcome.holderNameMatch).toBe(true);
    expect(outcome.holderBirthDateMatch).toBe(true);
    expect(outcome.holderNationalityMatch).toBe(true);
    expect(outcome.documentNumberMatch).toBe(true);
    expect(outcome.discrepancies).toEqual({});
  });

  it('ignores case, accents and extra whitespace in names', () => {
    const outcome = compareExtraction(storedDocument, { holderName: '  joão   silva ' });

    expect(outcome.holderNameMatch).toBe(true);
  });

  it('ignores punctuation in document numbers', () => {
    const outcome = compareExtraction(storedDocument, { documentNumber: 'ab-123.456 789' });

    expect(outcome.documentNumberMatch).toBe(true);
  });

  it('accepts both ISO and Brazilian date formats', () => {
    expect(compareExtraction(storedDocument, { holderBirthDate: '01/01/1990' })
      .holderBirthDateMatch).toBe(true);
    expect(compareExtraction(storedDocument, { holderBirthDate: '1990-01-01T00:00:00Z' })
      .holderBirthDateMatch).toBe(true);
  });

  it('reads snake_case keys as well as camelCase', () => {
    const outcome = compareExtraction(storedDocument, { holder_name: 'JOAO SILVA' });

    expect(outcome.holderNameMatch).toBe(true);
  });

  it('flags a genuine mismatch and records a discrepancy', () => {
    const outcome = compareExtraction(storedDocument, { holderName: 'MARIA SOUZA' });

    expect(outcome.holderNameMatch).toBe(false);
    expect(outcome.discrepancies.holderName).toEqual({ reason: 'VALUE_MISMATCH' });
  });

  it('never echoes either compared value into the discrepancy bag', () => {
    const outcome = compareExtraction(storedDocument, {
      documentNumber: 'ZZ999888777',
      holderName: 'MARIA SOUZA',
    });

    const serialized = JSON.stringify(outcome.discrepancies);
    expect(serialized).not.toContain('ZZ999888777');
    expect(serialized).not.toContain('AB123456789');
    expect(serialized).not.toContain('MARIA SOUZA');
    expect(serialized).not.toContain('JOAO SILVA');
  });

  it('reports a field the extraction omitted as not-comparable, not a mismatch', () => {
    const outcome = compareExtraction(storedDocument, { holderName: 'JOAO SILVA' });

    expect(outcome.documentNumberMatch).toBeNull();
    expect(outcome.discrepancies.documentNumber).toEqual({ reason: 'MISSING_IN_EXTRACTION' });
  });

  it('reports a field absent from the stored document as not-comparable', () => {
    const outcome = compareExtraction(
      { ...storedDocument, holder_name: null },
      { holderName: 'ANYONE' },
    );

    expect(outcome.holderNameMatch).toBeNull();
    expect(outcome.discrepancies).not.toHaveProperty('holderName');
  });

  it('treats blank strings on either side as not-comparable', () => {
    expect(compareExtraction({ ...storedDocument, holder_name: '   ' }, { holderName: 'X' })
      .holderNameMatch).toBeNull();
    expect(compareExtraction(storedDocument, { holderName: '   ' }).holderNameMatch).toBeNull();
  });

  it('ignores non-string extracted values', () => {
    const outcome = compareExtraction(storedDocument, { holderName: 12345 });

    expect(outcome.holderNameMatch).toBeNull();
  });
});

describe('verifyAgainstCustomer', () => {
  it('fails closed when no tenant context is established', async () => {
    const database = comparisonDatabase();

    await expect(
      verifyAgainstCustomer(database, 'doc-1', extraction({})),
    ).rejects.toThrow();
  });

  it('binds the caller own agency id on every statement', async () => {
    const database = comparisonDatabase();

    await runWithTenantContext(CONTEXT_A, () =>
      verifyAgainstCustomer(database, 'doc-1', extraction({ holderName: 'JOAO SILVA' })),
    );

    for (const query of database.queries) {
      expect(query.values[0]).toBe(AGENCY_A);
      expect(query.values).not.toContain(AGENCY_B);
    }
  });

  it('404s rather than verifying a document from another tenant', async () => {
    const database = createFakeDatabase(() => []);

    await expect(
      runWithTenantContext(CONTEXT_B, () =>
        verifyAgainstCustomer(database, 'doc-1', extraction({})),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(database.find('INSERT INTO document_verifications')).toHaveLength(0);
  });

  it('persists per-field booleans alongside the discrepancy bag', async () => {
    const database = comparisonDatabase();

    await runWithTenantContext(CONTEXT_A, () =>
      verifyAgainstCustomer(
        database,
        'doc-1',
        extraction({ holderName: 'JOAO SILVA', documentNumber: 'WRONG1234' }),
      ),
    );

    const insert = database.findOne('INSERT INTO document_verifications');
    expect(insert.values).toContain(true);
    expect(insert.values).toContain(false);
    expect(insert.values.some((v) => typeof v === 'string' && v.includes('VALUE_MISMATCH')))
      .toBe(true);
  });

  it('moves the document to VERIFIED when every comparable field matched', async () => {
    const database = comparisonDatabase();

    await runWithTenantContext(CONTEXT_A, () =>
      verifyAgainstCustomer(database, 'doc-1', extraction({ holderName: 'JOAO SILVA' })),
    );

    expect(database.findOne('UPDATE customer_documents').values).toContain(
      DocumentVerificationStatus.VERIFIED,
    );
  });

  it('moves the document to MISMATCH when any field disagreed', async () => {
    const database = comparisonDatabase();

    await runWithTenantContext(CONTEXT_A, () =>
      verifyAgainstCustomer(database, 'doc-1', extraction({ holderName: 'SOMEONE ELSE' })),
    );

    expect(database.findOne('UPDATE customer_documents').values).toContain(
      DocumentVerificationStatus.MISMATCH,
    );
  });

  it('leaves the document PENDING when nothing was comparable', async () => {
    const database = comparisonDatabase();

    await runWithTenantContext(CONTEXT_A, () =>
      verifyAgainstCustomer(database, 'doc-1', extraction({})),
    );

    expect(database.findOne('UPDATE customer_documents').values).toContain(
      DocumentVerificationStatus.PENDING,
    );
  });

  it('does not silently pass an empty extraction as verified', async () => {
    const database = comparisonDatabase();

    await runWithTenantContext(CONTEXT_A, () =>
      verifyAgainstCustomer(database, 'doc-1', extraction({})),
    );

    expect(database.findOne('UPDATE customer_documents').values).not.toContain(
      DocumentVerificationStatus.VERIFIED,
    );
  });

  it('records a verification-completed audit event carrying booleans only', async () => {
    const database = comparisonDatabase();

    await runWithTenantContext(CONTEXT_A, () =>
      verifyAgainstCustomer(
        database,
        'doc-1',
        extraction({ holderName: 'JOAO SILVA', documentNumber: 'AB123456789' }),
      ),
    );

    const audit = database.findOne('document_audit_events');
    const serialized = JSON.stringify(audit.values);
    expect(audit.values).toContain('VERIFICATION_COMPLETED');
    expect(serialized).not.toContain('AB123456789');
    expect(serialized).not.toContain('JOAO SILVA');
  });

  it('performs the whole comparison in one transaction', async () => {
    const database = comparisonDatabase();

    await runWithTenantContext(CONTEXT_A, () =>
      verifyAgainstCustomer(database, 'doc-1', extraction({ holderName: 'JOAO SILVA' })),
    );

    expect(database.transactionCount).toBe(1);
  });

  it('rejects a blank documentId', async () => {
    const database = comparisonDatabase();

    await expect(
      runWithTenantContext(CONTEXT_A, () => verifyAgainstCustomer(database, '  ', extraction({}))),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('createVerification and reads', () => {
  it('creates a bare verification for the manual-review path', async () => {
    const database = createFakeDatabase(() => [
      verificationRow({ extraction_id: null, manual_review_notes: 'Awaiting scan' }),
    ]);

    const verification = await runWithTenantContext(CONTEXT_A, () =>
      createVerification(database, 'doc-1', undefined, 'Awaiting scan'),
    );

    expect(verification.manualReviewNotes).toBe('Awaiting scan');
    expect(verification).not.toHaveProperty('extractionId');
    expect(database.findOne('INSERT INTO document_verifications').values).toContain(null);
  });

  it('returns the latest verification for a document', async () => {
    const database = createFakeDatabase(() => [verificationRow()]);

    await runWithTenantContext(CONTEXT_A, () =>
      getLatestVerificationForDocument(database, 'doc-1'),
    );

    const query = database.findOne('SELECT');
    expect(query.text).toContain('ORDER BY created_at DESC');
    expect(query.text).toContain('LIMIT 1');
  });

  it('returns null for a verification in another tenant', async () => {
    const database = createFakeDatabase(() => []);

    await expect(
      runWithTenantContext(CONTEXT_A, () => getVerification(database, 'ver-x')),
    ).resolves.toBeNull();
  });

  it('maps nullable comparison columns off the domain object when unset', async () => {
    const database = createFakeDatabase(() => [verificationRow()]);

    const verification = await runWithTenantContext(CONTEXT_A, () =>
      getVerification(database, 'ver-1'),
    );

    expect(verification).not.toHaveProperty('holderNameMatch');
    expect(verification).not.toHaveProperty('reviewedAt');
    expect(verification?.documentId).toBe('doc-1');
  });
});

describe('recordManualReview', () => {
  it('stamps the reviewer, notes and timestamp', async () => {
    const database = createFakeDatabase(() => [
      verificationRow({
        reviewed_by_user_id: USER_A,
        reviewed_at: '2026-08-29T12:00:00.000Z',
        manual_review_notes: 'Verified in person',
      }),
    ]);

    const verification = await runWithTenantContext(CONTEXT_A, () =>
      recordManualReview(database, 'ver-1', USER_A, 'Verified in person'),
    );

    expect(verification?.reviewedByUserId).toBe(USER_A);
    expect(verification?.reviewedAt).toBeInstanceOf(Date);
    expect(verification?.manualReviewNotes).toBe('Verified in person');
  });

  it('moves the parent document to MANUAL_REVIEW', async () => {
    const database = createFakeDatabase(() => [verificationRow()]);

    await runWithTenantContext(CONTEXT_A, () =>
      recordManualReview(database, 'ver-1', USER_A, 'notes'),
    );

    expect(database.findOne('UPDATE customer_documents').values).toContain(
      DocumentVerificationStatus.MANUAL_REVIEW,
    );
  });

  it('records an audit event attributed to the reviewer', async () => {
    const database = createFakeDatabase(() => [verificationRow()]);

    await runWithTenantContext(CONTEXT_A, () =>
      recordManualReview(database, 'ver-1', USER_A, 'notes'),
    );

    const audit = database.findOne('document_audit_events');
    expect(audit.values).toContain('VERIFICATION_COMPLETED');
    expect(audit.values).toContain(USER_A);
  });

  it('returns null and changes nothing for a verification in another tenant', async () => {
    const database = createFakeDatabase(() => []);

    await expect(
      runWithTenantContext(CONTEXT_A, () => recordManualReview(database, 'ver-x', USER_A, 'n')),
    ).resolves.toBeNull();
    expect(database.find('UPDATE customer_documents')).toHaveLength(0);
    expect(database.find('document_audit_events')).toHaveLength(0);
  });

  it('rejects blank reviewer ids and blank notes', async () => {
    const database = createFakeDatabase(() => [verificationRow()]);

    await expect(
      runWithTenantContext(CONTEXT_A, () => recordManualReview(database, 'ver-1', '', 'n')),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      runWithTenantContext(CONTEXT_A, () => recordManualReview(database, 'ver-1', USER_A, '  ')),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
