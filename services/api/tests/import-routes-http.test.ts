import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app';
import type { AuthenticatedPrincipal } from '../src/auth';
import type { DatabaseRuntime } from '../src/database';
import * as importService from '../src/import/service';
import { MAX_IMPORT_ROWS } from '../src/import/types';
import { UserRole } from '../../../packages/domain/types';

// Wrap every service function so tests can stub a single call while the
// default behaviour stays the real implementation (used for error mapping).
vi.mock('../src/import/service', async (importOriginal) => {
  const actual = await importOriginal<typeof importService>();
  return {
    ...actual,
    createImportJob: vi.fn(actual.createImportJob),
    parseImportFile: vi.fn(actual.parseImportFile),
    dryRunImport: vi.fn(actual.dryRunImport),
    executeImport: vi.fn(actual.executeImport),
    cancelImport: vi.fn(actual.cancelImport),
    listImportJobs: vi.fn(actual.listImportJobs),
    getImportJobById: vi.fn(actual.getImportJobById),
  };
});

const JOB_ID = '3f2c1a9e-8b7d-4c6e-9a10-5d4e3f2a1b0c';
const AGENCY_A = 'agency-a';

interface Route {
  method: 'GET' | 'POST';
  url: string;
  payload?: unknown;
  write: boolean;
}

const JSON_ROUTES: Route[] = [
  {
    method: 'POST',
    url: '/api/import/upload',
    payload: { entityType: 'CUSTOMER', originalFilename: 'clientes.csv', storageKey: 'imports/x.csv' },
    write: true,
  },
  {
    method: 'POST',
    url: `/api/import/${JOB_ID}/parse`,
    payload: { fileContent: Buffer.from('name\nAna').toString('base64'), originalFilename: 'clientes.csv' },
    write: true,
  },
  {
    method: 'POST',
    url: `/api/import/${JOB_ID}/validate`,
    payload: { mapping: { name: 'name' }, parsedRows: [{ rowNumber: 2, data: { name: 'Ana' } }] },
    write: true,
  },
  {
    method: 'POST',
    url: `/api/import/${JOB_ID}/confirm`,
    payload: { parsedRows: [{ rowNumber: 2, data: { name: 'Ana' } }] },
    write: true,
  },
  { method: 'POST', url: `/api/import/${JOB_ID}/cancel`, payload: {}, write: true },
  { method: 'GET', url: '/api/import/jobs', write: false },
  { method: 'GET', url: `/api/import/${JOB_ID}`, write: false },
];

const WRITE_ROUTES = JSON_ROUTES.filter((route) => route.write);
const READ_ROUTES = JSON_ROUTES.filter((route) => !route.write);

function principalFor(role: UserRole, agencyId = AGENCY_A): AuthenticatedPrincipal {
  return { userId: `user-${role.toLowerCase()}`, agencyId, role, email: `${role.toLowerCase()}@test.example` };
}

interface BuildOptions {
  rows?: unknown[];
  agencyAccess?: boolean;
}

function buildTestApp(options: BuildOptions = {}) {
  const query = vi.fn(() => Promise.resolve({ rows: options.rows ?? [], rowCount: (options.rows ?? []).length }));
  const withTenantTransaction = vi.fn((operation: (client: unknown) => unknown) =>
    Promise.resolve(operation({ query })),
  );
  const database = {
    withTenantTransaction,
    withPlatformTransaction: () => Promise.resolve([]),
  } as unknown as DatabaseRuntime;

  const app = buildApp({
    authProvider: {
      authenticate(request) {
        const role = request.headers['x-test-role'];
        return Promise.resolve(typeof role === 'string' ? principalFor(role as UserRole) : null);
      },
    },
    validateUserAgencyAccess: () => Promise.resolve(options.agencyAccess ?? true),
    database,
    rateLimit: {
      classLimits: { SYSTEM_INTERNAL: { windowMs: 60_000, max: 1_000 } },
    },
  });

  return { app, withTenantTransaction, query };
}

