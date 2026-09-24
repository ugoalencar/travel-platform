import { Pool } from 'pg';
import { buildApp } from './app';
import { createCustomerAccessValidator } from './customer-portal';
import { createDatabaseRuntime, createPlatformDatabaseRuntime } from './database';
import {
  composeUserAgencyValidators,
  createServerAccessValidator,
  createServerAuthProvider,
  createServerCustomerAuthProvider,
  createStaffAccessValidator,
} from './dev-auth';
import { assertSafeDatabaseRole, validateProductionEnvironment } from './env';
import { createServerPlatformAuthProvider } from './platform-dev-auth';
import { createRedisRateLimitStore, resolveRateLimitRuntimeConfig, type RedisClientInstance } from './rate-limit';

// Fail-closed production startup gate: throws synchronously if required
// config is missing/malformed, or if a prohibited flag (ALLOW_DEV_AUTH) is
// set in production. No-op outside NODE_ENV=production, so this never
// affects local dev or test runs.
validateProductionEnvironment();

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';

// Production pool configuration: limits concurrent connections, enforces
// statement timeouts, and validates connections before use. These settings
// protect against resource exhaustion and long-running queries.
function createPool(connectionString: string | undefined): Pool {
  return new Pool({
    connectionString,
    // Max concurrent connections (default 10). In production, scale this to
    // match your expected concurrency. E.g., 20-50 for typical apps, higher
    // for high-throughput services. Adjust based on actual load testing.
    max: Number(process.env.DB_POOL_MAX ?? 20),
    // Idle connection timeout: close connections idle > 30s to free resources.
    // Queries in progress are not affected; only connections awaiting work.
    idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT ?? 30000),
    // Connection acquisition timeout: fail fast (5s) if no connection is
    // available, rather than queueing requests indefinitely.
    connectionTimeoutMillis: Number(process.env.DB_POOL_CONNECTION_TIMEOUT ?? 5000),
  });
}

// F-06: dual pools. Tenant requests run on DATABASE_URL (runtime role,
// no platform-table grants). Platform operations (withPlatformTransaction
// + PlatformDatabaseRuntime) run on PLATFORM_DATABASE_URL (platform role,
// superset). Required in production by validateProductionEnvironment();
// outside production falls back to DATABASE_URL so local dev and tests
// that only exercise tenant paths keep working on a single role.
const pool = createPool(process.env.DATABASE_URL);
const platformConnectionString =
  process.env.PLATFORM_DATABASE_URL && process.env.PLATFORM_DATABASE_URL !== process.env.DATABASE_URL
    ? process.env.PLATFORM_DATABASE_URL
    : process.env.DATABASE_URL;
const platformPool =
  platformConnectionString === process.env.DATABASE_URL ? pool : createPool(platformConnectionString);

// Shared between both buildApp() call sites below (baseAppOptions +
// rateLimit.store when external). Kept as a function, not a call-once
// object, so nothing here is evaluated before we know whether an external
// rate-limit store is required.
function baseAppOptions() {
  return {
    authProvider: createServerAuthProvider(),
    validateUserAgencyAccess: composeUserAgencyValidators(createServerAccessValidator(), createStaffAccessValidator(pool)),
    database: createDatabaseRuntime(pool, platformPool),
    platformDatabase: createPlatformDatabaseRuntime(platformPool),
    // Explicit platform auth provider (F-01): production always gets the
    // deny-all provider; outside production the dual-gated dev provider.
    // buildApp()'s default is also deny-all, but the real server never
    // relies on that default.
    platformAuthProvider: createServerPlatformAuthProvider(),
    // Customer portal: identity comes only from createServerCustomerAuthProvider()
    // (dev-only, dual-gated -- see dev-auth.ts). validateCustomerAgencyAccess is
    // NOT dev-only -- it is a real DB query (customers table) run regardless of
    // ALLOW_DEV_AUTH, so a misconfigured dev header can never grant access to a
    // customer who does not actually belong to the resolved agency.
    customerAuthProvider: createServerCustomerAuthProvider(),
    validateCustomerAgencyAccess: createCustomerAccessValidator(pool),
    readinessCheck: async () => {
      await pool.query('SELECT 1');
      if (platformPool !== pool) {
        await platformPool.query('SELECT 1');
      }
    },
    dbPoolStats: () => ({
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    }),
  };
}

