import { describe, it, expect, vi } from 'vitest';
import { UserRole } from '../../packages/domain/types';
import {
  createTenantContextHook,
  ForbiddenError,
  getAgencyId,
  getOptionalTenantContext,
  getTenantContext,
  getUserId,
  runWithTenantContext,
  TenantError,
  validateResourceOwnership,
} from '../../packages/domain/tenant-context';
import { tenantQuery, tenantWhere } from '../../packages/domain/tenant-scoped-queries';

const agencyAId = 'agency-a-0000-0000-000000000001';
const agencyBId = 'agency-b-0000-0000-000000000002';
const userAId = 'user-a-0000-0000-000000000001';
const userBId = 'user-b-0000-0000-000000000002';

function tenantContext(agencyId = agencyAId, userId = userAId) {
  return {
    agencyId,
    userId,
    userRole: UserRole.ADMIN,
    email: 'user@example.com',
  };
}

describe('Tenant Isolation', () => {
  describe('tenant context storage', () => {
    it('throws when tenant context is required but absent', () => {
      expect(() => getAgencyId()).toThrow(TenantError);
      expect(() => getTenantContext()).toThrow('No tenant context available');
      expect(getOptionalTenantContext()).toBeUndefined();
    });

    it('returns agencyId and userId from the active context', () => {
      runWithTenantContext(tenantContext(), () => {
        expect(getAgencyId()).toBe(agencyAId);
        expect(getUserId()).toBe(userAId);
        expect(getTenantContext()).toEqual(tenantContext());
      });
    });

    it('propagates context through async execution', async () => {
      await runWithTenantContext(tenantContext(), async () => {
        await Promise.resolve();

        expect(getAgencyId()).toBe(agencyAId);
        expect(getUserId()).toBe(userAId);
      });
    });

    it('isolates concurrent async executions', async () => {
      const [contextA, contextB] = await Promise.all([
        runWithTenantContext(tenantContext(agencyAId, userAId), async () => {
          await new Promise((resolve) => {
            setTimeout(resolve, 5);
          });
          return getTenantContext();
        }),
        runWithTenantContext(tenantContext(agencyBId, userBId), async () => {
          await Promise.resolve();
          return getTenantContext();
        }),
      ]);

      expect(contextA.agencyId).toBe(agencyAId);
      expect(contextA.userId).toBe(userAId);
      expect(contextB.agencyId).toBe(agencyBId);
      expect(contextB.userId).toBe(userBId);
      expect(getOptionalTenantContext()).toBeUndefined();
    });

    it('rejects empty tenant identifiers', () => {
      expect(() => {
        runWithTenantContext(tenantContext('', userAId), () => undefined);
      }).toThrow(TenantError);

      expect(() => {
        runWithTenantContext(tenantContext(agencyAId, ''), () => undefined);
      }).toThrow(TenantError);
    });
  });

  describe('Fastify tenant hook', () => {
    it('creates context from trusted auth payload and injected access validation', async () => {
      const validateUserAgencyAccess = vi.fn().mockResolvedValue(true);
      const hook = createTenantContextHook({ validateUserAgencyAccess });
      const done = vi.fn();
      const reply = createReply();

      hook(
        {
          auth: {
            sub: userAId,
            agency_id: agencyAId,
            role: UserRole.ADMIN,
            email: 'user@example.com',
          },
        },
        reply,
        done,
      );
      await flushHook();

      expect(validateUserAgencyAccess).toHaveBeenCalledWith(userAId, agencyAId);
      expect(done).toHaveBeenCalledOnce();
      expect(reply.statusCode).toBeUndefined();
    });

    it('does not trust agencyId sent outside the authenticated payload', async () => {
      const validateUserAgencyAccess = vi.fn().mockResolvedValue(true);
      const hook = createTenantContextHook({ validateUserAgencyAccess });
      const done = vi.fn();
      const reply = createReply();

      hook(
        {
          body: { agencyId: agencyBId },
          auth: {
            sub: userAId,
            agency_id: agencyAId,
            role: UserRole.ADMIN,
            email: 'user@example.com',
          },
        },
        reply,
        done,
      );
      await flushHook();

      expect(validateUserAgencyAccess).toHaveBeenCalledWith(userAId, agencyAId);
      expect(validateUserAgencyAccess).not.toHaveBeenCalledWith(userAId, agencyBId);
      expect(done).toHaveBeenCalledOnce();
    });

    it('returns unauthorized when auth payload is missing', async () => {
      const hook = createTenantContextHook({
        validateUserAgencyAccess: vi.fn().mockResolvedValue(true),
      });
      const done = vi.fn();
      const reply = createReply();

      hook({}, reply, done);
      await flushHook();

      expect(done).not.toHaveBeenCalled();
      expect(reply.statusCode).toBe(401);
      expect(reply.payload).toEqual({
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      });
    });

    it('returns forbidden when access validator rejects the agency', async () => {
      const hook = createTenantContextHook({
        validateUserAgencyAccess: vi.fn().mockResolvedValue(false),
      });
      const done = vi.fn();
      const reply = createReply();

      hook(
        {
          auth: {
            sub: userAId,
            agency_id: agencyAId,
            role: UserRole.ADMIN,
            email: 'user@example.com',
          },
        },
        reply,
        done,
      );
      await flushHook();

      expect(done).not.toHaveBeenCalled();
      expect(reply.statusCode).toBe(403);
      expect(reply.payload).toEqual({
        error: 'User does not belong to this agency',
        code: 'FORBIDDEN',
      });
    });
  });

  describe('tenant query safety', () => {
    it('builds parameterized tenant where clauses', () => {
      runWithTenantContext(tenantContext(), () => {
        expect(tenantWhere('customers')).toEqual({
          clause: 'customers.agency_id = $1',
          values: [agencyAId],
        });
      });
    });

    it('rejects raw queries missing a tenant predicate', async () => {
      await runWithTenantContext(tenantContext(), async () => {
        await expect(
          tenantQuery(createQueryClient(), 'SELECT * FROM customers WHERE id = $2', [
            'customer-id',
          ]),
        ).rejects.toThrow('Query missing parameterized agency_id filter');
      });
    });

    it('rejects interpolated tenant predicates', async () => {
      await runWithTenantContext(tenantContext(), async () => {
        await expect(
          tenantQuery(
            createQueryClient(),
            `SELECT * FROM customers WHERE agency_id = '${agencyAId}'`,
          ),
        ).rejects.toThrow('must use a parameter placeholder');
      });
    });

    it('passes agencyId as the first query parameter', async () => {
      const client = createQueryClient();

      await runWithTenantContext(tenantContext(), async () => {
        await tenantQuery(
          client,
          'SELECT * FROM customers WHERE agency_id = $1 AND id = $2',
          ['customer-id'],
        );
      });

      expect(client.calls).toEqual([
        {
          query: 'SELECT * FROM customers WHERE agency_id = $1 AND id = $2',
          params: [agencyAId, 'customer-id'],
        },
      ]);
    });
  });

  describe('resource ownership', () => {
    it('allows resources from the active agency', () => {
      runWithTenantContext(tenantContext(), () => {
        expect(() => validateResourceOwnership(agencyAId, 'Customer')).not.toThrow();
      });
    });

    it('blocks resources from another agency', () => {
      runWithTenantContext(tenantContext(), () => {
        expect(() => validateResourceOwnership(agencyBId, 'Customer')).toThrow(
          ForbiddenError,
        );
      });
    });
  });
});

interface TestReply {
  statusCode?: number;
  payload?: unknown;
  code(statusCode: number): TestReply;
  send(payload: unknown): TestReply;
}

function createReply(): TestReply {
  return {
    code(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    send(payload: unknown) {
      this.payload = payload;
      return this;
    },
  };
}

function createQueryClient() {
  const calls: Array<{ query: string; params: readonly unknown[] }> = [];

  return {
    calls,
    query<T>(query: string, params: readonly unknown[]) {
      calls.push({ query, params });
      return Promise.resolve({ rows: [] as T[] });
    },
  };
}

async function flushHook(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
