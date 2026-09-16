/**
 * HTTP-level coverage for the Customer 360 route surface.
 *
 * Uses Fastify's `inject` against a real `buildApp` with a scripted in-memory
 * database, so these exercise the actual routing, auth pipeline, role gates,
 * body parsers and error mapping -- not a re-implementation of them.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { IncomingHttpHeaders } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../src/auth';
import { MockOcrProvider } from '../src/ocr-provider';
import { ValidationError } from '../src/errors';
import {
  parseCreateAddressInput,
  parseCreateDependentInput,
  parseCreateDocumentInput,
  parseUpdateAddressInput,
  parseUpdateDependentInput,
  parseUpdateDocumentInput,
} from '../src/routes/customer-documents';
import {
  addressRow,
  AGENCY_A,
  attachmentRow,
  createFakeDatabase,
  CUSTOMER_A,
  dependentRow,
  documentRow,
  extractionRow,
  auditEventRow,
  USER_A,
  verificationRow,
  type QueryResponder,
} from './helpers/fake-database';

/**
 * Typed body reader. Fastify's `response.json()` is `any`; naming the shape at
 * each call site keeps these assertions type-checked rather than opaque.
 */
function readJson<T>(response: { json: <R>() => R }): T {
  return response.json<T>();
}

const principalA: AuthenticatedPrincipal = {
  userId: USER_A,
  agencyId: AGENCY_A,
  role: UserRole.ADMIN,
  email: 'admin-a@example.test',
};

const viewerPrincipal: AuthenticatedPrincipal = {
  userId: '11000000-0000-4000-8000-000000000002',
  agencyId: AGENCY_A,
  role: UserRole.VIEWER,
  email: 'viewer-a@example.test',
};

const authHeaders = {
  'x-dev-user-id': principalA.userId,
  'x-dev-agency-id': principalA.agencyId,
  'x-dev-role': principalA.role,
};

const viewerHeaders = {
  'x-dev-user-id': viewerPrincipal.userId,
  'x-dev-agency-id': viewerPrincipal.agencyId,
  'x-dev-role': viewerPrincipal.role,
};

const customerRow = {
  id: CUSTOMER_A,
  agency_id: AGENCY_A,
  name: 'Joao Silva',
  email: null,
  phone: null,
  cpf: null,
  passport: null,
  address: null,
  notes: null,
  status: 'ACTIVE',
  deleted_at: null,
  created_at: '2026-08-29T12:00:00.000Z',
  updated_at: '2026-08-29T12:00:00.000Z',
};

/** Default responder: every parent lookup succeeds, children return one row. */
const defaultResponder: QueryResponder = (query) => {
  const text = query.text;
  if (text.includes('FROM customers')) return [customerRow];
  if (text.includes('customer_addresses')) return [addressRow()];
  if (text.includes('customer_dependents')) return [dependentRow()];
  if (text.includes('customer_documents')) return [documentRow()];
  if (text.includes('document_attachments')) return [attachmentRow()];
  if (text.includes('document_extractions')) return [extractionRow()];
  if (text.includes('document_verifications')) return [verificationRow()];
  if (text.includes('document_audit_events') && text.includes('SELECT')) {
    return [auditEventRow()];
  }
  return [];
};

function buildTestApp(responder: QueryResponder = defaultResponder): FastifyInstance {
  const database = createFakeDatabase(responder);

  const knownPrincipals = [principalA, viewerPrincipal];

  return buildApp({
    authProvider: {
      authenticate: (request: { headers: IncomingHttpHeaders }) => {
        const userId = request.headers['x-dev-user-id'];
        const match = knownPrincipals.find((p) => p.userId === userId);
        return Promise.resolve(match ?? null);
      },
    },
    validateUserAgencyAccess: (userId: string, agencyId: string) =>
      Promise.resolve(
        knownPrincipals.some((p) => p.userId === userId && p.agencyId === agencyId),
      ),
    database,
    ocrProvider: new MockOcrProvider(),
  });
}

let app: FastifyInstance;

