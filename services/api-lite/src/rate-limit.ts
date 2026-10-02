import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest, onRequestHookHandler } from 'fastify';

export type LiteAbuseState = 'allow' | 'throttle' | 'temporary_block';

export interface LiteAbuseDecision {
  state: LiteAbuseState;
  retryAfterSeconds?: number;
}

interface Counter {
  count: number;
  resetAt: number;
}

interface Rule {
  max: number;
  windowMs: number;
}

export class LiteMemoryRateLimitStore {
  private readonly counters = new Map<string, Counter>();

  consume(key: string, rule: Rule & { now: number }): Counter & { allowed: boolean } {
    const previous = this.counters.get(key);
    const current =
      !previous || previous.resetAt <= rule.now
        ? { count: 1, resetAt: rule.now + rule.windowMs }
        : { count: previous.count + 1, resetAt: previous.resetAt };

    this.counters.set(key, current);
    return { ...current, allowed: current.count <= rule.max };
  }

  get(key: string, now: number): Counter | undefined {
    const counter = this.counters.get(key);
    if (!counter) return undefined;
    if (counter.resetAt <= now) {
      this.counters.delete(key);
      return undefined;
    }
    return { ...counter };
  }

  reset(key: string): void {
    this.counters.delete(key);
  }
}

export interface LiteLoginAbusePolicy {
  windowMs: number;
  accountThrottleFailures: number;
  ipThrottleFailures: number;
  pairTemporaryBlockFailures: number;
}

const DEFAULT_LOGIN_POLICY: LiteLoginAbusePolicy = {
  windowMs: 15 * 60_000,
  accountThrottleFailures: 5,
  ipThrottleFailures: 12,
  pairTemporaryBlockFailures: 12,
};

export class LiteLoginAbuseProtector {
  private readonly policy: LiteLoginAbusePolicy;

  constructor(
    private readonly store = new LiteMemoryRateLimitStore(),
    policy: Partial<LiteLoginAbusePolicy> = {},
    private readonly now: () => number = Date.now,
  ) {
    this.policy = { ...DEFAULT_LOGIN_POLICY, ...policy };
  }

  check(input: { accountId: string; ip: string }): LiteAbuseDecision {
    const now = this.now();
    return this.decision(
      {
        account: this.store.get(this.accountKey(input.accountId), now),
        ip: this.store.get(this.ipKey(input.ip), now),
        pair: this.store.get(this.pairKey(input.accountId, input.ip), now),
      },
      now,
    );
  }

  recordFailure(input: { accountId: string; ip: string }): LiteAbuseDecision {
    const now = this.now();
    const rule = { max: Number.MAX_SAFE_INTEGER, windowMs: this.policy.windowMs, now };
    return this.decision(
      {
        account: this.store.consume(this.accountKey(input.accountId), rule),
        ip: this.store.consume(this.ipKey(input.ip), rule),
        pair: this.store.consume(this.pairKey(input.accountId, input.ip), rule),
      },
      now,
    );
  }

  recordSuccess(input: { accountId: string; ip: string }): void {
    this.store.reset(this.accountKey(input.accountId));
    this.store.reset(this.pairKey(input.accountId, input.ip));
  }

  private decision(
    counters: { account: Counter | undefined; ip: Counter | undefined; pair: Counter | undefined },
    now: number,
  ): LiteAbuseDecision {
    const retryAfterSeconds = retryAfter(
      Math.max(counters.account?.resetAt ?? now, counters.ip?.resetAt ?? now, counters.pair?.resetAt ?? now),
      now,
    );
    if ((counters.pair?.count ?? 0) >= this.policy.pairTemporaryBlockFailures) {
      return { state: 'temporary_block', retryAfterSeconds };
    }
    if (
      (counters.account?.count ?? 0) >= this.policy.accountThrottleFailures ||
      (counters.ip?.count ?? 0) >= this.policy.ipThrottleFailures
    ) {
      return { state: 'throttle', retryAfterSeconds };
    }
    return { state: 'allow' };
  }

  private ipKey(ip: string): string {
    return `login:ip:${ip}`;
  }

  private accountKey(accountId: string): string {
    return `login:account:${hash(accountId)}`;
  }

  private pairKey(accountId: string, ip: string): string {
    return `login:pair:${hash(accountId)}:${ip}`;
  }
}

export function createLiteRequestRateLimitHook(
  store = new LiteMemoryRateLimitStore(),
  now: () => number = Date.now,
): onRequestHookHandler {
  return (request, reply, done) => {
    const routePath = normalizeRoutePath(request.url);
    const rule = classifyLiteRequestRule(request.method, routePath);
    const counter = store.consume(`request:${request.ip}:${request.method}:${routePath}`, {
      ...rule,
      now: now(),
    });

    if (counter.allowed) {
      done();
      return;
    }

    sendRateLimited(reply, retryAfter(counter.resetAt, now()));
    done();
  };
}

export function sendRateLimited(reply: FastifyReply, retryAfterSeconds = 60): void {
  reply
    .code(429)
    .header('retry-after', String(retryAfterSeconds))
    .send({
      error: 'Muitas tentativas. Tente novamente mais tarde.',
      code: 'RATE_LIMITED',
      retryAfterSeconds,
    });
}

export function loginClientIp(request: FastifyRequest): string {
  return request.ip || 'unknown';
}

function normalizeRoutePath(url: string): string {
  const path = url.split('?')[0] || '/';
  const withoutApi = path.startsWith('/api/') ? path.slice(4) : path;
  return withoutApi.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/:id');
}

function classifyLiteRequestRule(method: string, path: string): Rule {
  if (path === '/auth/login') return { max: 20, windowMs: 15 * 60_000 };
  // Stricter than login: these are account-recovery endpoints, no password
  // needed to probe them, and both can be hit by an anonymous caller.
  if (path === '/auth/forgot-password' || path === '/auth/reset-password') {
    return { max: 8, windowMs: 15 * 60_000 };
  }
  if (path === '/health' || path === '/version') return { max: 300, windowMs: 60_000 };
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return { max: 600, windowMs: 60_000 };
  return { max: 180, windowMs: 60_000 };
}

function hash(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function retryAfter(resetAt: number, now: number): number {
  return Math.max(1, Math.ceil((resetAt - now) / 1000));
}
