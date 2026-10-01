/**
 * Travel Lite API configuration.
 *
 * Fail-closed: required values are validated at boot so a misconfigured
 * local install never starts silently. Non-production processes may only
 * target local database hosts (mirrors services/api/src/env.ts).
 */

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export interface ApiLiteConfig {
  nodeEnv: string;
  host: string;
  port: number;
  databaseUrl: string;
  migrationsDatabaseUrl: string;
  frontendDistDir: string | undefined;
}

function requireEnv(name: string, fallback: string | undefined): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function assertLocalDatabaseTarget(name: string, url: string): void {
  if (process.env.NODE_ENV === 'production') return;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${name} is not a valid PostgreSQL connection URL`);
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(`${name} must point to a local host in non-production environments (got ${parsed.hostname})`);
  }
}

export function loadConfig(overrides: Partial<ApiLiteConfig> = {}): ApiLiteConfig {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const databaseUrl = overrides.databaseUrl ?? requireEnv(
    'DATABASE_URL',
    'postgresql://travel_lite_runtime:travel_lite_runtime_password@127.0.0.1:55436/travel_lite',
  );
  // Migrations/seeds run as the local admin role; the runtime role is used
  // for every application query (subject to RLS). Default derivation keeps
  // local installs working without extra configuration.
  const migrationsDatabaseUrl =
    overrides.migrationsDatabaseUrl ??
    process.env.MIGRATIONS_DATABASE_URL ??
    databaseUrl.replace(/\/\/([^:]+):[^@]*@/, '//travel_lite_admin:travel_lite_admin_password@');
  assertLocalDatabaseTarget('DATABASE_URL', databaseUrl);
  assertLocalDatabaseTarget('MIGRATIONS_DATABASE_URL', migrationsDatabaseUrl);

  return {
    nodeEnv,
    host: overrides.host ?? process.env.HOST ?? '127.0.0.1',
    port: overrides.port ?? Number(process.env.PORT ?? 4010),
    databaseUrl,
    migrationsDatabaseUrl,
    frontendDistDir: overrides.frontendDistDir ?? process.env.FRONTEND_DIST_DIR,
  };
}