beforeAll(async () => {
  // POST /documents/:documentId/attachments now writes real bytes via
  // file-storage.ts -- point it at a temp dir for this test process so
  // nothing lands in the repo tree.
  process.env.UPLOADS_DIR = mkdtempSync(join(tmpdir(), 'travel-platform-attachments-test-'));
  app = buildTestApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  if (process.env.UPLOADS_DIR) {
    rmSync(process.env.UPLOADS_DIR, { recursive: true, force: true });
  }
});

/** Builds a minimal valid multipart/form-data body for the attachment
 * upload route -- one file part plus an `attachmentType` field. */
function buildAttachmentMultipart(options: {
  attachmentType: string;
  fileName: string;
  mimeType: string;
  content: Buffer;
}): { payload: Buffer; contentType: string } {
  const boundary = '----attachmentTestBoundary';
  const parts = [
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="attachmentType"\r\n\r\n`,
    `${options.attachmentType}\r\n`,
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="file"; filename="${options.fileName}"\r\n`,
    `Content-Type: ${options.mimeType}\r\n\r\n`,
  ].join('');
  const payload = Buffer.concat([
    Buffer.from(parts, 'utf8'),
    options.content,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
  ]);
  return { payload, contentType: `multipart/form-data; boundary=${boundary}` };
}

