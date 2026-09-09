import { describe, expect, it } from 'vitest';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { OcrProcessingStatus } from '../../../packages/domain/types';
import {
  completeDocumentExtraction,
  failExtraction,
  getExtraction,
  listExtractionsForDocument,
  pollExtraction,
  submitDocumentForExtraction,
} from '../src/document-extraction';
import { MockOcrProvider, type OcrProviderContract } from '../src/ocr-provider';
import { ValidationError } from '../src/errors';
import {
  AGENCY_A,
  AGENCY_B,
  CONTEXT_A,
  CONTEXT_B,
  createFakeDatabase,
  extractionRow,
} from './helpers/fake-database';

const FILE_URL = 'https://storage.example.test/signed/abc';

describe('document extraction -- submission', () => {
  it('fails closed when no tenant context is established', async () => {
    const database = createFakeDatabase();
    const provider = new MockOcrProvider();

    await expect(
      submitDocumentForExtraction(database, 'doc-1', 'att-1', FILE_URL, 'RG', provider),
    ).rejects.toThrow();
    await expect(getExtraction(database, 'ext-1')).rejects.toThrow();
  });

  it('inserts a PENDING row, then promotes it to PROCESSING with the task id', async () => {
    const statuses: string[] = [];
    const database = createFakeDatabase((query) => {
      if (query.text.includes('INSERT INTO document_extractions')) {
        statuses.push('insert');
        return [extractionRow()];
      }
      if (query.text.includes('UPDATE document_extractions')) {
        statuses.push('update');
        return [
          extractionRow({
            processing_status: 'PROCESSING',
            extracted_data: { taskId: 'mock-task-1' },
          }),
        ];
      }
      return [];
    });
    const provider = new MockOcrProvider();

    const extraction = await runWithTenantContext(CONTEXT_A, () =>
      submitDocumentForExtraction(database, 'doc-1', 'att-1', FILE_URL, 'RG', provider),
    );

    expect(statuses).toEqual(['insert', 'update']);
    expect(database.findOne('INSERT INTO document_extractions').values).toContain(
      OcrProcessingStatus.PENDING,
    );
    expect(database.findOne('UPDATE document_extractions').values).toContain(
      OcrProcessingStatus.PROCESSING,
    );
    expect(extraction.processingStatus).toBe(OcrProcessingStatus.PROCESSING);
    expect(extraction.extractedData).toEqual({ taskId: 'mock-task-1' });
  });

  it('passes the injected provider name and submission params through unchanged', async () => {
    const database = createFakeDatabase(() => [extractionRow({ provider: 'stub' })]);
    const provider = new MockOcrProvider();

    await runWithTenantContext(CONTEXT_A, () =>
      submitDocumentForExtraction(database, 'doc-1', 'att-1', FILE_URL, 'PASSAPORTE', provider),
    );

    expect(provider.submissions).toEqual([
      {
        agencyId: AGENCY_A,
        documentId: 'doc-1',
        attachmentId: 'att-1',
        fileUrl: FILE_URL,
        documentType: 'PASSAPORTE',
      },
    ]);
    expect(database.findOne('INSERT INTO document_extractions').values).toContain('mock');
  });

  it('binds the caller own agency id on every statement', async () => {
    const database = createFakeDatabase(() => [extractionRow()]);

    await runWithTenantContext(CONTEXT_A, () =>
      submitDocumentForExtraction(database, 'doc-1', 'att-1', FILE_URL, 'RG', new MockOcrProvider()),
    );

    for (const query of database.find('document_extractions')) {
      expect(query.values[0]).toBe(AGENCY_A);
      expect(query.values).not.toContain(AGENCY_B);
    }
  });

  it('scopes reads to the calling tenant', async () => {
    const database = createFakeDatabase(() => []);

    await runWithTenantContext(CONTEXT_B, () => getExtraction(database, 'ext-1'));

    expect(database.findOne('SELECT').values[0]).toBe(AGENCY_B);
  });

  it('rejects a blank documentId, attachmentId or fileUrl before touching the database', async () => {
    const database = createFakeDatabase();
    const provider = new MockOcrProvider();

    for (const args of [
      ['', 'att-1', FILE_URL],
      ['doc-1', '  ', FILE_URL],
      ['doc-1', 'att-1', ''],
    ] as const) {
      await expect(
        runWithTenantContext(CONTEXT_A, () =>
          submitDocumentForExtraction(database, args[0], args[1], args[2], 'RG', provider),
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    }
    expect(database.queries).toHaveLength(0);
  });

  it('records a FAILED extraction rather than propagating a provider outage', async () => {
    const database = createFakeDatabase((query) =>
      query.text.includes('INSERT')
        ? [extractionRow()]
        : [extractionRow({ processing_status: 'FAILED', error_message: 'provider down' })],
    );
    const provider: OcrProviderContract = {
      name: 'flaky',
      submitForExtraction: () => Promise.reject(new Error('provider down')),
      getExtractionResult: () => Promise.resolve(null),
    };

    const extraction = await runWithTenantContext(CONTEXT_A, () =>
      submitDocumentForExtraction(database, 'doc-1', 'att-1', FILE_URL, 'RG', provider),
    );

    expect(extraction.processingStatus).toBe(OcrProcessingStatus.FAILED);
    expect(extraction.errorMessage).toBe('provider down');
    expect(database.findOne('UPDATE document_extractions').values).toContain('provider down');
  });

  it('records the extraction-started audit event with the provider name', async () => {
    const database = createFakeDatabase(() => [extractionRow()]);

    await runWithTenantContext(CONTEXT_A, () =>
      submitDocumentForExtraction(database, 'doc-1', 'att-1', FILE_URL, 'RG', new MockOcrProvider()),
    );

    const audit = database.findOne('document_audit_events');
    expect(audit.values).toContain('EXTRACTION_STARTED');
    expect(JSON.stringify(audit.values)).toContain('mock');
  });

  it('does not hold a transaction open across the provider call', async () => {
    const database = createFakeDatabase(() => [extractionRow()]);

    await runWithTenantContext(CONTEXT_A, () =>
      submitDocumentForExtraction(database, 'doc-1', 'att-1', FILE_URL, 'RG', new MockOcrProvider()),
    );

    // One transaction for the insert, a separate one for the promotion.
    expect(database.transactionCount).toBe(2);
  });
});

describe('document extraction -- completion', () => {
  it('stores the extracted payload, confidence and COMPLETED status', async () => {
    const database = createFakeDatabase(() => [
      extractionRow({
        processing_status: 'COMPLETED',
        confidence: '88.50',
        extracted_data: { holderName: 'JOAO' },
        processed_at: '2026-08-29T12:00:00.000Z',
      }),
    ]);

    const extraction = await runWithTenantContext(CONTEXT_A, () =>
      completeDocumentExtraction(database, 'ext-1', { holderName: 'JOAO' }, 88.5),
    );

    const update = database.findOne('UPDATE document_extractions');
    expect(update.values).toContain(OcrProcessingStatus.COMPLETED);
    expect(update.values).toContain(88.5);
    expect(update.values).toContain(JSON.stringify({ holderName: 'JOAO' }));
    expect(extraction?.confidence).toBe(88.5);
    expect(extraction?.processedAt).toBeInstanceOf(Date);
  });

  it('clamps an out-of-range confidence into 0..100', async () => {
    for (const [input, expected] of [
      [150, 100],
      [-5, 0],
    ] as const) {
      const database = createFakeDatabase(() => [extractionRow()]);
      await runWithTenantContext(CONTEXT_A, () =>
        completeDocumentExtraction(database, 'ext-1', {}, input),
      );
      expect(database.findOne('UPDATE document_extractions').values).toContain(expected);
    }
  });

  it('stores a null confidence when the provider reported none', async () => {
    const database = createFakeDatabase(() => [extractionRow()]);

    const extraction = await runWithTenantContext(CONTEXT_A, () =>
      completeDocumentExtraction(database, 'ext-1', {}),
    );

    expect(database.findOne('UPDATE document_extractions').values).toContain(null);
    expect(extraction).not.toHaveProperty('confidence');
  });

  it('clears any previous error message on success', async () => {
    const database = createFakeDatabase(() => [extractionRow()]);

    await runWithTenantContext(CONTEXT_A, () =>
      completeDocumentExtraction(database, 'ext-1', {}),
    );

    expect(database.findOne('UPDATE document_extractions').text).toContain(
      'error_message = NULL',
    );
  });

  it('returns null when the extraction belongs to another tenant', async () => {
    const database = createFakeDatabase(() => []);

    await expect(
      runWithTenantContext(CONTEXT_A, () => completeDocumentExtraction(database, 'ext-1', {})),
    ).resolves.toBeNull();
    expect(database.find('document_audit_events')).toHaveLength(0);
  });

  it('audits completion with field names only, never extracted values', async () => {
    const database = createFakeDatabase(() => [extractionRow({ processing_status: 'COMPLETED' })]);

    await runWithTenantContext(CONTEXT_A, () =>
      completeDocumentExtraction(database, 'ext-1', { documentNumber: 'AB123456789' }, 90),
    );

    const audit = database.findOne('document_audit_events');
    const serialized = JSON.stringify(audit.values);
    expect(audit.values).toContain('EXTRACTION_COMPLETED');
    expect(serialized).toContain('documentNumber');
    expect(serialized).not.toContain('AB123456789');
  });
});

describe('document extraction -- failure and polling', () => {
  it('marks an extraction FAILED with its message', async () => {
    const database = createFakeDatabase(() => [
      extractionRow({ processing_status: 'FAILED', error_message: 'blurry' }),
    ]);

    const extraction = await runWithTenantContext(CONTEXT_A, () =>
      failExtraction(database, 'ext-1', 'blurry'),
    );

    expect(extraction?.processingStatus).toBe(OcrProcessingStatus.FAILED);
    expect(extraction?.errorMessage).toBe('blurry');
  });

  it('leaves the extraction untouched while the provider still reports processing', async () => {
    const database = createFakeDatabase(() => [extractionRow({ processing_status: 'PROCESSING' })]);
    const provider = new MockOcrProvider({ simulateAsync: true });
    const taskId = await provider.submitForExtraction({
      agencyId: AGENCY_A,
      documentId: 'doc-1',
      attachmentId: 'att-1',
      fileUrl: FILE_URL,
      documentType: 'RG',
    });

    const extraction = await runWithTenantContext(CONTEXT_A, () =>
      pollExtraction(database, 'ext-1', taskId, provider),
    );

    expect(extraction?.processingStatus).toBe(OcrProcessingStatus.PROCESSING);
    expect(database.find('UPDATE document_extractions')).toHaveLength(0);
  });

  it('completes the extraction once the provider reports a result', async () => {
    const database = createFakeDatabase(() => [extractionRow({ processing_status: 'COMPLETED' })]);
    const provider = new MockOcrProvider({ data: { holderName: 'X' }, confidence: 70 });
    const taskId = await provider.submitForExtraction({
      agencyId: AGENCY_A,
      documentId: 'doc-1',
      attachmentId: 'att-1',
      fileUrl: FILE_URL,
      documentType: 'RG',
    });

    const extraction = await runWithTenantContext(CONTEXT_A, () =>
      pollExtraction(database, 'ext-1', taskId, provider),
    );

    expect(extraction?.processingStatus).toBe(OcrProcessingStatus.COMPLETED);
    expect(database.findOne('UPDATE document_extractions').values).toContain(70);
  });

  it('fails the extraction when the provider reports a failure', async () => {
    const database = createFakeDatabase(() => [extractionRow({ processing_status: 'FAILED' })]);
    const provider = new MockOcrProvider({ failWith: 'torn page' });
    const taskId = await provider.submitForExtraction({
      agencyId: AGENCY_A,
      documentId: 'doc-1',
      attachmentId: 'att-1',
      fileUrl: FILE_URL,
      documentType: 'RG',
    });

    await runWithTenantContext(CONTEXT_A, () =>
      pollExtraction(database, 'ext-1', taskId, provider),
    );

    expect(database.findOne('UPDATE document_extractions').values).toContain('torn page');
  });

  it('fails the extraction when the provider has forgotten the task', async () => {
    const database = createFakeDatabase(() => [extractionRow({ processing_status: 'FAILED' })]);

    await runWithTenantContext(CONTEXT_A, () =>
      pollExtraction(database, 'ext-1', 'ghost', new MockOcrProvider()),
    );

    expect(database.findOne('UPDATE document_extractions').values.join(' ')).toContain('ghost');
  });
});

describe('document extraction -- reads', () => {
  it('returns extractions for a document newest first', async () => {
    const database = createFakeDatabase(() => [extractionRow(), extractionRow({ id: 'ext-2' })]);

    const extractions = await runWithTenantContext(CONTEXT_A, () =>
      listExtractionsForDocument(database, 'doc-1'),
    );

    expect(extractions).toHaveLength(2);
    expect(database.findOne('SELECT').text).toContain('ORDER BY created_at DESC');
  });

  it('coerces the numeric confidence column back to a number', async () => {
    const database = createFakeDatabase(() => [extractionRow({ confidence: '77.25' })]);

    const extraction = await runWithTenantContext(CONTEXT_A, () =>
      getExtraction(database, 'ext-1'),
    );

    expect(extraction?.confidence).toBe(77.25);
  });

  it('returns null for an unknown extraction', async () => {
    const database = createFakeDatabase(() => []);

    await expect(
      runWithTenantContext(CONTEXT_A, () => getExtraction(database, 'ext-x')),
    ).resolves.toBeNull();
  });
});
