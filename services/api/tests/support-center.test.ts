/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import type { DatabaseRuntime } from '../src/database';
import { UserRole, PlatformUserRole } from '../../../packages/domain/types';

// Captures the calls a mock database receives so tests can assert exactly
// what was written server-side, independent of what the client sent.
function buildRecordingDatabase() {
  const platformInserts: Array<{ text: string; values: readonly unknown[] }> = [];

  const database = {
    withTenantTransaction: () => Promise.reject(new Error('agency ticket path must use platform transaction')),
    withPlatformTransaction: (operation: any) => {
      const client = {
        query: (text: string, values: readonly unknown[] = []) => {
          platformInserts.push({ text, values });
          if (/INSERT INTO support_cases/.test(text)) {
            return Promise.resolve({ rows: [{ id: 'case-1' }] });
          }
          if (/SELECT[\s\S]*FROM support_cases/.test(text)) {
            return Promise.resolve({
              rows: [
                {
                  id: 'case-1',
                  subscriberTenantId: null,
                  subscriberTenantName: null,
                  agencyId: values[0] ?? 'agency-1',
                  createdByUserId: 'user-1',
                  source: 'AGENCY',
                  route: '/trips',
                  appVersion: '1.0.0',
                  buildSha: 'abc123',
                  browser: 'Chrome',
                  requestId: 'req-xyz',
                  correlationId: 'req-xyz',
                  title: 'Cannot see trip',
                  description: 'Trip disappeared',
                  status: 'OPEN',
                  priority: 'MEDIUM',
                  assignedToId: null,
                  assignedToEmail: null,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              ],
            });
          }
          if (/INSERT INTO support_access_log/.test(text)) {
            return Promise.resolve({
              rows: [
                {
                  id: 'session-1',
                  supportUserId: values[0],
                  tenantId: values[1],
                  reason: values[2],
                  durationMinutes: values[3],
                  readOnly: values[4],
                  accessStart: new Date(),
                  expiresAt: new Date(),
                  accessEnd: null,
                },
              ],
            });
          }
          if (/UPDATE support_access_log/.test(text)) {
            return Promise.resolve({
              rows: [
                {
                  id: values[0],
                  supportUserId: 'platform-user-1',
                  tenantId: 'tenant-1',
                  reason: 'investigate ticket #1',
                  durationMinutes: 30,
                  readOnly: true,
                  accessStart: new Date(),
                  expiresAt: new Date(),
                  accessEnd: new Date(),
                },
              ],
            });
          }
          return Promise.resolve({ rows: [] });
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      return Promise.resolve(operation(client));
    },
  } as unknown as DatabaseRuntime;

  return { database, platformInserts };
}

function buildTestApp(database: DatabaseRuntime) {
  return buildApp({
    authProvider: {
      authenticate: (request) =>
        Promise.resolve(
          request.headers['x-test-user'] === 'agency-user-1'
            ? {
                userId: 'agency-user-1',
                agencyId: 'agency-1',
                role: UserRole.AGENT,
                email: 'agent@example.test',
              }
            : null
        ),
    },
    validateUserAgencyAccess: () => Promise.resolve(true),
    database,
    platformAuthProvider: {
      authenticate(request) {
        return Promise.resolve(
          request.headers['x-test-platform-user'] === 'platform-user-1'
            ? {
                platformUserId: 'platform-user-1',
                role: PlatformUserRole.PLATFORM_ADMIN,
                email: 'platform-admin@example.test',
              }
            : null
        );
      },
    },
    rateLimit: {
      classLimits: {
        SYSTEM_INTERNAL: { windowMs: 60_000, max: 1000 },
        STAFF_WRITE: { windowMs: 60_000, max: 1000 },
      },
    },
  });
}

describe('POST /support/tickets (agency ticket capture)', () => {
  it('captures agencyId/userId/requestId server-side, ignoring any client-supplied override', async () => {
    const { database, platformInserts } = buildRecordingDatabase();
    const app = buildTestApp(database);

    const response = await app.inject({
      method: 'POST',
      url: '/support/tickets',
      headers: {
        'x-test-user': 'agency-user-1',
        'x-request-id': 'req-xyz',
      },
      payload: {
        title: 'Cannot see trip',
        description: 'Trip disappeared',
        route: '/trips',
        appVersion: '1.0.0',
        buildSha: 'abc123',
        browser: 'Chrome',
        // Attempted spoofing -- must be ignored.
        agencyId: 'attacker-agency',
        userId: 'attacker-user',
        requestId: 'attacker-req',
      },
    });

    expect(response.statusCode).toBe(201);

    const insertCall = platformInserts.find((c) => /INSERT INTO support_cases/.test(c.text));
    expect(insertCall).toBeTruthy();
    // agency_id, created_by_user_id, request_id, correlation_id are
    // positional params 1-4 in the INSERT -- assert the server-derived
    // values won, not the attacker-supplied body fields.
    expect(insertCall!.values[0]).toBe('agency-1');
    expect(insertCall!.values[1]).toBe('agency-user-1');
    expect(insertCall!.values[2]).toBe('req-xyz');

    await app.close();
  });

  it('rejects a ticket with no title/description', async () => {
    const { database } = buildRecordingDatabase();
    const app = buildTestApp(database);

    const response = await app.inject({
      method: 'POST',
      url: '/support/tickets',
      headers: { 'x-test-user': 'agency-user-1' },
      payload: { title: '', description: '' },
    });

    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('requires authentication', async () => {
    const { database } = buildRecordingDatabase();
    const app = buildTestApp(database);

    const response = await app.inject({
      method: 'POST',
      url: '/support/tickets',
      payload: { title: 'x', description: 'y' },
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });
});

describe('Support Session (audited view-as-tenant)', () => {
  it('requires platform authentication to open a session', async () => {
    const { database } = buildRecordingDatabase();
    const app = buildTestApp(database);

    const response = await app.inject({
      method: 'POST',
      url: '/platform/support-sessions',
      payload: { tenantId: 'tenant-1', reason: 'investigate ticket #1' },
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('opens a session and writes an audit row with support_user_id/tenant/reason/duration/read_only', async () => {
    const { database, platformInserts } = buildRecordingDatabase();
    const app = buildTestApp(database);

    const response = await app.inject({
      method: 'POST',
      url: '/platform/support-sessions',
      headers: { 'x-test-platform-user': 'platform-user-1' },
      payload: { tenantId: 'tenant-1', reason: 'investigate ticket #1', durationMinutes: 45 },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{ session: { readOnly: boolean; durationMinutes: number } }>();
    expect(body.session.readOnly).toBe(true); // default
    expect(body.session.durationMinutes).toBe(45);

    const insertCall = platformInserts.find((c) => /INSERT INTO support_access_log/.test(c.text));
    expect(insertCall).toBeTruthy();
    expect(insertCall!.values).toEqual([
      'platform-user-1', // support_user_id -- from the authenticated platform principal
      'tenant-1',
      'investigate ticket #1',
      45,
      true,
      expect.any(String), // ip address set by fastify inject
      expect.any(String), // user-agent set by fastify inject
    ]);

    await app.close();
  });

  it('rejects opening a session with no reason', async () => {
    const { database } = buildRecordingDatabase();
    const app = buildTestApp(database);

    const response = await app.inject({
      method: 'POST',
      url: '/platform/support-sessions',
      headers: { 'x-test-platform-user': 'platform-user-1' },
      payload: { tenantId: 'tenant-1', reason: '   ' },
    });

    expect(response.statusCode).toBe(500);

    await app.close();
  });

  it('ends a session, writing access_end to the audit row', async () => {
    const { database, platformInserts } = buildRecordingDatabase();
    const app = buildTestApp(database);

    const response = await app.inject({
      method: 'PATCH',
      url: '/platform/support-sessions/session-1/end',
      headers: { 'x-test-platform-user': 'platform-user-1' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ session: { accessEnd: string | null } }>();
    expect(body.session.accessEnd).toBeTruthy();

    const updateCall = platformInserts.find((c) => /UPDATE support_access_log/.test(c.text));
    expect(updateCall).toBeTruthy();

    await app.close();
  });
});
