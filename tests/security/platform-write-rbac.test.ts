import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../services/api/src/app';
import type { DatabaseRuntime } from '../../services/api/src/database';
import { PlatformUserRole } from '../../packages/domain/types';

const planPayload = {
  name: 'Plan',
  slug: 'plan',
  priceAmount: 100,
  priceCurrency: 'BRL',
  billingInterval: 'MONTHLY',
};

const subscriptionPayload = {
  subscriberTenantId: 'tenant-1',
  planId: 'plan-1',
  billingInterval: 'MONTHLY',
  amount: 100,
  currency: 'BRL',
};

const leadPayload = { name: 'Lead', email: 'lead@example.test' };

interface WriteCase {
  label: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  url: string;
  payload?: Record<string, unknown>;
}

// Representative gated write routes covering every mutating /platform/*
// group the F-02 remediation touched: plans, subscriptions, leads,
// subscribers, settings, support, support-sessions. Commercial writes
// (banners/partners/referrals/...) share requireCommercialWriteAccess,
// which delegates to the same gate; feature-flags has its own suite.
const writeCases: WriteCase[] = [
  { label: 'POST /platform/plans', method: 'POST', url: '/platform/plans', payload: planPayload },
  { label: 'PATCH /platform/plans/:id', method: 'PATCH', url: '/platform/plans/plan-1', payload: { name: 'Renamed' } },
  { label: 'DELETE /platform/plans/:id', method: 'DELETE', url: '/platform/plans/plan-1' },
  {
    label: 'POST /platform/subscriptions',
    method: 'POST',
    url: '/platform/subscriptions',
    payload: subscriptionPayload,
  },
  {
    label: 'PATCH /platform/subscriptions/:id/status',
    method: 'PATCH',
    url: '/platform/subscriptions/sub-1/status',
    payload: { status: 'CANCELLED' },
  },
  { label: 'POST /platform/leads', method: 'POST', url: '/platform/leads', payload: leadPayload },
  {
    label: 'PATCH /platform/leads/:id/status',
    method: 'PATCH',
    url: '/platform/leads/lead-1/status',
    payload: { status: 'QUALIFIED' },
  },
  {
    label: 'POST /platform/subscribers',
    method: 'POST',
    url: '/platform/subscribers',
    payload: { agencyName: 'Agency', slug: 'agency', email: 'owner@example.test' },
  },
  { label: 'POST /platform/settings', method: 'POST', url: '/platform/settings', payload: {} },
  { label: 'PATCH /platform/settings', method: 'PATCH', url: '/platform/settings', payload: {} },
  { label: 'POST /platform/support', method: 'POST', url: '/platform/support', payload: {} },
  {
    label: 'PATCH /platform/support/:id',
    method: 'PATCH',
    url: '/platform/support/case-1',
    payload: { status: 'RESOLVED' },
  },
  {
    label: 'POST /platform/support-sessions',
    method: 'POST',
    url: '/platform/support-sessions',
    payload: { tenantId: 'tenant-1', reason: 'audit' },
  },
  {
    label: 'PATCH /platform/support-sessions/:id/end',
    method: 'PATCH',
    url: '/platform/support-sessions/session-1/end',
  },
];

const lowPrivilegeRoles: PlatformUserRole[] = [
  PlatformUserRole.READ_ONLY_AUDITOR,
  PlatformUserRole.SUPPORT_ADMIN,
  PlatformUserRole.BILLING_ADMIN,
  PlatformUserRole.MARKETING_ADMIN,
];

function buildTestApp() {
  const withPlatformTransaction = vi.fn(() => Promise.resolve([]));

  const database: DatabaseRuntime = {
    withTenantTransaction: () => {
      throw new Error('staff tenant database runtime must not be used by platform routes');
    },
    withPlatformTransaction: withPlatformTransaction as unknown as DatabaseRuntime['withPlatformTransaction'],
  };

  const app = buildApp({
    authProvider: { authenticate: () => Promise.resolve(null) },
    validateUserAgencyAccess: () => Promise.resolve(false),
    database,
    platformAuthProvider: {
      authenticate(request) {
        const role = request.headers['x-test-platform-role'];
        if (!role || typeof role !== 'string') {
          return Promise.resolve(null);
        }
        return Promise.resolve({
          platformUserId: 'platform-user-1',
          role: role as PlatformUserRole,
        });
      },
    },
    rateLimit: {
      classLimits: { SYSTEM_INTERNAL: { windowMs: 60_000, max: 50 } },
    },
  });

  return { app, withPlatformTransaction };
}

interface InjectCaseOptions {
  method: 'POST' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  payload?: Record<string, unknown>;
}

function toInjectOptions(testCase: WriteCase, role?: PlatformUserRole): InjectCaseOptions {
  const options: InjectCaseOptions = {
    method: testCase.method,
    url: testCase.url,
  };
  if (role !== undefined) {
    options.headers = { 'x-test-platform-role': role };
  }
  if (testCase.payload !== undefined) {
    options.payload = testCase.payload;
  }
  return options;
}

describe('F-02: platform write RBAC matrix', () => {
  it.each(writeCases)('$label rejects unauthenticated requests with 401', async (testCase) => {
    const { app, withPlatformTransaction } = buildTestApp();
    const response = await app.inject(toInjectOptions(testCase));

    expect(response.statusCode).toBe(401);
    expect(withPlatformTransaction).not.toHaveBeenCalled();
    await app.close();
  });

  it.each(writeCases)(
    '$label rejects READ_ONLY_AUDITOR with 403 before any database write',
    async (testCase) => {
      const { app, withPlatformTransaction } = buildTestApp();
      const response = await app.inject(
        toInjectOptions(testCase, PlatformUserRole.READ_ONLY_AUDITOR),
      );

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'FORBIDDEN' });
      expect(withPlatformTransaction).not.toHaveBeenCalled();
      await app.close();
    },
  );

  it.each(
    lowPrivilegeRoles.flatMap((role) =>
      writeCases.slice(0, 3).map((testCase) => ({ role, testCase })),
    ),
  )('$label rejects $role with 403', async ({ role, testCase }) => {
    const { app, withPlatformTransaction } = buildTestApp();
    const response = await app.inject(toInjectOptions(testCase, role));

    expect(response.statusCode).toBe(403);
    expect(withPlatformTransaction).not.toHaveBeenCalled();
    await app.close();
  });

  it.each(writeCases)(
    '$label lets PLATFORM_ADMIN pass the role gate (not 401/403)',
    async (testCase) => {
      const { app } = buildTestApp();
      const response = await app.inject(
        toInjectOptions(testCase, PlatformUserRole.PLATFORM_ADMIN),
      );

      // The role gate must pass. Downstream handlers may still fail
      // validation/DB shape in this stubbed environment (400/500) --
      // only 401/403 would mean the RBAC gate wrongly denied an admin.
      expect(response.statusCode).not.toBe(401);
      expect(response.statusCode).not.toBe(403);
      await app.close();
    },
  );

  it('keeps reads available to READ_ONLY_AUDITOR', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/platform/plans',
      headers: { 'x-test-platform-role': PlatformUserRole.READ_ONLY_AUDITOR },
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('leaves the public lead endpoint POST /public/leads open (intentionally public)', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/public/leads',
      payload: leadPayload,
    });

    // Public route by design (marketing landing). It must not require a
    // platform principal; the service layer owns its own validation.
    expect(response.statusCode).not.toBe(401);
    expect(response.statusCode).not.toBe(403);
    await app.close();
  });
});