function multipartBody(boundary: string): string {
  return [
    `--${boundary}`,
    'Content-Disposition: form-data; name="entityType"',
    '',
    'CUSTOMER',
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="clientes.csv"',
    'Content-Type: text/csv',
    '',
    'name\nAna',
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('import routes: authentication', () => {
  it('returns 401 on every import route without a session', async () => {
    const { app, withTenantTransaction } = buildTestApp();

    for (const route of JSON_ROUTES) {
      const response = await app.inject({
        method: route.method,
        url: route.url,
        ...(route.payload === undefined ? {} : { payload: route.payload as object }),
      });

      expect(response.statusCode, `${route.method} ${route.url}`).toBe(401);
      expect(response.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    }

    expect(withTenantTransaction).not.toHaveBeenCalled();
    await app.close();
  });

  it('does not read an anonymous multipart upload', async () => {
    const { app, withTenantTransaction } = buildTestApp();
    const boundary = '----px1boundary';

    const response = await app.inject({
      method: 'POST',
      url: '/api/import/upload',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody(boundary),
    });

    expect(response.statusCode).toBe(401);
    expect(importService.createImportJob).not.toHaveBeenCalled();
    expect(withTenantTransaction).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects a session whose user has no access to the agency', async () => {
    const { app, withTenantTransaction } = buildTestApp({ agencyAccess: false });

    const response = await app.inject({
      method: 'GET',
      url: '/api/import/jobs',
      headers: { 'x-test-role': UserRole.ADMIN },
    });

    expect(response.statusCode).toBe(403);
    expect(withTenantTransaction).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('import routes: authorization by role', () => {
  it.each([UserRole.VIEWER, UserRole.AGENT])('forbids %s from import writes', async (role) => {
    const { app, withTenantTransaction } = buildTestApp();

    for (const route of WRITE_ROUTES) {
      const response = await app.inject({
        method: route.method,
        url: route.url,
        headers: { 'x-test-role': role },
        payload: route.payload as object,
      });

      expect(response.statusCode, `${role} ${route.url}`).toBe(403);
      expect(response.json()).toMatchObject({ code: 'FORBIDDEN' });
    }

    expect(withTenantTransaction).not.toHaveBeenCalled();
    await app.close();
  });

  it('forbids VIEWER and AGENT from import reads', async () => {
    const { app } = buildTestApp();

    for (const role of [UserRole.VIEWER, UserRole.AGENT]) {
      for (const route of READ_ROUTES) {
        const response = await app.inject({
          method: route.method,
          url: route.url,
          headers: { 'x-test-role': role },
        });
        expect(response.statusCode, `${role} ${route.url}`).toBe(403);
      }
    }
    await app.close();
  });

  it('forbids MANAGER from import writes but allows reads', async () => {
    const { app } = buildTestApp({
      rows: [{ id: JOB_ID, agencyId: AGENCY_A, count: '1' }],
    });

    for (const route of WRITE_ROUTES) {
      const response = await app.inject({
        method: route.method,
        url: route.url,
        headers: { 'x-test-role': UserRole.MANAGER },
        payload: route.payload as object,
      });
      expect(response.statusCode, `MANAGER ${route.url}`).toBe(403);
    }

    for (const route of READ_ROUTES) {
      const response = await app.inject({
        method: route.method,
        url: route.url,
        headers: { 'x-test-role': UserRole.MANAGER },
      });
      expect(response.statusCode, `MANAGER ${route.url}`).toBe(200);
    }
    await app.close();
  });

  it.each([UserRole.ADMIN, UserRole.OWNER])('allows %s to run the import flow', async (role) => {
    const { app } = buildTestApp();
    const headers = { 'x-test-role': role };

    vi.mocked(importService.createImportJob).mockResolvedValueOnce({ jobId: JOB_ID, status: 'UPLOADED' } as never);
    vi.mocked(importService.parseImportFile).mockResolvedValueOnce({ totalRows: 1 } as never);
    vi.mocked(importService.dryRunImport).mockResolvedValueOnce({ totalRows: 1 } as never);
    vi.mocked(importService.executeImport).mockResolvedValueOnce({ createdRows: 1 } as never);
    vi.mocked(importService.cancelImport).mockResolvedValueOnce(undefined);

    const expected = [201, 200, 200, 200, 200];
    for (const [index, route] of WRITE_ROUTES.entries()) {
      const response = await app.inject({
        method: route.method,
        url: route.url,
        headers,
        payload: route.payload as object,
      });
      expect(response.statusCode, `${role} ${route.url}`).toBe(expected[index]);
    }
    await app.close();
  });

  it('accepts an authenticated multipart upload', async () => {
    const { app } = buildTestApp();
    const boundary = '----px1boundary';
    vi.mocked(importService.createImportJob).mockResolvedValueOnce({ jobId: JOB_ID, status: 'UPLOADED' } as never);

    const response = await app.inject({
      method: 'POST',
      url: '/api/import/upload',
      headers: {
        'x-test-role': UserRole.ADMIN,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: multipartBody(boundary),
    });

    expect(response.statusCode).toBe(201);
    expect(importService.createImportJob).toHaveBeenCalledTimes(1);
    await app.close();
  });
});

describe('import routes: error handling', () => {
  it('never echoes internal error messages on 500', async () => {
    const { app } = buildTestApp();
    vi.mocked(importService.listImportJobs).mockRejectedValueOnce(new Error('boom: secret detail'));
    vi.mocked(importService.cancelImport).mockRejectedValueOnce(new Error('boom: secret detail'));
    vi.mocked(importService.createImportJob).mockRejectedValueOnce(new Error('boom: secret detail'));

    const calls = [
      { method: 'GET' as const, url: '/api/import/jobs' },
      { method: 'POST' as const, url: `/api/import/${JOB_ID}/cancel`, payload: {} },
      {
        method: 'POST' as const,
        url: '/api/import/upload',
        payload: { entityType: 'CUSTOMER', originalFilename: 'a.csv', storageKey: 'k' },
      },
    ];

    for (const call of calls) {
      const response = await app.inject({
        ...call,
        headers: { 'x-test-role': UserRole.ADMIN },
      });
      expect(response.statusCode, call.url).toBe(500);
      expect(response.json()).toEqual({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
      expect(response.body).not.toContain('boom');
    }
    await app.close();
  });

  it('maps user errors to 4xx without echoing the job id', async () => {
    const missing = buildTestApp({ rows: [] });
    const notFound = await missing.app.inject({
      method: 'POST',
      url: `/api/import/${JOB_ID}/confirm`,
      headers: { 'x-test-role': UserRole.ADMIN },
      payload: { parsedRows: [{ rowNumber: 2, data: { name: 'Ana' } }] },
    });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.body).not.toContain(JOB_ID);
    await missing.app.close();

    const wrongState = buildTestApp({ rows: [{ id: JOB_ID, status: 'UPLOADED', entityType: 'CUSTOMER' }] });
    const conflict = await wrongState.app.inject({
      method: 'POST',
      url: `/api/import/${JOB_ID}/confirm`,
      headers: { 'x-test-role': UserRole.ADMIN },
      payload: { parsedRows: [{ rowNumber: 2, data: { name: 'Ana' } }] },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ code: 'CONFLICT' });
    await wrongState.app.close();
  });

  it('returns 404 for a missing job on GET without echoing the id', async () => {
    const { app } = buildTestApp({ rows: [] });
    const response = await app.inject({
      method: 'GET',
      url: `/api/import/${JOB_ID}`,
      headers: { 'x-test-role': UserRole.MANAGER },
    });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain(JOB_ID);
    await app.close();
  });
});

describe('import routes: input validation', () => {
  const admin = { 'x-test-role': UserRole.ADMIN };

  it('rejects malformed input before the service or the database', async () => {
    const { app, withTenantTransaction } = buildTestApp();
    const validRow = { rowNumber: 2, data: { name: 'Ana' } };

    const cases: { name: string; method: 'GET' | 'POST'; url: string; payload?: unknown }[] = [
      { name: 'jobId is not a UUID (cancel)', method: 'POST', url: '/api/import/job-1/cancel', payload: {} },
      { name: 'jobId is not a UUID (get)', method: 'GET', url: '/api/import/job-1' },
      {
        name: 'entityType outside the supported list',
        method: 'POST',
        url: '/api/import/upload',
        payload: { entityType: 'WISH', originalFilename: 'a.csv', storageKey: 'k' },
      },
      {
        name: 'filename with a path separator',
        method: 'POST',
        url: '/api/import/upload',
        payload: { entityType: 'CUSTOMER', originalFilename: '../a.csv', storageKey: 'k' },
      },
      {
        name: 'xlsx extension',
        method: 'POST',
        url: '/api/import/upload',
        payload: { entityType: 'CUSTOMER', originalFilename: 'a.xlsx', storageKey: 'k' },
      },
      {
        name: 'sourceSystem too long',
        method: 'POST',
        url: '/api/import/upload',
        payload: { entityType: 'CUSTOMER', originalFilename: 'a.csv', storageKey: 'k', sourceSystem: 'x'.repeat(101) },
      },
      { name: 'limit is not a number', method: 'GET', url: '/api/import/jobs?limit=abc' },
      { name: 'limit above 100', method: 'GET', url: '/api/import/jobs?limit=101' },
      { name: 'negative offset', method: 'GET', url: '/api/import/jobs?offset=-1' },
      { name: 'unknown entityType filter', method: 'GET', url: '/api/import/jobs?entityType=USERS' },
      {
        name: 'invalid base64 content',
        method: 'POST',
        url: `/api/import/${JOB_ID}/parse`,
        payload: { fileContent: '%%%not-base64%%%', originalFilename: 'a.csv' },
      },
      {
        name: 'parse filename with extension other than csv/tsv',
        method: 'POST',
        url: `/api/import/${JOB_ID}/parse`,
        payload: { fileContent: Buffer.from('a').toString('base64'), originalFilename: 'a.xlsx' },
      },
      {
        name: 'mapping with a non-string value',
        method: 'POST',
        url: `/api/import/${JOB_ID}/validate`,
        payload: { mapping: { name: 1 }, parsedRows: [validRow] },
      },
      {
        name: 'parsedRows is not an array',
        method: 'POST',
        url: `/api/import/${JOB_ID}/validate`,
        payload: { mapping: { name: 'name' }, parsedRows: 'x' },
      },
      {
        name: 'parsedRows item without a valid rowNumber',
        method: 'POST',
        url: `/api/import/${JOB_ID}/confirm`,
        payload: { parsedRows: [{ rowNumber: 'two', data: { name: 'Ana' } }] },
      },
      {
        name: 'parsedRows item with non-string data',
        method: 'POST',
        url: `/api/import/${JOB_ID}/confirm`,
        payload: { parsedRows: [{ rowNumber: 2, data: { name: { nested: true } } }] },
      },
    ];

    for (const testCase of cases) {
      const response = await app.inject({
        method: testCase.method,
        url: testCase.url,
        headers: admin,
        ...(testCase.payload === undefined ? {} : { payload: testCase.payload as object }),
      });
      expect(response.statusCode, testCase.name).toBe(400);
      expect(response.json(), testCase.name).toMatchObject({ code: 'VALIDATION_ERROR' });
    }

    expect(withTenantTransaction).not.toHaveBeenCalled();
    await app.close();
  });

  it(`rejects more than ${MAX_IMPORT_ROWS} rows on validate and confirm`, async () => {
    const { app, withTenantTransaction } = buildTestApp();
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, index) => ({
      rowNumber: index + 2,
      data: { n: 'a' },
    }));

    const validate = await app.inject({
      method: 'POST',
      url: `/api/import/${JOB_ID}/validate`,
      headers: admin,
      payload: { mapping: { n: 'name' }, parsedRows: rows },
    });
    const confirm = await app.inject({
      method: 'POST',
      url: `/api/import/${JOB_ID}/confirm`,
      headers: admin,
      payload: { parsedRows: rows },
    });

    // The global 2 MiB body limit may answer first (413); either way the
    // request must not reach the database.
    expect([400, 413]).toContain(validate.statusCode);
    expect([400, 413]).toContain(confirm.statusCode);
    expect(withTenantTransaction).not.toHaveBeenCalled();
    await app.close();
  });

  it('keeps F-03: a poisoned mapping is rejected before any transaction (authenticated)', async () => {
    const { app, withTenantTransaction } = buildTestApp();

    const response = await app.inject({
      method: 'POST',
      url: `/api/import/${JOB_ID}/validate`,
      headers: admin,
      payload: { mapping: { Funcao: 'role' }, parsedRows: [{ rowNumber: 2, data: { Funcao: 'ADMIN' } }] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(withTenantTransaction).not.toHaveBeenCalled();
    await app.close();
  });
});
