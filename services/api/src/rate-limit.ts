import { createHash } from 'node:crypto';
import { createClient } from 'redis';

export type RedisClientInstance = Awaited<ReturnType<typeof createClient>>;

export enum RateLimitClass {
  AUTH_LOGIN = 'AUTH_LOGIN',
  AUTH_RECOVERY = 'AUTH_RECOVERY',
  PUBLIC_ANONYMOUS = 'PUBLIC_ANONYMOUS',
  CUSTOMER_READ = 'CUSTOMER_READ',
  CUSTOMER_WRITE = 'CUSTOMER_WRITE',
  STAFF_READ = 'STAFF_READ',
  STAFF_WRITE = 'STAFF_WRITE',
  SENSITIVE_MUTATION = 'SENSITIVE_MUTATION',
  WEBHOOK_EXTERNAL = 'WEBHOOK_EXTERNAL',
  SYSTEM_INTERNAL = 'SYSTEM_INTERNAL',
}

export type AbuseState = 'allow' | 'throttle' | 'captcha_required' | 'temporary_block';

export interface AbuseDecision {
  state: AbuseState;
  retryAfterSeconds?: number;
}

export interface RateLimitRule {
  max: number;
  windowMs: number;
}

export interface RateLimitRuntimeEnvironment {
  RATE_LIMIT_ENABLED?: string;
  RATE_LIMIT_STORE?: string;
  RATE_LIMIT_MAX?: string;
  RATE_LIMIT_WINDOW_MS?: string;
  REDIS_URL?: string;
}

export interface RateLimitRuntimeConfig {
  enabled: boolean;
  store: 'memory' | 'external';
  max: number;
  windowMs: number;
}

export interface RateLimitCounter {
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  consume(
    key: string,
    rule: RateLimitRule & { now: number }
  ): Promise<RateLimitCounter & { allowed: boolean }>;
  get(key: string, now: number): Promise<RateLimitCounter | undefined>;
  reset(key: string): Promise<void>;
}

/**
 * Suitable only for a single process. Production wiring must provide a
 * shared RateLimitStore so workers and replicas observe the same abuse state.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly counters = new Map<string, RateLimitCounter>();

  consume(
    key: string,
    rule: RateLimitRule & { now: number }
  ): Promise<RateLimitCounter & { allowed: boolean }> {
    const previous = this.counters.get(key);
    const current =
      !previous || previous.resetAt <= rule.now
        ? { count: 1, resetAt: rule.now + rule.windowMs }
        : { count: previous.count + 1, resetAt: previous.resetAt };

    this.counters.set(key, current);
    return Promise.resolve({ ...current, allowed: current.count <= rule.max });
  }

  get(key: string, now: number): Promise<RateLimitCounter | undefined> {
    const counter = this.counters.get(key);
    if (!counter) {
      return Promise.resolve(undefined);
    }
    if (counter.resetAt <= now) {
      this.counters.delete(key);
      return Promise.resolve(undefined);
    }
    return Promise.resolve({ ...counter });
  }

  reset(key: string): Promise<void> {
    this.counters.delete(key);
    return Promise.resolve();
  }
}

/**
 * Redis-backed distributed rate limit store. Suitable for multi-process,
 * multi-instance deployments where all processes must observe consistent
 * abuse state. Connection failures and protocol errors fail safely by
 * throwing rather than silently falling back to in-memory state.
 *
 * Store structure:
 * - key: rate limit counter key
 * - value: JSON-encoded {count, resetAt} object with per-key expiration
 */
export class RedisRateLimitStore implements RateLimitStore {
  readonly redisClient: RedisClientInstance;

  constructor(
    client: RedisClientInstance,
    private readonly keyPrefix: string = 'rate-limit:'
  ) {
    this.redisClient = client;
  }

