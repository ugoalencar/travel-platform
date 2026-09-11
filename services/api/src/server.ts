import { Pool } from 'pg';
import { buildApp } from './app';
import { createCustomerAccessValidator } from './customer-portal';
import { createDatabaseRuntime } from './database';
import {
  createServerAccessValidator,
  createServerAuthProvider,
  createServerCustomerAuthProvider,
} from './dev-auth';
import { assertSafeDatabaseRole, validateProductionEnvironment } from './env';
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
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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

let app = buildApp({
  authProvider: createServerAuthProvider(),
  validateUserAgencyAccess: createServerAccessValidator(),
  database: createDatabaseRuntime(pool),
  // Customer portal: identity comes only from createServerCustomerAuthProvider()
  // (dev-only, dual-gated -- see dev-auth.ts). validateCustomerAgencyAccess is
  // NOT dev-only -- it is a real DB query (customers table) run regardless of
  // ALLOW_DEV_AUTH, so a misconfigured dev header can never grant access to a
  // customer who does not actually belong to the resolved agency.
  customerAuthProvider: createServerCustomerAuthProvider(),
  validateCustomerAgencyAccess: createCustomerAccessValidator(pool),
  readinessCheck: async () => {
    await pool.query('SELECT 1');
  },
  dbPoolStats: () => ({
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  }),
});

let redisClientInstance: RedisClientInstance | undefined = undefined;

async function gracefulShutdown(signal: string): Promise<void> {
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
      // Recreate app with Redis store if configured
      app = buildApp({
        authProvider: createServerAuthProvider(),
        validateUserAgencyAccess: createServerAccessValidator(),
        database: createDatabaseRuntime(pool),
        customerAuthProvider: createServerCustomerAuthProvider(),
        validateCustomerAgencyAccess: createCustomerAccessValidator(pool),
        readinessCheck: async () => {
          await pool.query('SELECT 1');
        },
        dbPoolStats: () => ({
          total: pool.totalCount,
          idle: pool.idleCount,
          waiting: pool.waitingCount,
        }),
        rateLimit: {
          store,
        },
      });
    }

    // DB runtime role guard (production only): refuses to start if the
    // connected role is superuser or BYPASSRLS, since either would silently
    // defeat RLS tenant isolation. Does not modify role/RLS architecture --
    // it only reads the already-configured role's existing privileges.
    await assertSafeDatabaseRole(pool);
    await app.listen({ port, host });
    app.log.info({ host, port, service: 'api' }, 'service started');
  } catch (error: unknown) {
    app.log.error(error);
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
