/**
 * HTTP coverage for GET /customers/lookup (Onda A, Frente 1).
 *
 * Runs Fastify `inject` against a real `buildApp` with the scripted in-memory
 * database, so routing, auth, role gate and error mapping are the real ones.
 * The SQL matching itself is asserted through the parameters the route binds
 * (agency id, normalized CPF, name pattern, limit); the database-level
 * behaviour is covered by the Travel Lite container suite, which runs the same
 * matching against real PostgreSQL.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { IncomingHttpHeaders } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../src/auth';
import { MockOcrProvider } from '../src/ocr-provider';
import { AGENCY_A, AGENCY_B, USER_A, createFakeDatabase, type FakeDatabase } from './helpers/fake-database';

const principalA: AuthenticatedPrincipal = {
  userId: USER_A,
  agencyId: AGENCY_A,
  role: UserRole.VIEWER,
  email: 'viewer-a@example.test',
};

// Role value that is not in ROLE_HIERARCHY: requireRole() must fail closed.
const principalWithoutReadAccess: AuthenticatedPrincipal = {
  userId: '11000000-0000-4000-8000-000000000009',
  agencyId: AGENCY_A,
  role: 'NOT_A_REAL_ROLE' as UserRole,
  email: 'no-access-a@example.test',
};

const knownPrincipals = [principalA, principalWithoutReadAccess];

const CUSTOMER_ROWS = [
  {
    id: '12000000-0000-4000-8000-000000000001',
    agency_id: AGENCY_A,
    name: 'Ana Souza',
    cpf: '529.982.247-25',
    birth_date: '1990-05-01',
    status: 'ACTIVE',
    email: 'ana@example.test',
    phone: '+5511999990000',
  },
  {
    id: '12000000-0000-4000-8000-000000000002',
    agency_id: AGENCY_A,
    name: 'João Silva',
    cpf: null,
    birth_date: null,
    status: 'ACTIVE',
    email: null,
    phone: null,
  },
  {
    id: '22000000-0000-4000-8000-000000000001',
    agency_id: AGENCY_B,
    name: 'Ana de Outra Agência',
    cpf: '52998224725',
    birth_date: '1985-02-03',
    status: 'ACTIVE',
    email: 'outra@example.test',
    phone: null,
  },
];

/**
 * Simulates the tenant filter: the route must bind the caller's agency as the
 * first parameter, and the fake returns only rows of that agency. A route that
 * bound a client-supplied agency would leak rows here.
 */
let readRestrictedForViewer = false;

function responder(query: { text: string; values: unknown[] }): Record<string, unknown>[] | undefined {
  if (query.text.includes('FROM permission_restrictions')) {
    return readRestrictedForViewer ? [{ id: '33000000-0000-4000-8000-000000000001' }] : [];
  }
  if (!query.text.includes('FROM customers')) return undefined;
  const agencyId = query.values[0];
  return CUSTOMER_ROWS.filter((row) => row.agency_id === agencyId);
}

function buildTestApp(database: FakeDatabase): FastifyInstance {
  return buildApp({
    authProvider: {
      authenticate: (request: { headers: IncomingHttpHeaders }) => {
        const userId = request.headers['x-dev-user-id'];
        return Promise.resolve(knownPrincipals.find((p) => p.userId === userId) ?? null);
      },
    },
    validateUserAgencyAccess: (userId: string, agencyId: string) =>
      Promise.resolve(knownPrincipals.some((p) => p.userId === userId && p.agencyId === agencyId)),
    database,
    ocrProvider: new MockOcrProvider(),
  });
}

function headersFor(principal: AuthenticatedPrincipal): Record<string, string> {
  return {
    'x-dev-user-id': principal.userId,
    'x-dev-agency-id': principal.agencyId,
    'x-dev-role': principal.role,
  };
}

interface LookupBody {
  items: Array<Record<string, unknown>>;
}

let database: FakeDatabase;
let app: FastifyInstance;

