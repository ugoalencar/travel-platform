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
