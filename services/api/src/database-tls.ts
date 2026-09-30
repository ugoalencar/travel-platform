/**
 * TLS settings for the API's PostgreSQL pools.
 *
 * Without DATABASE_SSL_CA the connection string is used as-is (today:
 * `sslmode=require&uselibpqcompat=true` -- encrypted, certificate not
 * validated). With DATABASE_SSL_CA (PEM of the Supabase Root 2021 CA, `\n`
 * escapes accepted) the pool requires TLS AND validates the server
 * certificate chain and hostname (verify-full). `ssl*` query parameters are
 * then removed from the URL: pg lets connection-string values override the
 * `ssl` option, which would silently drop the validation.
 */
import type { PoolConfig } from 'pg';

const URL_SSL_PARAMS = ['sslmode', 'uselibpqcompat', 'sslrootcert', 'sslcert', 'sslkey', 'ssl'];

export function resolveDatabaseTls(
  connectionString: string | undefined,
  environment: NodeJS.ProcessEnv = process.env,
): Pick<PoolConfig, 'connectionString' | 'ssl'> {
  const ca = environment.DATABASE_SSL_CA?.trim();
  if (!connectionString || !ca) {
    return { connectionString };
  }

  const url = new URL(connectionString);
  for (const param of URL_SSL_PARAMS) {
    url.searchParams.delete(param);
  }

  return {
    connectionString: url.toString(),
    ssl: {
      ca: ca.replace(/\\n/g, '\n'),
      rejectUnauthorized: true,
      servername: url.hostname,
    },
  };
}
