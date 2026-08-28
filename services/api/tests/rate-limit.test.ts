import { describe, expect, it } from 'vitest';

describe('SEC-B abuse-control policy', () => {
  it('classifies authentication, customer, sensitive, staff, and internal requests explicitly', async () => {
    const { RateLimitClass, classifyRateLimitRequest } = await import('../src/rate-limit');

    expect(classifyRateLimitRequest('POST', '/auth/login')).toBe(RateLimitClass.AUTH_LOGIN);
    expect(classifyRateLimitRequest('POST', '/auth/forgot')).toBe(RateLimitClass.AUTH_RECOVERY);
    expect(classifyRateLimitRequest('GET', '/customer-api/trips')).toBe(
      RateLimitClass.CUSTOMER_READ
    );
    expect(classifyRateLimitRequest('POST', '/bookings/abc/cancel')).toBe(
      RateLimitClass.SENSITIVE_MUTATION
    );
    expect(classifyRateLimitRequest('PATCH', '/sales/abc')).toBe(RateLimitClass.SENSITIVE_MUTATION);
    expect(classifyRateLimitRequest('GET', '/customers')).toBe(RateLimitClass.STAFF_READ);
    expect(classifyRateLimitRequest('POST', '/customers')).toBe(RateLimitClass.STAFF_WRITE);
    expect(classifyRateLimitRequest('POST', '/platform/entitlements')).toBe(
      RateLimitClass.SYSTEM_INTERNAL
    );
  });

  it('expires in-memory counters at the configured TTL', async () => {
    const { InMemoryRateLimitStore } = await import('../src/rate-limit');
    const store = new InMemoryRateLimitStore();

    await store.consume('ip:198.51.100.10', { max: 1, windowMs: 1_000, now: 10 });
    const limited = await store.consume('ip:198.51.100.10', { max: 1, windowMs: 1_000, now: 20 });
    const afterTtl = await store.consume('ip:198.51.100.10', {
      max: 1,
      windowMs: 1_000,
      now: 1_010,
    });

    expect(limited.allowed).toBe(false);
    expect(afterTtl).toMatchObject({ allowed: true, count: 1 });
  });

  it('escalates repeated account failures across IPs without permanently locking the account', async () => {
    const { InMemoryRateLimitStore, LoginAbuseProtector } = await import('../src/rate-limit');
    let now = 0;
    const protector = new LoginAbuseProtector({
      store: new InMemoryRateLimitStore(),
      now: () => now,
      policy: {
        windowMs: 1_000,
        accountThrottleFailures: 2,
        accountCaptchaFailures: 3,
        ipThrottleFailures: 50,
        ipCaptchaFailures: 60,
        pairTemporaryBlockFailures: 99,
      },
    });

    expect(
      (await protector.recordFailure({ accountId: 'known@example.test', ip: '198.51.100.10' }))
        .state
    ).toBe('allow');
    expect(
      (await protector.recordFailure({ accountId: 'known@example.test', ip: '198.51.100.11' }))
        .state
    ).toBe('throttle');
    expect(
      (await protector.recordFailure({ accountId: 'known@example.test', ip: '198.51.100.12' }))
        .state
    ).toBe('captcha_required');
    expect(
      (await protector.check({ accountId: 'known@example.test', ip: '198.51.100.13' })).state
    ).toBe('captcha_required');

    now = 1_001;
    expect(
      (await protector.check({ accountId: 'known@example.test', ip: '198.51.100.13' })).state
    ).toBe('allow');
  });

  it('blocks only the abusive account/IP pair, avoiding an account lockout DoS', async () => {
    const { InMemoryRateLimitStore, LoginAbuseProtector } = await import('../src/rate-limit');
    const protector = new LoginAbuseProtector({
      store: new InMemoryRateLimitStore(),
      policy: {
        windowMs: 60_000,
        accountThrottleFailures: 2,
        accountCaptchaFailures: 3,
        ipThrottleFailures: 50,
        ipCaptchaFailures: 60,
        pairTemporaryBlockFailures: 3,
      },
    });

    await protector.recordFailure({ accountId: 'known@example.test', ip: '198.51.100.10' });
    await protector.recordFailure({ accountId: 'known@example.test', ip: '198.51.100.10' });
    expect(
      (await protector.recordFailure({ accountId: 'known@example.test', ip: '198.51.100.10' }))
        .state
    ).toBe('temporary_block');
    expect(
      (await protector.check({ accountId: 'known@example.test', ip: '198.51.100.11' })).state
    ).toBe('captcha_required');
  });

  it('detects many account failures from one IP and clears the successful account state', async () => {
    const { InMemoryRateLimitStore, LoginAbuseProtector } = await import('../src/rate-limit');
    const protector = new LoginAbuseProtector({
      store: new InMemoryRateLimitStore(),
      policy: {
        windowMs: 60_000,
        accountThrottleFailures: 50,
        accountCaptchaFailures: 60,
        ipThrottleFailures: 2,
        ipCaptchaFailures: 3,
        pairTemporaryBlockFailures: 99,
      },
    });

    await protector.recordFailure({ accountId: 'one@example.test', ip: '198.51.100.10' });
    await protector.recordFailure({ accountId: 'two@example.test', ip: '198.51.100.10' });
    expect(
      (await protector.recordFailure({ accountId: 'three@example.test', ip: '198.51.100.10' }))
        .state
    ).toBe('captcha_required');

    await protector.recordSuccess({ accountId: 'one@example.test', ip: '198.51.100.10' });
    expect(
      (await protector.check({ accountId: 'one@example.test', ip: '198.51.100.11' })).state
    ).toBe('allow');
  });

  it('returns a generic throttle decision with retry metadata for exceeded request quotas', async () => {
    const { InMemoryRateLimitStore, RequestRateLimiter, RateLimitClass } =
      await import('../src/rate-limit');
    const limiter = new RequestRateLimiter({
      store: new InMemoryRateLimitStore(),
      policies: {
        [RateLimitClass.STAFF_WRITE]: { max: 1, windowMs: 1_000 },
      },
      now: () => 100,
    });

    await limiter.check({
      rateLimitClass: RateLimitClass.STAFF_WRITE,
      ip: '198.51.100.10',
      route: '/customers',
    });
    const decision = await limiter.check({
      rateLimitClass: RateLimitClass.STAFF_WRITE,
      ip: '198.51.100.10',
      route: '/customers',
    });

    expect(decision).toEqual({ state: 'throttle', retryAfterSeconds: 1 });
  });

  it('enforces a separate tenant quota only when given a server-established tenant id', async () => {
    const { InMemoryRateLimitStore, RequestRateLimiter, RateLimitClass } =
      await import('../src/rate-limit');
    const limiter = new RequestRateLimiter({
      store: new InMemoryRateLimitStore(),
      policies: {
        [RateLimitClass.SENSITIVE_MUTATION]: { max: 1, windowMs: 1_000 },
      },
      now: () => 100,
    });

    await limiter.checkTenant({
      rateLimitClass: RateLimitClass.SENSITIVE_MUTATION,
      tenantId: 'server-established-agency-id',
      route: '/sales/abc',
    });
    const decision = await limiter.checkTenant({
      rateLimitClass: RateLimitClass.SENSITIVE_MUTATION,
      tenantId: 'server-established-agency-id',
      route: '/sales/abc',
    });

    expect(decision).toEqual({ state: 'throttle', retryAfterSeconds: 1 });
  });

  it('resolves the documented runtime configuration and rejects malformed numeric limits', async () => {
    const { resolveRateLimitRuntimeConfig } = await import('../src/rate-limit');

    expect(
      resolveRateLimitRuntimeConfig({
        RATE_LIMIT_ENABLED: 'false',
        RATE_LIMIT_STORE: 'memory',
        RATE_LIMIT_MAX: '7',
        RATE_LIMIT_WINDOW_MS: '1200',
      })
    ).toEqual({ enabled: false, store: 'memory', max: 7, windowMs: 1200 });
    expect(() => resolveRateLimitRuntimeConfig({ RATE_LIMIT_MAX: 'zero' })).toThrow(
      /RATE_LIMIT_MAX must be a positive integer/
    );
    expect(() => resolveRateLimitRuntimeConfig({ RATE_LIMIT_STORE: 'redis' })).toThrow(
      /RATE_LIMIT_STORE must be either "memory" or "external"/
    );
  });

  it('lets a legitimate account log in again once the abuse window cools down, with no permanent lockout', async () => {
    const { InMemoryRateLimitStore, LoginAbuseProtector } = await import('../src/rate-limit');
    let now = 0;
    const protector = new LoginAbuseProtector({
      store: new InMemoryRateLimitStore(),
      now: () => now,
      policy: {
        windowMs: 1_000,
        accountThrottleFailures: 2,
        accountCaptchaFailures: 3,
        ipThrottleFailures: 3,
        ipCaptchaFailures: 4,
        pairTemporaryBlockFailures: 2,
      },
    });

    await protector.recordFailure({ accountId: 'victim@example.test', ip: '198.51.100.20' });
    const blocked = await protector.recordFailure({
      accountId: 'victim@example.test',
      ip: '198.51.100.20',
    });
    expect(blocked.state).toBe('temporary_block');

    // No amount of waiting requires an operator to intervene -- the block
    // is time-bounded, not a persisted "locked" flag.
    now = 1_001;
    expect(
      (await protector.check({ accountId: 'victim@example.test', ip: '198.51.100.20' })).state
    ).toBe('allow');

    await protector.recordSuccess({ accountId: 'victim@example.test', ip: '198.51.100.20' });
    expect(
      (await protector.check({ accountId: 'victim@example.test', ip: '198.51.100.20' })).state
    ).toBe('allow');
  });

  it('keeps the login decision shape identical for unknown and known accounts (enumeration resistance)', async () => {
    const { InMemoryRateLimitStore, LoginAbuseProtector } = await import('../src/rate-limit');
    const store = new InMemoryRateLimitStore();
    const protector = new LoginAbuseProtector({ store });

    const unknownAccountDecision = await protector.check({
      accountId: 'never-registered@example.test',
      ip: '198.51.100.30',
    });
    const knownAccountDecision = await protector.check({
      accountId: 'known@example.test',
      ip: '198.51.100.31',
    });

    // The abuse-state contract exposes only the four documented states --
    // it never differentiates "account does not exist" from "account
    // exists but no failures yet", so a caller cannot use timing/shape of
    // this decision to enumerate valid accounts.
    expect(unknownAccountDecision).toEqual({ state: 'allow' });
    expect(unknownAccountDecision).toEqual(knownAccountDecision);
  });
});
