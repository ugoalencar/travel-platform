import { Pool, types, type PoolClient } from 'pg';
import { getTenantContext, runWithTenantContext } from './tenant-context';

export type TenantClient = PoolClient;

/**
 * DATE columns are returned as raw 'YYYY-MM-DD' strings (never Date
 * objects), so date-only values are stable across timezones and always
 * JSON-serialize as plain dates.
 */
const DATE_OID: number = types.builtins.DATE;

const POOL_TYPES = {
  getTypeParser(oid: number, format?: 'text' | 'binary'): (value: string) => unknown {
    if (oid === DATE_OID) return (value: string) => value;
    return types.getTypeParser(oid, format) as (value: string) => unknown;
  },
};

export interface LiteDatabase {
  pool: Pool;
  /**
   * Runs `operation` inside a transaction with the tenant GUC set from the
   * AsyncLocalStorage context (never from client input). Mirrors
   * services/api/src/database.ts withTenantTransaction.
   */
  withTenantTransaction<T>(operation: (client: TenantClient) => Promise<T>): Promise<T>;
  /**
   * Runs `operation` inside a transaction with an explicit tenant context.
   * Used by authentication flows (login/session verification) which run
   * before — or without — the request tenant context.
   */
  runAsTenant<T>(tenantId: string, userId: string | null, operation: (client: TenantClient) => Promise<T>): Promise<T>;
  /**
   * Runs `operation` with a session-local GUC set (never the tenant GUC)
   * for callers with no tenant context at all -- an anonymous visitor
   * holding a raw token from an e-mail. The RLS policy for the target
   * table must match rows by that exact GUC value (see
   * infrastructure/migrations-travel-lite/007_password_reset_tokens.sql);
   * no other row is ever visible or updatable through this path. Mirrors
   * services/api/src/database.ts withPublicLookupTransaction.
   */
  withPublicLookupTransaction<T>(
    gucName: string,
    lookupValue: string,
    operation: (client: TenantClient) => Promise<T>,
  ): Promise<T>;
  end(): Promise<void>;
}

async function setTenantGuc(client: PoolClient, tenantId: string, userId: string | null): Promise<void> {
  await client.query('SELECT set_tenant_context($1, $2)', [tenantId, userId ?? null]);
}

export function createDatabase(connectionString: string, poolConfig: { max?: number } = {}): LiteDatabase {
  const pool = new Pool({
    connectionString,
    max: poolConfig.max ?? 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    types: POOL_TYPES,
  });

  async function withClient<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      return await operation(client);
    } finally {
      client.release();
    }
  }

  return {
    pool,

    async withTenantTransaction<T>(operation: (client: TenantClient) => Promise<T>): Promise<T> {
      const context = getTenantContext();
      return withClient(async (client) => {
        await client.query('BEGIN');
        try {
          await setTenantGuc(client, context.tenantId, context.userId || null);
          const result = await operation(client);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw error;
        }
      });
    },

    async runAsTenant<T>(
      tenantId: string,
      userId: string | null,
      operation: (client: TenantClient) => Promise<T>,
    ): Promise<T> {
      return runWithTenantContext(
        // System context (login, session lookup): no permissions at all.
        {
          tenantId,
          userId: userId ?? '',
          sessionId: '',
          email: '',
          role: '',
          roleRank: 0,
          grantsAll: false,
          permissions: new Set<string>(),
          sellerId: null,
        },
        () =>
          withClient(async (client) => {
            await client.query('BEGIN');
            try {
              await setTenantGuc(client, tenantId, userId);
              const result = await operation(client);
              await client.query('COMMIT');
              return result;
            } catch (error) {
              await client.query('ROLLBACK').catch(() => undefined);
              throw error;
            }
          }),
      );
    },

    async withPublicLookupTransaction<T>(
      gucName: string,
      lookupValue: string,
      operation: (client: TenantClient) => Promise<T>,
    ): Promise<T> {
      return withClient(async (client) => {
        await client.query('BEGIN');
        try {
          // set_config(..., true) is session-local (dies at COMMIT/ROLLBACK),
          // so a pooled connection never carries one caller's lookup value
          // into the next. No tenant GUC is set here -- current_tenant_id()
          // stays NULL, which the RLS "public_token" policy requires.
          await client.query('SELECT set_config($1, $2, true)', [gucName, lookupValue]);
          const result = await operation(client);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw error;
        }
      });
    },

    async end(): Promise<void> {
      await pool.end();
    },
  };
}
