import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { getTenantContext } from '../../../packages/domain/tenant-context';

export interface TenantTransactionClient {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
}

export interface DatabaseRuntime {
  withTenantTransaction<T>(
    operation: (client: TenantTransactionClient) => Promise<T>,
  ): Promise<T>;
  withPlatformTransaction<T>(
    operation: (client: TenantTransactionClient) => Promise<T>,
  ): Promise<T>;
}

// ============================================================
// PLATFORM-SCOPED RUNTIME
// Deliberately separate from DatabaseRuntime.withTenantTransaction(),
// which always pulls agency_id/user_id from the AMBIENT request tenant
// context (getTenantContext()). This runtime instead takes an EXPLICIT
// target agencyId supplied by the caller, so it can only ever be reached
// from a narrow, explicitly platform-scoped code path (see
// entitlements.ts / the /platform/entitlements route) -- never from
// ordinary agency-authenticated request handling. See entitlements.ts
// for the full "why" (Offer & Growth Engine batch, section H: there is
// no real platform-admin identity in this codebase yet -- this is a
// documented temporary stopgap, not a real security boundary).
// ============================================================

export interface PlatformDatabaseRuntime {
  withAgencyTransaction<T>(
    targetAgencyId: string,
    actorLabel: string | null,
    operation: (client: TenantTransactionClient) => Promise<T>,
  ): Promise<T>;
}

export function createPlatformDatabaseRuntime(pool: Pool): PlatformDatabaseRuntime {
  return {
    async withAgencyTransaction<T>(
      targetAgencyId: string,
      actorLabel: string | null,
      operation: (client: TenantTransactionClient) => Promise<T>,
    ): Promise<T> {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        await client.query('SELECT set_tenant_context($1, $2)', [targetAgencyId, actorLabel]);

        const result = await operation(createTransactionClient(client));
        await client.query('COMMIT');
        return result;
      } catch (error: unknown) {
        await rollbackQuietly(client);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export function createDatabaseRuntime(pool: Pool): DatabaseRuntime {
  return {
    async withTenantTransaction<T>(
      operation: (client: TenantTransactionClient) => Promise<T>,
    ): Promise<T> {
      const context = getTenantContext();
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        await client.query('SELECT set_tenant_context($1, $2)', [
          context.agencyId,
          context.userId,
        ]);

        const result = await operation(createTransactionClient(client));
        await client.query('COMMIT');
        return result;
      } catch (error: unknown) {
        await rollbackQuietly(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async withPlatformTransaction<T>(
      operation: (client: TenantTransactionClient) => Promise<T>,
    ): Promise<T> {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        const result = await operation(createTransactionClient(client));
        await client.query('COMMIT');
        return result;
      } catch (error: unknown) {
        await rollbackQuietly(client);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

function createTransactionClient(client: PoolClient): TenantTransactionClient {
  return {
    query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: readonly unknown[],
    ): Promise<QueryResult<T>> {
      return client.query<T>(text, values ? [...values] : undefined);
    },
  };
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    // The original error is more useful than a rollback failure.
  }
}