  async consume(
    key: string,
    rule: RateLimitRule & { now: number }
  ): Promise<RateLimitCounter & { allowed: boolean }> {
    const fullKey = `${this.keyPrefix}${key}`;
    const ttlMs = rule.windowMs;
    const ttlSeconds = Math.ceil(ttlMs / 1000);

    // Fetch existing counter or initialize
    const raw = await this.redisClient.get(fullKey);
    let previous: RateLimitCounter | undefined;
    if (raw) {
      try {
        previous = JSON.parse(raw) as RateLimitCounter;
      } catch {
        // Malformed data: reset and start fresh. Log not required here as
        // Redis data corruption would appear in application metrics.
        previous = undefined;
      }
    }

    // Calculate new counter state
    const current =
      !previous || previous.resetAt <= rule.now
        ? { count: 1, resetAt: rule.now + ttlMs }
        : { count: previous.count + 1, resetAt: previous.resetAt };

    // Store with TTL: Redis will automatically remove the key after expiration.
    // Use the per-key TTL so each window resets independently.
    await this.redisClient.setEx(fullKey, ttlSeconds, JSON.stringify(current));

    return { ...current, allowed: current.count <= rule.max };
  }

  async get(key: string, now: number): Promise<RateLimitCounter | undefined> {
    const fullKey = `${this.keyPrefix}${key}`;
    const raw = await this.redisClient.get(fullKey);
    if (!raw) {
      return undefined;
    }

    try {
      const counter = JSON.parse(raw) as RateLimitCounter;
      // If the counter's TTL has passed (resetAt <= now), Redis should have
      // already deleted it via expiration. Treat missing as undefined.
      if (counter.resetAt <= now) {
        return undefined;
      }
      return counter;
    } catch {
      // Malformed data: treat as missing
      return undefined;
    }
  }

  async reset(key: string): Promise<void> {
    const fullKey = `${this.keyPrefix}${key}`;
    await this.redisClient.del(fullKey);
  }
}

const DEFAULT_POLICIES: Readonly<Record<RateLimitClass, RateLimitRule>> = {
  [RateLimitClass.AUTH_LOGIN]: { max: 10, windowMs: 15 * 60_000 },
  [RateLimitClass.AUTH_RECOVERY]: { max: 5, windowMs: 15 * 60_000 },
  [RateLimitClass.PUBLIC_ANONYMOUS]: { max: 120, windowMs: 60_000 },
  [RateLimitClass.CUSTOMER_READ]: { max: 240, windowMs: 60_000 },
  [RateLimitClass.CUSTOMER_WRITE]: { max: 60, windowMs: 60_000 },
  [RateLimitClass.STAFF_READ]: { max: 600, windowMs: 60_000 },
  [RateLimitClass.STAFF_WRITE]: { max: 300, windowMs: 60_000 },
  [RateLimitClass.SENSITIVE_MUTATION]: { max: 20, windowMs: 15 * 60_000 },
  [RateLimitClass.WEBHOOK_EXTERNAL]: { max: 120, windowMs: 60_000 },
  [RateLimitClass.SYSTEM_INTERNAL]: { max: 300, windowMs: 60_000 },
};

/** Parses the documented environment surface; invalid limits fail closed. */
export function resolveRateLimitRuntimeConfig(
  environment: RateLimitRuntimeEnvironment
): RateLimitRuntimeConfig {
  const enabled = parseBoolean(environment.RATE_LIMIT_ENABLED, 'RATE_LIMIT_ENABLED', true);
  const store = environment.RATE_LIMIT_STORE ?? 'memory';
  if (store !== 'memory' && store !== 'external') {
    throw new Error('RATE_LIMIT_STORE must be either "memory" or "external".');
  }

  // Validate Redis connection is configured when external store is required
  if (store === 'external' && !isNonEmptyString(environment.REDIS_URL)) {
    throw new Error(
      'RATE_LIMIT_STORE is set to "external" but REDIS_URL is not configured. ' +
        'REDIS_URL is required when using a distributed rate-limit store.'
    );
  }

  return {
    enabled,
    store,
    max: parsePositiveInteger(environment.RATE_LIMIT_MAX, 'RATE_LIMIT_MAX', 300),
    windowMs: parsePositiveInteger(
      environment.RATE_LIMIT_WINDOW_MS,
      'RATE_LIMIT_WINDOW_MS',
      60_000
    ),
  };
}

