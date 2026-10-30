import { Pool } from 'pg';
import { createDatabaseRuntime, createPlatformDatabaseRuntime } from './database';
import { assertSafeDatabasePools, validateNonProductionDatabaseTargets, validateProductionEnvironment } from './env';
import { resolveDatabaseTls } from './database-tls';
import { runManagedBackupWorkerOnce } from './managed-backup-worker-service';

const INTERVAL_MS = 30_000;
let stopping = false;

function createPool(connectionString: string | undefined): Pool {
  return new Pool({
    ...resolveDatabaseTls(connectionString),
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT ?? 30_000),
    connectionTimeoutMillis: Number(process.env.DB_POOL_CONNECTION_TIMEOUT ?? 5_000),
  });
}

async function main(): Promise<void> {
  validateProductionEnvironment();
  validateNonProductionDatabaseTargets();
  const tenantPool = createPool(process.env.DATABASE_URL);
  const platformUrl = process.env.PLATFORM_DATABASE_URL && process.env.PLATFORM_DATABASE_URL !== process.env.DATABASE_URL
    ? process.env.PLATFORM_DATABASE_URL
    : process.env.DATABASE_URL;
  const platformPool = platformUrl === process.env.DATABASE_URL ? tenantPool : createPool(platformUrl);
  const runtime = createPlatformDatabaseRuntime(platformPool);
  const candidateRuntime = createDatabaseRuntime(tenantPool, platformPool);
  try {
    await assertSafeDatabasePools(tenantPool, platformPool);
    while (!stopping) {
      const result = await runManagedBackupWorkerOnce({ platformDatabase: runtime, candidateDatabase: candidateRuntime });
      if (result.claimed > 0 || result.failed > 0) {
        process.stdout.write(`Managed backup worker: claimed=${result.claimed} succeeded=${result.succeeded} failed=${result.failed}\n`);
      }
      await new Promise<void>(resolve => setTimeout(resolve, INTERVAL_MS));
    }
  } finally {
    await tenantPool.end();
    if (platformPool !== tenantPool) await platformPool.end();
  }
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => { stopping = true; });
}

void main().catch(() => {
  process.stderr.write('Managed backup worker stopped because startup or a worker cycle failed. Check configuration and service diagnostics.\n');
  process.exitCode = 1;
});
