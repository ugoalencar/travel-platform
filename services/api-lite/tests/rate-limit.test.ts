import { describe, expect, it } from 'vitest';
import { LiteLoginAbuseProtector, LiteMemoryRateLimitStore } from '../src/rate-limit';

describe('Travel Lite abuse controls', () => {
  it('blocks repeated login failures for the same account and IP only temporarily', () => {
    let now = 0;
    const protector = new LiteLoginAbuseProtector(
      new LiteMemoryRateLimitStore(),
      {
        windowMs: 1_000,
        accountThrottleFailures: 3,
        ipThrottleFailures: 50,
        pairTemporaryBlockFailures: 3,
      },
      () => now,
    );

    expect(protector.recordFailure({ accountId: 'demo:admin@test.dev', ip: '198.51.100.10' }).state).toBe(
      'allow',
    );
    expect(protector.recordFailure({ accountId: 'demo:admin@test.dev', ip: '198.51.100.10' }).state).toBe(
      'allow',
    );
    expect(protector.recordFailure({ accountId: 'demo:admin@test.dev', ip: '198.51.100.10' }).state).toBe(
      'temporary_block',
    );
    expect(protector.check({ accountId: 'demo:admin@test.dev', ip: '198.51.100.11' }).state).toBe(
      'throttle',
    );

    now = 1_001;
    expect(protector.check({ accountId: 'demo:admin@test.dev', ip: '198.51.100.10' }).state).toBe(
      'allow',
    );
  });
});