export interface RequestRateLimiterOptions {
  store: RateLimitStore;
  policies?: Partial<Record<RateLimitClass, RateLimitRule>>;
  now?: () => number;
}

export class RequestRateLimiter {
  private readonly policies: Readonly<Record<RateLimitClass, RateLimitRule>>;
  private readonly now: () => number;

  constructor(private readonly options: RequestRateLimiterOptions) {
    this.policies = { ...DEFAULT_POLICIES, ...options.policies };
    this.now = options.now ?? Date.now;
  }

  async check(input: {
    rateLimitClass: RateLimitClass;
    ip: string;
    route: string;
  }): Promise<AbuseDecision> {
    const rule = this.policies[input.rateLimitClass];
    const now = this.now();
    const counter = await this.options.store.consume(
      `request:${input.rateLimitClass}:${input.ip}:${input.route}`,
      { ...rule, now }
    );
    if (counter.allowed) {
      return { state: 'allow' };
    }
    return {
      state: 'throttle',
      retryAfterSeconds: retryAfterSeconds(counter.resetAt, now),
    };
  }

  async checkTenant(input: {
    rateLimitClass: RateLimitClass;
    tenantId: string;
    route: string;
  }): Promise<AbuseDecision> {
    const rule = this.policies[input.rateLimitClass];
    const now = this.now();
    const counter = await this.options.store.consume(
      `tenant:${input.rateLimitClass}:${input.tenantId}:${input.route}`,
      { ...rule, now }
    );
    if (counter.allowed) {
      return { state: 'allow' };
    }
    return {
      state: 'throttle',
      retryAfterSeconds: retryAfterSeconds(counter.resetAt, now),
    };
  }
}

export interface LoginAbusePolicy {
  windowMs: number;
  accountThrottleFailures: number;
  accountCaptchaFailures: number;
  ipThrottleFailures: number;
  ipCaptchaFailures: number;
  pairTemporaryBlockFailures: number;
}

const DEFAULT_LOGIN_POLICY: LoginAbusePolicy = {
  windowMs: 15 * 60_000,
  accountThrottleFailures: 5,
  accountCaptchaFailures: 10,
  ipThrottleFailures: 12,
  ipCaptchaFailures: 20,
  pairTemporaryBlockFailures: 12,
};

export interface LoginAbuseProtectorOptions {
  store: RateLimitStore;
  policy?: Partial<LoginAbusePolicy>;
  now?: () => number;
}

/**
 * Credential providers call check() before verification, recordFailure() for
 * every rejected credential pair, and recordSuccess() only after a verified
 * login. The account key is hashed to avoid storing raw login identifiers in
 * rate-limit backends. Callers keep login error messages identical regardless
 * of account existence or abuse state.
 */
export class LoginAbuseProtector {
  private readonly policy: LoginAbusePolicy;
  private readonly now: () => number;

  constructor(private readonly options: LoginAbuseProtectorOptions) {
    this.policy = { ...DEFAULT_LOGIN_POLICY, ...options.policy };
    this.now = options.now ?? Date.now;
  }

  async check(input: LoginAbuseInput): Promise<AbuseDecision> {
    const now = this.now();
    const [ip, account, pair] = await Promise.all([
      this.options.store.get(this.ipKey(input.ip), now),
      this.options.store.get(this.accountKey(input.accountId), now),
      this.options.store.get(this.pairKey(input.accountId, input.ip), now),
    ]);
    return this.decision({ ip, account, pair }, now);
  }

