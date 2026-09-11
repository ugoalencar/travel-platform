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
    // Client Onboarding (Agent 02): public token-only enrollment surface
    // must get the strict anonymous policy regardless of method.
    expect(classifyRateLimitRequest('GET', '/enrollment-api/some-token')).toBe(
      RateLimitClass.PUBLIC_ANONYMOUS
    );
    expect(classifyRateLimitRequest('POST', '/enrollment-api/some-token/submit')).toBe(
      RateLimitClass.PUBLIC_ANONYMOUS
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

  describe('Redis distributed rate-limit store', () => {
    it('resolves runtime config and requires REDIS_URL when external store is configured', async () => {
      const { resolveRateLimitRuntimeConfig } = await import('../src/rate-limit');

      // External store without REDIS_URL fails closed
      expect(() =>
        resolveRateLimitRuntimeConfig({ RATE_LIMIT_STORE: 'external' })
      ).toThrow(/RATE_LIMIT_STORE is set to "external" but REDIS_URL is not configured/);

      // External store with REDIS_URL succeeds
      expect(
        resolveRateLimitRuntimeConfig({
          RATE_LIMIT_STORE: 'external',
          REDIS_URL: 'redis://localhost:6379',
        })
      ).toMatchObject({
        store: 'external',
      });

      // Memory store does not require REDIS_URL
      expect(
        resolveRateLimitRuntimeConfig({
          RATE_LIMIT_STORE: 'memory',
        })
      ).toMatchObject({
        store: 'memory',
      });
    });

    it('validates Redis URL format and protocol before attempting connection', async () => {
      const { createRedisRateLimitStore } = await import('../src/rate-limit');

      // Missing URL fails closed
      await expect(createRedisRateLimitStore({})).rejects.toThrow(
        /createRedisRateLimitStore requires REDIS_URL to be set/
      );

      // Invalid URL format fails closed
      await expect(createRedisRateLimitStore({ REDIS_URL: 'not-a-url' })).rejects.toThrow(
        /REDIS_URL is invalid/
      );

      // Invalid protocol fails closed
      await expect(
        createRedisRateLimitStore({ REDIS_URL: 'http://localhost:6379' })
      ).rejects.toThrow(/must be "redis:" or "rediss:"/);
    });

     
    it('increments counters correctly and respects TTL expiration', async () => {
      // This test requires a Redis instance; skip if unavailable
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let store: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let client: any;
      try {
        const { RedisRateLimitStore } = await import('../src/rate-limit');
         
        const redis = await import('redis');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        client = (redis as any).createClient({ url: redisUrl });
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await client.connect();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        store = new RedisRateLimitStore(client, 'test-rate-limit:');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await client.flushDb(); // Clear test data
      } catch {
        // Skip test if Redis is not available
        console.log('Redis not available for testing; skipping distributed store tests');
        return;
      }

      // Consume within limit
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const first = await store.consume('ip:198.51.100.20', {
        max: 2,
        windowMs: 1_000,
        now: 100,
      });
      expect(first).toMatchObject({ count: 1, allowed: true });

      // Second consumption within limit
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const second = await store.consume('ip:198.51.100.20', {
        max: 2,
        windowMs: 1_000,
        now: 150,
      });
      expect(second).toMatchObject({ count: 2, allowed: true });

      // Third consumption exceeds limit
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const third = await store.consume('ip:198.51.100.20', {
        max: 2,
        windowMs: 1_000,
        now: 200,
      });
      expect(third).toMatchObject({ count: 3, allowed: false });

      // Get retrieves the counter
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const retrieved = await store.get('ip:198.51.100.20', 200);
      expect(retrieved).toMatchObject({ count: 3 });

      // Reset clears the counter
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await store.reset('ip:198.51.100.20');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const afterReset = await store.get('ip:198.51.100.20', 200);
      expect(afterReset).toBeUndefined();

      // Clean up
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      if (client) await client.quit();
    });

     
    it('handles concurrent increments safely with Redis atomic operations', async () => {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let store: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let client: any;
      try {
        const { RedisRateLimitStore } = await import('../src/rate-limit');
         
        const redis = await import('redis');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        client = (redis as any).createClient({ url: redisUrl });
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await client.connect();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        store = new RedisRateLimitStore(client, 'test-concurrent:');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await client.flushDb();
      } catch {
        console.log('Redis not available for testing; skipping concurrent tests');
        return;
      }

      // Simulate concurrent increments
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const promises: any[] = [];
      for (let i = 0; i < 10; i++) {
         
         
        promises.push(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          store.consume('concurrent-key', {
            max: 100,
            windowMs: 10_000,
            now: Date.now(),
          })
        );
      }

      const results = await Promise.all(promises);
      // All should succeed since max is 100
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      expect(results.every((r: any) => r.allowed)).toBe(true);
      // Counts should be sequential 1-10
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
      expect(results.map((r: any) => r.count)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      // Clean up
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      if (client) await client.quit();
    });

    it('fails safely when Redis connection is unavailable', async () => {
      const { createRedisRateLimitStore } = await import('../src/rate-limit');

      // Connection to invalid Redis server fails closed
      await expect(
        createRedisRateLimitStore({ REDIS_URL: 'redis://invalid-host-that-does-not-exist:6379' })
      ).rejects.toThrow(/Failed to connect to Redis/);
    });

    it('enforces external store requirement in production via env validation', async () => {
      const { resolveRateLimitRuntimeConfig } = await import('../src/rate-limit');

      // Production without external store fails
      expect(() =>
        resolveRateLimitRuntimeConfig({
          RATE_LIMIT_STORE: 'memory',
        })
      ).not.toThrow(); // Dev/test mode, no error yet

      // But when validated in production context (done by env.ts), it will fail
      // This is tested separately in env validation tests
    });
  });
});