// buildApp()'s rate-limit hook throws synchronously when
// RATE_LIMIT_STORE=external and no store has been injected yet (by design
// -- see createRateLimitHooks in app.ts, a fail-closed guard against
// silently falling back to the single-instance in-memory store in
// production). The external Redis store can only be created async (below,
// in main()), so building `app` here at module scope must be skipped
// entirely in that case -- building it early and unconditionally would
// crash on every production boot that uses external rate limiting, before
// main() ever runs. `app` stays undefined until main() assigns it in that
// path; every other path (no external store, e.g. plain `npm run dev`)
// keeps building synchronously here exactly as before.
const initialRuntimeConfig = resolveRateLimitRuntimeConfig(process.env);
let app: ReturnType<typeof buildApp> | undefined =
  initialRuntimeConfig.store === 'external' ? undefined : buildApp(baseAppOptions());

let redisClientInstance: RedisClientInstance | undefined = undefined;

async function gracefulShutdown(signal: string): Promise<void> {
  if (!app) {
    // Received a signal before main() finished standing up the app
    // (external-rate-limit-store boot path only) -- nothing to drain yet.
    return;
  }
  app.log.info({ signal }, 'graceful shutdown initiated');

  try {
    // Close the HTTP server: stops accepting new requests, drains
    // existing connections with a timeout. Fastify.close() handles
    // in-flight request completion and SIGTERM coordination.
    await app.close();
    app.log.info({}, 'HTTP server closed');

    // Close Redis connection if established
    if (redisClientInstance) {
      await redisClientInstance.quit();
      app.log.info({}, 'Redis connection closed');
    }

    // Drain the database connection pool: waits for in-flight queries
    // to complete, then closes all idle connections. Does not kill
    // active queries; the timeout here is for cleanup only.
    await pool.end();
    if (platformPool !== pool) {
      await platformPool.end();
    }
    app.log.info({}, 'database pool drained');

    process.exitCode = 0;
  } catch (error: unknown) {
    app.log.error(error, 'error during graceful shutdown');
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  try {
    // Initialize rate limit store if external store is configured
    const runtimeConfig = resolveRateLimitRuntimeConfig(process.env);
    if (runtimeConfig.store === 'external') {
      const store = await createRedisRateLimitStore(process.env);
      redisClientInstance = store.redisClient;
      // First (and only, on this path) buildApp() call -- app was left
      // undefined at module scope specifically so this is where it happens.
      app = buildApp({ ...baseAppOptions(), rateLimit: { store } });
    }

    // Invariant: app is assigned either at module scope (non-external
    // store) or just above (external store) -- always defined by this
    // point. Narrows the type rather than asserting past a real gap.
    if (!app) {
      throw new Error('Internal error: app was not initialized before startup.');
    }

    // DB runtime role guard (production only): refuses to start if the
    // connected role is superuser or BYPASSRLS, since either would silently
    // defeat RLS tenant isolation. Does not modify role/RLS architecture --
    // it only reads the already-configured role's existing privileges.
    await assertSafeDatabaseRole(pool);
    await app.listen({ port, host });
    app.log.info({ host, port, service: 'api' }, 'service started');
  } catch (error: unknown) {
    app?.log.error(error);
    process.exitCode = 1;
  }
}

// Graceful shutdown on SIGTERM (orchestration shutdown signal) and SIGINT
// (ctrl-c / development termination). Both handlers drain connections and
// close the server cleanly before exiting.
process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT');
});

void main();