describe('Customer 360 routes -- authentication', () => {
  it.each([
    ['GET', `/customers/${CUSTOMER_A}/addresses`],
    ['GET', `/customers/${CUSTOMER_A}/dependents`],
    ['GET', `/customers/${CUSTOMER_A}/documents`],
    ['GET', '/documents/doc-1/attachments'],
    ['GET', '/documents/doc-1/verification'],
    ['GET', `/customers/${CUSTOMER_A}/audit-log`],
    ['GET', '/documents/doc-1/audit-log'],
  ])('denies anonymous %s %s', async (method, url) => {
    const response = await app.inject({ method: method as 'GET', url });

    expect(response.statusCode).toBe(401);
  });

  it('denies an unknown principal', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/customers/${CUSTOMER_A}/addresses`,
      headers: { 'x-dev-user-id': 'nobody', 'x-dev-agency-id': AGENCY_A, 'x-dev-role': 'ADMIN' },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('Customer 360 routes -- addresses', () => {
  it('lists addresses for an existing customer', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/customers/${CUSTOMER_A}/addresses`,
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(readJson<{ addresses: unknown[] }>(response).addresses).toBeInstanceOf(Array);
  });

  it('creates an address and returns 201', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/customers/${CUSTOMER_A}/addresses`,
      headers: authHeaders,
      payload: {
        street: 'Rua Um',
        number: '100',
        district: 'Centro',
        city: 'Sao Paulo',
        state: 'SP',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(readJson<{ address: { customerId: string } }>(response).address).toMatchObject({
      customerId: CUSTOMER_A,
    });
  });

  it('rejects a create missing a required field with 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/customers/${CUSTOMER_A}/addresses`,
      headers: authHeaders,
      payload: { street: 'Rua Um', number: '100' },
    });

    expect(response.statusCode).toBe(400);
    expect(readJson<{ code: string }>(response).code).toBe('VALIDATION_ERROR');
  });

  it('rejects an attempt to set agencyId through the body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/customers/${CUSTOMER_A}/addresses`,
      headers: authHeaders,
      payload: {
        street: 'Rua Um', number: '1', district: 'C', city: 'SP', state: 'SP',
        agencyId: 'other-agency',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(readJson<{ error: string }>(response).error).toContain('agencyId');
  });

  it('404s when the parent customer does not exist', async () => {
    const isolated = buildTestApp((query) =>
      query.text.includes('FROM customers') ? [] : [addressRow()],
    );
    await isolated.ready();

    const response = await isolated.inject({
      method: 'GET',
      url: `/customers/${CUSTOMER_A}/addresses`,
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(404);
    await isolated.close();
  });

  it('404s when the address belongs to a different customer', async () => {
    const isolated = buildTestApp((query) =>
      query.text.includes('customer_addresses')
        ? [addressRow({ customer_id: 'someone-else' })]
        : defaultResponder(query),
    );
    await isolated.ready();

    const response = await isolated.inject({
      method: 'GET',
      url: `/customers/${CUSTOMER_A}/addresses/addr-1`,
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(404);
    await isolated.close();
  });

  it('soft deletes through DELETE and returns the row', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/customers/${CUSTOMER_A}/addresses/addr-1`,
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(readJson<{ address: unknown }>(response).address).toBeTruthy();
  });

  it('denies a write to a VIEWER', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/customers/${CUSTOMER_A}/addresses`,
      headers: viewerHeaders,
      payload: { street: 'R', number: '1', district: 'C', city: 'SP', state: 'SP' },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe('Customer 360 routes -- dependents', () => {
  it('creates a dependent and returns 201', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/customers/${CUSTOMER_A}/dependents`,
      headers: authHeaders,
      payload: { name: 'Maria Silva', relationshipType: 'SPOUSE' },
    });

    expect(response.statusCode).toBe(201);
    expect(readJson<{ dependent: { relationshipType: string } }>(response).dependent).toMatchObject(
      { relationshipType: 'SPOUSE' },
    );
  });

  it('rejects an unknown relationship type with 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/customers/${CUSTOMER_A}/dependents`,
      headers: authHeaders,
      payload: { name: 'X', relationshipType: 'FRIEND' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('patches a dependent', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/customers/${CUSTOMER_A}/dependents/dep-1`,
      headers: authHeaders,
      payload: { notes: 'Vegetarian' },
    });

    expect(response.statusCode).toBe(200);
  });

  it('deletes a dependent', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/customers/${CUSTOMER_A}/dependents/dep-1`,
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('Customer 360 routes -- documents', () => {
  it('creates a document and returns 201', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/customers/${CUSTOMER_A}/documents`,
      headers: authHeaders,
      payload: { documentType: 'PASSAPORTE', documentNumber: 'AB123456789' },
    });

    expect(response.statusCode).toBe(201);
    expect(readJson<{ document: { documentType: string } }>(response).document).toMatchObject({
      documentType: 'PASSAPORTE',
    });
  });

  it('rejects an unknown document type with 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/customers/${CUSTOMER_A}/documents`,
      headers: authHeaders,
      payload: { documentType: 'DRIVER', documentNumber: 'X' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a blank document number with 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/customers/${CUSTOMER_A}/documents`,
      headers: authHeaders,
      payload: { documentType: 'RG', documentNumber: '   ' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('exposes the computed expiry flag in the response', async () => {
    const isolated = buildTestApp((query) =>
      query.text.includes('customer_documents')
        ? [documentRow({ is_expired: true, expiry_date: '2020-01-01' })]
        : defaultResponder(query),
    );
    await isolated.ready();

    const response = await isolated.inject({
      method: 'GET',
      url: `/customers/${CUSTOMER_A}/documents/doc-1`,
      headers: authHeaders,
    });

    expect(readJson<{ document: { isExpired: boolean } }>(response).document.isExpired).toBe(true);
    await isolated.close();
  });

  it('returns camelCase keys, never raw snake_case columns', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/customers/${CUSTOMER_A}/documents/doc-1`,
      headers: authHeaders,
    });

    const { document } = readJson<{ document: Record<string, unknown> }>(response);
    expect(document).toHaveProperty('documentNumber');
    expect(document).not.toHaveProperty('document_number');
    expect(document).not.toHaveProperty('agency_id');
  });
});

describe('Customer 360 routes -- attachments', () => {
  it('uploads a real file and returns 201', async () => {
    const { payload, contentType } = buildAttachmentMultipart({
      attachmentType: 'FRONT',
      fileName: 'passport.png',
      mimeType: 'image/png',
      content: Buffer.from('fake-png-bytes'),
    });
    const response = await app.inject({
      method: 'POST',
      url: '/documents/doc-1/attachments',
      headers: { ...authHeaders, 'content-type': contentType },
      payload,
    });

    expect(response.statusCode).toBe(201);
    expect(readJson<{ attachment: unknown }>(response).attachment).toBeTruthy();
  });

  it('rejects an executable upload with 400', async () => {
    const { payload, contentType } = buildAttachmentMultipart({
      attachmentType: 'FRONT',
      fileName: 'payload.exe',
      mimeType: 'application/x-msdownload',
      content: Buffer.from('MZ'),
    });
    const response = await app.inject({
      method: 'POST',
      url: '/documents/doc-1/attachments',
      headers: { ...authHeaders, 'content-type': contentType },
      payload,
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a file over the 20 MB ceiling with 400', async () => {
    const { payload, contentType } = buildAttachmentMultipart({
      attachmentType: 'FRONT',
      fileName: 'huge.png',
      mimeType: 'image/png',
      content: Buffer.alloc(20 * 1024 * 1024 + 1, 1),
    });
    const response = await app.inject({
      method: 'POST',
      url: '/documents/doc-1/attachments',
      headers: { ...authHeaders, 'content-type': contentType },
      payload,
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects an upload with no attachmentType field', async () => {
    const boundary = '----noTypeBoundary';
    const payload = Buffer.from(
      [
        `--${boundary}\r\n`,
        `Content-Disposition: form-data; name="file"; filename="a.png"\r\n`,
        `Content-Type: image/png\r\n\r\n`,
        'bytes',
        `\r\n--${boundary}--\r\n`,
      ].join(''),
      'utf8',
    );
    const response = await app.inject({
      method: 'POST',
      url: '/documents/doc-1/attachments',
      headers: { ...authHeaders, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    expect(response.statusCode).toBe(400);
  });

  it('lists attachments for a document', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/documents/doc-1/attachments',
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(readJson<{ attachments: unknown[] }>(response).attachments).toBeInstanceOf(Array);
  });

  it('404s the parent document when it does not exist', async () => {
    const isolated = buildTestApp((query) =>
      query.text.includes('customer_documents') ? [] : defaultResponder(query),
    );
    await isolated.ready();

    const response = await isolated.inject({
      method: 'GET',
      url: '/documents/doc-missing/attachments',
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(404);
    await isolated.close();
  });
});

describe('Customer 360 routes -- extraction and verification', () => {
  it('submits a document for extraction and returns 202', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/documents/doc-1/extract',
      headers: authHeaders,
      payload: { attachmentId: 'att-1', fileUrl: 'https://storage.example.test/x' },
    });

    expect(response.statusCode).toBe(202);
    expect(readJson<{ extraction: unknown }>(response).extraction).toBeTruthy();
  });

  it('rejects an extraction request missing the attachment id', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/documents/doc-1/extract',
      headers: authHeaders,
      payload: { fileUrl: 'https://storage.example.test/x' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('404s an extraction that belongs to a different document', async () => {
    const isolated = buildTestApp((query) =>
      query.text.includes('document_extractions')
        ? [extractionRow({ document_id: 'other-doc' })]
        : defaultResponder(query),
    );
    await isolated.ready();

    const response = await isolated.inject({
      method: 'GET',
      url: '/documents/doc-1/extraction/ext-1',
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(404);
    await isolated.close();
  });

  it('polls a PROCESSING extraction and returns the completed candidate', async () => {
    const isolated = buildTestApp((query) => {
      const text = query.text;
      if (text.includes('document_extractions') && text.includes('UPDATE')) {
        return [
          extractionRow({
            processing_status: 'COMPLETED',
            extracted_data: { holderName: 'MOCK HOLDER' },
            confidence: 95,
          }),
        ];
      }
      if (text.includes('document_extractions')) {
        return [
          extractionRow({
            processing_status: 'PROCESSING',
            extracted_data: { taskId: 'mock-task-1' },
          }),
        ];
      }
      return defaultResponder(query);
    });
    await isolated.ready();

    const response = await isolated.inject({
      method: 'POST',
      url: '/documents/doc-1/extraction/ext-1/poll',
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(
      readJson<{ extraction: { processingStatus: string } }>(response).extraction
        .processingStatus,
    ).toBe('COMPLETED');
    await isolated.close();
  });

  it('returns a terminal extraction unchanged without re-polling the provider', async () => {
    const isolated = buildTestApp((query) =>
      query.text.includes('document_extractions')
        ? [extractionRow({ processing_status: 'COMPLETED' })]
        : defaultResponder(query),
    );
    await isolated.ready();

    const response = await isolated.inject({
      method: 'POST',
      url: '/documents/doc-1/extraction/ext-1/poll',
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(
      readJson<{ extraction: { processingStatus: string } }>(response).extraction
        .processingStatus,
    ).toBe('COMPLETED');
    await isolated.close();
  });

  it('404s a poll for an extraction belonging to a different document', async () => {
    const isolated = buildTestApp((query) =>
      query.text.includes('document_extractions')
        ? [extractionRow({ document_id: 'other-doc' })]
        : defaultResponder(query),
    );
    await isolated.ready();

    const response = await isolated.inject({
      method: 'POST',
      url: '/documents/doc-1/extraction/ext-1/poll',
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(404);
    await isolated.close();
  });

  it('verifies a document against an extraction and returns 201', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/documents/doc-1/verify',
      headers: authHeaders,
      payload: { extractionId: 'ext-1' },
    });

    expect(response.statusCode).toBe(201);
    expect(readJson<{ verification: unknown }>(response).verification).toBeTruthy();
  });

  it('returns the latest verification for a document', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/documents/doc-1/verification',
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
  });

  it('404s when a document has never been verified', async () => {
    const isolated = buildTestApp((query) =>
      query.text.includes('document_verifications') ? [] : defaultResponder(query),
    );
    await isolated.ready();

    const response = await isolated.inject({
      method: 'GET',
      url: '/documents/doc-1/verification',
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(404);
    await isolated.close();
  });

  it('records a manual review', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/documents/doc-1/verification/ver-1/manual-review',
      headers: authHeaders,
      payload: { notes: 'Checked in person', reviewedByUserId: USER_A },
    });

    expect(response.statusCode).toBe(200);
  });

  it('denies a manual review to an AGENT-level role', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/documents/doc-1/verification/ver-1/manual-review',
      headers: viewerHeaders,
      payload: { notes: 'x', reviewedByUserId: USER_A },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe('Customer 360 routes -- audit log', () => {
  it('returns the customer audit trail', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/customers/${CUSTOMER_A}/audit-log`,
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(readJson<{ events: unknown[] }>(response).events).toBeInstanceOf(Array);
  });

  it('returns the document audit trail', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/documents/doc-1/audit-log',
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
  });

  it('denies the audit trail to a VIEWER', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/customers/${CUSTOMER_A}/audit-log`,
      headers: viewerHeaders,
    });

    expect(response.statusCode).toBe(403);
  });

  it('exposes no write verb on the audit trail', async () => {
    for (const method of ['POST', 'DELETE', 'PATCH'] as const) {
      const response = await app.inject({
        method,
        url: '/documents/doc-1/audit-log',
        headers: authHeaders,
        payload: {},
      });

      expect(response.statusCode).toBe(404);
    }
  });
});

// ============================================================
// The exported parsers are the edge validation for this surface. Testing them
// directly covers the rejection branches that a happy-path HTTP request never
// reaches.
// ============================================================

describe('Customer 360 input parsers', () => {
  it.each([null, 'string', 42, ['a']])('rejects a non-object body (%s)', (body) => {
    expect(() => parseCreateAddressInput(body, CUSTOMER_A)).toThrow(ValidationError);
  });

  it('rejects unknown fields on every create parser', () => {
    expect(() =>
      parseCreateAddressInput(
        { street: 'R', number: '1', district: 'C', city: 'SP', state: 'SP', hacked: true },
        CUSTOMER_A,
      ),
    ).toThrow(/hacked/);
    expect(() =>
      parseCreateDependentInput({ name: 'X', relationshipType: 'CHILD', hacked: 1 }, CUSTOMER_A),
    ).toThrow(/hacked/);
    expect(() =>
      parseCreateDocumentInput({ documentType: 'RG', documentNumber: '1', hacked: 1 }, CUSTOMER_A),
    ).toThrow(/hacked/);
  });

  it('forces the customer id to come from the path, not the body', () => {
    const parsed = parseCreateAddressInput(
      { street: 'R', number: '1', district: 'C', city: 'SP', state: 'SP' },
      CUSTOMER_A,
    );

    expect(parsed.customerId).toBe(CUSTOMER_A);
  });

  it('carries optional address fields through and defaults the rest to absent', () => {
    const parsed = parseCreateAddressInput(
      {
        street: 'R', number: '1', district: 'C', city: 'SP', state: 'SP',
        type: 'COMMERCIAL', isPrimary: true, cep: '01001-000',
        complement: 'Sala 2', country: 'Brazil',
      },
      CUSTOMER_A,
    );

    expect(parsed).toMatchObject({
      type: 'COMMERCIAL', isPrimary: true, cep: '01001-000', complement: 'Sala 2',
    });
  });

  it('rejects wrongly typed optional fields', () => {
    expect(() =>
      parseCreateAddressInput(
        { street: 'R', number: '1', district: 'C', city: 'SP', state: 'SP', cep: 12345 },
        CUSTOMER_A,
      ),
    ).toThrow(ValidationError);
    expect(() =>
      parseCreateAddressInput(
        { street: 'R', number: '1', district: 'C', city: 'SP', state: 'SP', isPrimary: 'yes' },
        CUSTOMER_A,
      ),
    ).toThrow(ValidationError);
    expect(() =>
      parseCreateAddressInput(
        { street: 'R', number: '1', district: 'C', city: 'SP', state: 'SP', type: 'BEACH' },
        CUSTOMER_A,
      ),
    ).toThrow(ValidationError);
  });

  it('accepts an explicit null to clear an optional field on update', () => {
    expect(parseUpdateAddressInput({ complement: null })).toEqual({ complement: null });
    expect(parseUpdateDependentInput({ cpf: null })).toEqual({ cpf: null });
    expect(parseUpdateDocumentInput({ notes: null })).toEqual({ notes: null });
  });

  it('rejects a non-string, non-null value for a nullable field', () => {
    expect(() => parseUpdateDependentInput({ cpf: 12345 })).toThrow(ValidationError);
  });

  it('returns an empty patch for an empty body', () => {
    expect(parseUpdateAddressInput({})).toEqual({});
    expect(parseUpdateDependentInput({})).toEqual({});
    expect(parseUpdateDocumentInput({})).toEqual({});
  });

  it('allows a verification status only on the document update parser', () => {
    expect(parseUpdateDocumentInput({ verificationStatus: 'VERIFIED' })).toEqual({
      verificationStatus: 'VERIFIED',
    });
    expect(() =>
      parseCreateDocumentInput(
        { documentType: 'RG', documentNumber: '1', verificationStatus: 'VERIFIED' },
        CUSTOMER_A,
      ),
    ).toThrow(/verificationStatus/);
  });

  it('rejects an update carrying an unknown verification status', () => {
    expect(() => parseUpdateDocumentInput({ verificationStatus: 'OK' })).toThrow(ValidationError);
  });

  it('requires the enum and identifier fields on a dependent create', () => {
    expect(() => parseCreateDependentInput({ name: 'X' }, CUSTOMER_A)).toThrow(
      /relationshipType/,
    );
    expect(() => parseCreateDependentInput({ relationshipType: 'CHILD' }, CUSTOMER_A)).toThrow(
      /name/,
    );
  });

  // Attachment payload validation used to be tested here via
  // parseAttachmentInput(), a JSON-body parser -- removed when
  // POST /documents/:documentId/attachments switched to real multipart
  // file upload (file-storage.ts). The same validation (blocked
  // filenames, allowed MIME types, size ceiling) still runs, now via
  // document-attachments.ts's validateFileType/validateFileSize/
  // isBlockedFileName, already covered by that module's own tests.
});
