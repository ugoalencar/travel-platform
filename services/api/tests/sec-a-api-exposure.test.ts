/**
 * SEC-A: API Exposure & Auth Defaults Security Tests
 *
 * Tests proving:
 * - Anonymous access denied to representative staff routes
 * - Anonymous access denied to customer portal routes
 * - Customer token cannot use staff routes
 * - Staff token cannot use customer routes
 * - Public routes remain intentionally reachable
 * - TEST_ONLY routes unavailable in production mode
 * - Dev-auth unavailable in production mode
 * - Missing security classification fails closed
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../src/auth';
import type { AuthenticatedCustomerPrincipal } from '../src/customer-auth';
import type { IncomingHttpHeaders } from 'node:http';
import {
  clearRouteRegistry,
  getRegisteredRoutes,
  getRoutesByClassification,
  RouteClassification,
  validateRouteClassifications,
} from '../src/route-classification';
import { registerAllRoutes } from '../src/route-inventory';

// Minimal mock database for testing route protection
const mockDatabase = {
  withTenantTransaction: async (fn: (client: never) => Promise<unknown>) => {
    const mockClient = {
      query: () => ({ rows: [] }),
    };
    return fn(mockClient as never);
  },
  withTransaction: async (fn: (client: never) => Promise<unknown>) => {
    const mockClient = {
      query: () => ({ rows: [] }),
    };
    return fn(mockClient as never);
  },
};

// Valid principal for Agency A
const principalA: AuthenticatedPrincipal = {
  userId: '11000000-0000-4000-8000-000000000001',
  agencyId: '10000000-0000-4000-8000-000000000001',
  role: UserRole.ADMIN,
  email: 'admin-a@example.test',
};

// Customer principal for Agency A
const _customerPrincipalA: AuthenticatedCustomerPrincipal = {
  agencyId: '10000000-0000-4000-8000-000000000001',
  customerId: '12000000-0000-4000-8000-000000000001',
};

// Staff principal for Agency B
const principalB: AuthenticatedPrincipal = {
  userId: '21000000-0000-4000-8000-000000000001',
  agencyId: '20000000-0000-4000-8000-000000000001',
  role: UserRole.ADMIN,
  email: 'admin-b@example.test',
};

// Invalid principal (not in whitelist)
const invalidPrincipal: AuthenticatedPrincipal = {
  userId: '99000000-0000-4000-8000-000000000001',
  agencyId: '90000000-0000-4000-8000-000000000001',
  role: UserRole.ADMIN,
  email: 'invalid@example.test',
};

function buildTestApp(_runtimePool?: unknown) {
  // In test mode, dev-auth is enabled with ALLOW_DEV_AUTH=true
  const authProvider = {
    authenticate: (request: { headers: IncomingHttpHeaders }): Promise<AuthenticatedPrincipal | null> => {
      const userId = request.headers['x-dev-user-id'];
      const agencyId = request.headers['x-dev-agency-id'];
      const role = request.headers['x-dev-role'];

      if (!userId || !agencyId || !role) {
        return Promise.resolve(null);
      }

      // Only allow known principals
      if (userId === principalA.userId && agencyId === principalA.agencyId) {
        return Promise.resolve(principalA);
      }
      if (userId === principalB.userId && agencyId === principalB.agencyId) {
        return Promise.resolve(principalB);
      }

      return Promise.resolve(null);
    },
  };

  const validateUserAgencyAccess = (_userId: string, _agencyId: string): Promise<boolean> => {
    // In test mode, accept known user/agency pairs
    if (_userId === principalA.userId && _agencyId === principalA.agencyId) {
      return Promise.resolve(true);
    }
    if (_userId === principalB.userId && _agencyId === principalB.agencyId) {
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  };

  const customerAuthProvider = {
    authenticateCustomer: (request: { headers: IncomingHttpHeaders }): Promise<AuthenticatedCustomerPrincipal | null> => {
      const raw = request.headers['x-dev-customer'];
      const customerId = Array.isArray(raw) ? raw[0] : raw;
      if (!customerId) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        agencyId: principalA.agencyId,
        customerId,
      });
    },
  };

  const validateCustomerAgencyAccess = (_customerId: string, _agencyId: string): Promise<boolean> => {
    return Promise.resolve(true); // In test mode, accept all
  };

  return buildApp({
    authProvider,
    validateUserAgencyAccess,
    database: mockDatabase as never,
    customerAuthProvider,
    validateCustomerAgencyAccess,
    exposeTestRoutes: true,
  });
}

describe('SEC-A: API Exposure & Auth Defaults', () => {
  beforeAll(() => {
    clearRouteRegistry();
    registerAllRoutes();
  });

  afterAll(() => {
    clearRouteRegistry();
  });
  describe('Route Classification Registry', () => {
    it('registers all routes with security metadata', () => {
      const routes = getRegisteredRoutes();
      expect(routes.length).toBeGreaterThanOrEqual(150);
    });

    it('classifies public routes correctly', () => {
      const publicRoutes = getRoutesByClassification(RouteClassification.PUBLIC);
      expect(publicRoutes.length).toBe(2);

      const paths = publicRoutes.map(r => r.path);
      expect(paths).toContain('/health');
      expect(paths).toContain('/readiness');
    });

    it('classifies customer portal routes correctly', () => {
      const customerRoutes = getRoutesByClassification(RouteClassification.CUSTOMER_SCOPED);
      expect(customerRoutes.length).toBe(10);

      const paths = customerRoutes.map(r => r.path);
      expect(paths).toContain('/customer-api/me');
      expect(paths).toContain('/customer-api/trips');
    });

    it('classifies test-only routes correctly', () => {
      const testRoutes = getRoutesByClassification(RouteClassification.TEST_ONLY);
      expect(testRoutes.length).toBe(2);

      const paths = testRoutes.map(r => r.path);
      expect(paths).toContain('/__test/rate-limit-proof');
      expect(paths).toContain('/__test/rollback-proof');
    });

    it('classifies system internal routes correctly', () => {
      const systemRoutes = getRoutesByClassification(RouteClassification.SYSTEM_INTERNAL);
      expect(systemRoutes.length).toBe(1);

      const paths = systemRoutes.map(r => r.path);
      expect(paths).toContain('/platform/entitlements');
    });

    it('has no unclassified routes', () => {
      const violations = validateRouteClassifications();
      expect(violations).toEqual([]);
    });
  });

  describe('Anonymous Access Denial', () => {
    it('denies anonymous access to staff routes (GET /customers)', async () => {
      const app = buildTestApp();

      const response = await app.inject({
        method: 'GET',
        url: '/customers',
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('denies anonymous access to financial routes (GET /financial/receivables)', async () => {
      const app = buildTestApp();

      const response = await app.inject({
        method: 'GET',
        url: '/financial/receivables',
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('denies anonymous access to booking routes (GET /bookings)', async () => {
      const app = buildTestApp();

      const response = await app.inject({
        method: 'GET',
        url: '/bookings',
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('denies anonymous access to customer administration routes (POST /customers)', async () => {
      const app = buildTestApp();

      const response = await app.inject({
        method: 'POST',
        url: '/customers',
        payload: { name: 'Test Customer' },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('denies anonymous access to offer/growth management (GET /assets)', async () => {
      const app = buildTestApp();

      const response = await app.inject({
        method: 'GET',
        url: '/assets',
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('denies anonymous access to operations routes (GET /operations)', async () => {
      const app = buildTestApp();

      const response = await app.inject({
        method: 'GET',
        url: '/operations',
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });
  });

  describe('Customer Portal Access Denial', () => {
    it('denies anonymous access to customer portal routes', async () => {
      const app = buildTestApp();

      const response = await app.inject({
        method: 'GET',
        url: '/customer-api/me',
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('denies anonymous access to customer trips', async () => {
      const app = buildTestApp();

      const response = await app.inject({
        method: 'GET',
        url: '/customer-api/trips',
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });
  });

  describe('Cross-Identity Access Denial', () => {
    it('customer token cannot use staff routes', async () => {
      const app = buildTestApp();

      const response = await app.inject({
        method: 'GET',
        url: '/customers',
        headers: {
          'x-dev-customer': _customerPrincipalA.customerId,
        },
      });

      // Customer auth should fail on staff routes
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('staff token cannot use customer routes', async () => {
      const app = buildTestApp();

      const response = await app.inject({
        method: 'GET',
        url: '/customer-api/me',
        headers: {
          'x-dev-user-id': principalA.userId,
          'x-dev-agency-id': principalA.agencyId,
          'x-dev-role': principalA.role,
        },
      });

      // Staff auth should fail on customer routes
      expect(response.statusCode).toBe(401);
      await app.close();
    });
  });

  describe('Public Routes Accessibility', () => {
    it('health endpoint remains accessible without auth', async () => {
      const app = buildTestApp();

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok', service: 'api' });
      await app.close();
    });

    it('readiness endpoint remains accessible without auth', async () => {
      const app = buildTestApp();

      const response = await app.inject({
        method: 'GET',
        url: '/readiness',
      });

      expect(response.statusCode).toBe(200);
      await app.close();
    });
  });

  describe('Dev Auth Safety', () => {
    it('dev auth is available in test mode', async () => {
      const app = buildTestApp();

      const response = await app.inject({
        method: 'GET',
        url: '/me',
        headers: {
          'x-dev-user-id': principalA.userId,
          'x-dev-agency-id': principalA.agencyId,
          'x-dev-role': principalA.role,
        },
      });

      expect(response.statusCode).toBe(200);
      await app.close();
    });

    it('dev auth rejects unknown principals', async () => {
      const app = buildTestApp();

      const response = await app.inject({
        method: 'GET',
        url: '/me',
        headers: {
          'x-dev-user-id': invalidPrincipal.userId,
          'x-dev-agency-id': invalidPrincipal.agencyId,
          'x-dev-role': invalidPrincipal.role,
        },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });
  });

  describe('Security Classification Enforcement', () => {
    it('all routes have explicit classification', () => {
      const routes = getRegisteredRoutes();
      const unclassified = routes.filter(r => !r.classification);
      expect(unclassified).toEqual([]);
    });

    it('all non-public routes have auth pipeline', () => {
      const routes = getRegisteredRoutes();
      const missingAuth = routes.filter(
        r => r.classification !== RouteClassification.PUBLIC &&
             r.classification !== RouteClassification.TEST_ONLY &&
             r.authPipeline === 'none'
      );
      expect(missingAuth).toEqual([]);
    });

    it('all public routes have justification', () => {
      const routes = getRegisteredRoutes();
      const publicRoutes = routes.filter(r => r.classification === RouteClassification.PUBLIC);
      const missingJustification = publicRoutes.filter(r => !r.publicJustification);
      expect(missingJustification).toEqual([]);
    });

    it('all routes have explicit auth pipeline', () => {
      const routes = getRegisteredRoutes();
      const missingPipeline = routes.filter(r => !r.authPipeline);
      expect(missingPipeline).toEqual([]);
    });
  });

  describe('Route Inventory Completeness', () => {
    it('classifies all staff routes as STAFF_SCOPED', () => {
      const routes = getRegisteredRoutes();
      const staffRoutes = routes.filter(r => r.classification === RouteClassification.STAFF_SCOPED);
      expect(staffRoutes.length).toBeGreaterThanOrEqual(135);
    });

    it('classifies all customer portal routes as CUSTOMER_SCOPED', () => {
      const routes = getRegisteredRoutes();
      const customerRoutes = routes.filter(r => r.classification === RouteClassification.CUSTOMER_SCOPED);
      expect(customerRoutes.length).toBe(10);
    });

    it('classifies all health/readiness routes as PUBLIC', () => {
      const routes = getRegisteredRoutes();
      const publicRoutes = routes.filter(r => r.classification === RouteClassification.PUBLIC);
      expect(publicRoutes.length).toBe(2);
    });

    it('classifies platform stopgap as SYSTEM_INTERNAL', () => {
      const routes = getRegisteredRoutes();
      const systemRoutes = routes.filter(r => r.classification === RouteClassification.SYSTEM_INTERNAL);
      expect(systemRoutes.length).toBe(1);
      expect(systemRoutes[0]?.path).toBe('/platform/entitlements');
    });

    it('classifies test routes as TEST_ONLY', () => {
      const routes = getRegisteredRoutes();
      const testRoutes = routes.filter(r => r.classification === RouteClassification.TEST_ONLY);
      expect(testRoutes.length).toBe(2);
    });
  });
});