  async recordFailure(input: LoginAbuseInput): Promise<AbuseDecision> {
    const now = this.now();
    const rule = { max: Number.MAX_SAFE_INTEGER, windowMs: this.policy.windowMs, now };
    const [ip, account, pair] = await Promise.all([
      this.options.store.consume(this.ipKey(input.ip), rule),
      this.options.store.consume(this.accountKey(input.accountId), rule),
      this.options.store.consume(this.pairKey(input.accountId, input.ip), rule),
    ]);
    return this.decision({ ip, account, pair }, now);
  }

  async recordSuccess(input: LoginAbuseInput): Promise<void> {
    await Promise.all([
      this.options.store.reset(this.accountKey(input.accountId)),
      this.options.store.reset(this.pairKey(input.accountId, input.ip)),
    ]);
  }

  private decision(
    counters: {
      ip: RateLimitCounter | undefined;
      account: RateLimitCounter | undefined;
      pair: RateLimitCounter | undefined;
    },
    now: number
  ): AbuseDecision {
    const retryAfter = retryAfterSeconds(
      Math.max(
        counters.ip?.resetAt ?? now,
        counters.account?.resetAt ?? now,
        counters.pair?.resetAt ?? now
      ),
      now
    );
    if ((counters.pair?.count ?? 0) >= this.policy.pairTemporaryBlockFailures) {
      return { state: 'temporary_block', retryAfterSeconds: retryAfter };
    }
    if (
      (counters.account?.count ?? 0) >= this.policy.accountCaptchaFailures ||
      (counters.ip?.count ?? 0) >= this.policy.ipCaptchaFailures
    ) {
      return { state: 'captcha_required', retryAfterSeconds: retryAfter };
    }
    if (
      (counters.account?.count ?? 0) >= this.policy.accountThrottleFailures ||
      (counters.ip?.count ?? 0) >= this.policy.ipThrottleFailures
    ) {
      return { state: 'throttle', retryAfterSeconds: retryAfter };
    }
    return { state: 'allow' };
  }

  private ipKey(ip: string): string {
    return `login:ip:${ip}`;
  }

  private accountKey(accountId: string): string {
    return `login:account:${hashAccountId(accountId)}`;
  }

  private pairKey(accountId: string, ip: string): string {
    return `login:pair:${hashAccountId(accountId)}:${ip}`;
  }
}

interface LoginAbuseInput {
  accountId: string;
  ip: string;
}

export function classifyRateLimitRequest(method: string, url: string): RateLimitClass {
  const path = url.split('?')[0] ?? url;
  const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  if (path === '/auth/login' || path === '/customer-auth/login') {
    return RateLimitClass.AUTH_LOGIN;
  }
  if (/^\/(auth|customer-auth)\/(forgot|recover|reset)/.test(path)) {
    return RateLimitClass.AUTH_RECOVERY;
  }
  if (/^\/webhooks?\//.test(path)) {
    return RateLimitClass.WEBHOOK_EXTERNAL;
  }
  if (/^\/platform\//.test(path)) {
    return RateLimitClass.SYSTEM_INTERNAL;
  }
  // Client Onboarding (Agent 02): unauthenticated, token-only enrollment
  // surface -- classified with the anonymous class rather than
  // STAFF_READ/STAFF_WRITE so it gets the strict, IP-scoped anonymous
  // policy regardless of authentication state.
  if (/^\/enrollment-api\//.test(path)) {
    return RateLimitClass.PUBLIC_ANONYMOUS;
  }
  // Commercial Partners (Agent 04): unauthenticated, token-only partner
  // link resolve/convert surface -- same rationale as /enrollment-api/
  // above.
  if (/^\/partner-link-api\//.test(path)) {
    return RateLimitClass.PUBLIC_ANONYMOUS;
  }
  if (path === '/health' || path === '/readiness') {
    return RateLimitClass.PUBLIC_ANONYMOUS;
  }
  if (/^\/customer-api\//.test(path)) {
    return isWrite ? RateLimitClass.CUSTOMER_WRITE : RateLimitClass.CUSTOMER_READ;
  }
  // Commercial Partners (Agent 04): authenticated self-scope partner
  // portal -- reuses the CUSTOMER_READ/WRITE policy shape (external,
  // non-staff caller) rather than STAFF_READ/WRITE.
  if (/^\/partner-api\//.test(path)) {
    return isWrite ? RateLimitClass.CUSTOMER_WRITE : RateLimitClass.CUSTOMER_READ;
  }
  if (
    isWrite &&
    /(\/bookings?\/[^/]+\/cancel$|\/financial(?:\/|$)|\/payments?(?:\/|$)|\/(sales|proposals?)(?:\/|$))/.test(
      path
    )
  ) {
    return RateLimitClass.SENSITIVE_MUTATION;
  }
  return isWrite ? RateLimitClass.STAFF_WRITE : RateLimitClass.STAFF_READ;
}