beforeAll(async () => {
  database = createFakeDatabase(responder);
  app = buildTestApp(database);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

function lookup(query: string, principal: AuthenticatedPrincipal = principalA) {
  return app.inject({
    method: 'GET',
    url: `/customers/lookup?${query}`,
    headers: headersFor(principal),
  });
}

function lastLookupQuery() {
  const matches = database.find('FROM customers').filter((q) => q.text.includes('LIMIT'));
  const last = matches[matches.length - 1];
  if (!last) throw new Error('lookup query was not issued');
  return last;
}

describe('GET /customers/lookup (Onda A, Frente 1)', () => {
  it('matches a partial name with a case-insensitive contains pattern and returns the minimal shape', async () => {
    const response = await lookup('q=joa');

    expect(response.statusCode).toBe(200);
    const body = response.json<LookupBody>();
    expect(body.items.length).toBeGreaterThan(0);

    const query = lastLookupQuery();
    expect(query.text).toMatch(/ILIKE/);
    expect(query.values).toContain('%joa%');

    for (const item of body.items) {
      expect(Object.keys(item).sort()).toEqual(['birth_date', 'cpf_masked', 'id', 'name', 'status']);
    }
  });

  it('never returns the raw CPF, e-mail or phone; the CPF comes masked', async () => {
    const response = await lookup('q=Ana');
    const serialized = response.body;

    expect(response.statusCode).toBe(200);
    expect(serialized).toContain('"cpf_masked":"***.982.247-**"');
    expect(serialized).not.toContain('52998224725');
    expect(serialized).not.toContain('529.982.247-25');
    expect(serialized).not.toContain('ana@example.test');
    expect(serialized).not.toContain('+5511999990000');
  });

  it('does not return customers of another agency, and binds only the session agency', async () => {
    const response = await lookup('q=Ana');

    const body = response.json<LookupBody>();
    expect(body.items.map((item) => item.id)).not.toContain('22000000-0000-4000-8000-000000000001');
    expect(response.body).not.toContain('Outra Agência');
    expect(lastLookupQuery().values[0]).toBe(AGENCY_A);
  });

  it('searches a CPF typed with the mask by its normalized digits', async () => {
    const response = await lookup('q=529.982.247-25');

    expect(response.statusCode).toBe(200);
    const query = lastLookupQuery();
    expect(query.values).toContain('52998224725');
    expect(query.text).not.toMatch(/ILIKE/);
  });

  it('searches a CPF typed as plain digits the same way', async () => {
    const response = await lookup('q=52998224725');

    expect(response.statusCode).toBe(200);
    expect(lastLookupQuery().values).toContain('52998224725');
  });

  it('searches a CPF pasted with surrounding and inner spaces', async () => {
    const response = await lookup('q=%20%20529%20982%20247%2025%20%20');

    expect(response.statusCode).toBe(200);
    expect(lastLookupQuery().values).toContain('52998224725');
  });

  it('rejects a query shorter than two characters with 400 and issues no query', async () => {
    const before = database.queries.length;

    const response = await lookup('q=a');

    expect(response.statusCode).toBe(400);
    expect(database.queries.length).toBe(before);
  });

  it('rejects a missing q with 400', async () => {
    const response = await lookup('limit=5');

    expect(response.statusCode).toBe(400);
  });

  it('clamps the limit to 20 and defaults it to 10', async () => {
    await lookup('q=Ana&limit=500');
    expect(lastLookupQuery().values).toContain(20);

    await lookup('q=Ana');
    expect(lastLookupQuery().values).toContain(10);
  });

  it('rejects a non-numeric limit with 400', async () => {
    const response = await lookup('q=Ana&limit=muitos');

    expect(response.statusCode).toBe(400);
  });

  it('returns 403 to a user without a valid read role', async () => {
    const response = await lookup('q=Ana', principalWithoutReadAccess);

    expect(response.statusCode).toBe(403);
  });

  it('returns 403 to a valid role whose customer read is restricted for the agency, and issues no lookup', async () => {
    readRestrictedForViewer = true;
    const before = database.queries.length;
    try {
      const response = await lookup('q=Ana');

      expect(response.statusCode).toBe(403);
      expect(database.queries.slice(before).some((q) => q.text.includes('FROM customers'))).toBe(false);
    } finally {
      readRestrictedForViewer = false;
    }
  });
});
