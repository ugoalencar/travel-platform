import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import type { DatabaseRuntime } from '../src/database';
import { registerErrorHandler } from '../src/errors';
import { registerBackupRoutes } from '../src/routes/backup';

const apps: FastifyInstance[] = [];
async function makeApp(role: UserRole) {
  const query = vi.fn(() => Promise.resolve({ rows: [] }));
  const database = { withTenantTransaction: vi.fn((operation: (client: { query: typeof query }) => Promise<unknown>) => operation({ query })) } as unknown as DatabaseRuntime;
  const app = Fastify(); apps.push(app); registerErrorHandler(app);
  app.addHook('onRequest', (_request, _reply, done) => runWithTenantContext({ agencyId: 'agency-1', userId: 'user-1', userRole: role, email: 'test@example.invalid' }, done));
  registerBackupRoutes(app, { database, protectedHooks: [] });
  await app.ready();
  return { app, query };
}

afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

describe('managed backup HTTP routes', () => {
  it('enforces exact OWNER before schedule or run actions', async () => {
    const { app, query } = await makeApp(UserRole.MANAGER);
    const schedule = await app.inject({ method: 'PUT', url: '/settings/backup/schedule', payload: { enabled: true } });
    const download = await app.inject({ method: 'POST', url: '/settings/backup/runs/00000000-0000-4000-8000-000000000001/download', payload: {} });
    expect(schedule.statusCode).toBe(403);
    expect(download.statusCode).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects invalid timezones and missing step-up password without database access', async () => {
    const { app, query } = await makeApp(UserRole.OWNER);
    const invalidTimezone = await app.inject({ method: 'PUT', url: '/settings/backup/schedule', payload: { enabled: true, dailyTime: '02:00', timezone: 'Not/AZone', currentPassword: 'password' } });
    const noPassword = await app.inject({ method: 'PUT', url: '/settings/backup/schedule', payload: { enabled: false, dailyTime: '02:00', timezone: 'UTC' } });
    expect(invalidTimezone.statusCode).toBe(400);
    expect(noPassword.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});