function hashAccountId(accountId: string): string {
  return createHash('sha256').update(accountId.trim().toLowerCase()).digest('hex');
}

function retryAfterSeconds(resetAt: number, now: number): number {
  return Math.max(1, Math.ceil((resetAt - now) / 1000));
}

function parseBoolean(value: string | undefined, name: string, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new Error(`${name} must be either "true" or "false".`);
}

function parsePositiveInteger(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (!/^\d+$/.test(value) || Number(value) < 1 || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return Number(value);
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Creates and connects a Redis-backed RateLimitStore from environment variables.
 * Fails closed: throws if REDIS_URL is invalid or connection cannot be established.
 *
 * Connection failure is intentional: a production rate limiter must not silently
 * degrade to in-memory state when the distributed store is unavailable, as that
 * would allow unlimited abuse from different processes. Instead, the service
 * fails to start, alerting infrastructure to the misconfiguration or unavailable
 * Redis instance.
 *
 * @throws Error if REDIS_URL is missing, malformed, or Redis connection fails
 */
export async function createRedisRateLimitStore(
  environment: RateLimitRuntimeEnvironment
): Promise<RedisRateLimitStore> {
  const redisUrl = environment.REDIS_URL;
  if (!isNonEmptyString(redisUrl)) {
    throw new Error(
      'createRedisRateLimitStore requires REDIS_URL to be set in the environment.'
    );
  }

  // Validate URL format
  let url: URL;
  try {
    url = new URL(redisUrl);
  } catch {
    throw new Error(
      `REDIS_URL is invalid: "${redisUrl.substring(0, 20)}..." does not parse as a valid URL.`
    );
  }

  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error(
      `REDIS_URL has invalid protocol "${url.protocol}"; must be "redis:" or "rediss:" (TLS).`
    );
  }

  // Create Redis client with connection options
  const client = createClient({
    url: redisUrl,
    // Socket options for reliability
    socket: {
      // Reconnect up to 10 times before failing, with exponential backoff
      reconnectStrategy: (retries: number) => {
        if (retries > 10) {
          return new Error('Redis reconnection max retries exceeded');
        }
        // Exponential backoff: 50ms base, up to 5s max
        return Math.min(50 * Math.pow(2, retries), 5000);
      },
      // Connection timeout: fail fast if Redis does not respond
      connectTimeout: 10000,
      // Keep-alive interval to detect stale connections
      keepAlive: 30000,
    },
  });

  // Set up error handler for connection errors
  client.on('error', (error: Error) => {
    console.error('Redis connection error:', error.message);
  });

  // Attempt connection; fail closed if connection cannot be established
  try {
    await client.connect();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to connect to Redis at ${redisUrl.split('@')[1] || 'configured URL'}: ${message}`
    );
  }

  return new RedisRateLimitStore(client);
}
