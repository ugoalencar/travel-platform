// ============================================================
// PRODUCTION ENVIRONMENT / STARTUP SAFETY
// ============================================================
// Centralized, fail-closed validation for the small set of environment
// variables this service actually reads (see the `process.env` usages in
// dev-auth.ts, server.ts). Deliberately narrow: this repo does not yet wire
// up JWT_SECRET/COOKIE_*/RATE_LIMIT_* from services/api/src (those exist
// only as forward-looking placeholders in .env.example for unbuilt
// features), so validating them here would invent requirements the running
// code does not actually have.
//
// Both functions below are no-ops outside NODE_ENV=production, by design:
// production startup must fail closed, but `npm test`/local `npm run dev`
// must never be forced to set production-only secrets just to run.
import type { ServerEnvironment } from './dev-auth';

export type { ServerEnvironment };

const MIN_PORT = 1;
const MAX_PORT = 65535;

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidPort(value: string): boolean {
  if (!/^\d+$/.test(value)) {
    return false;
  }
  const port = Number(value);
  return port >= MIN_PORT && port <= MAX_PORT;
}

/**
 * Validates the environment required for a PRODUCTION server startup. This
 * is a fail-closed gate: it throws (rather than warning or defaulting) when
 * required configuration is missing or malformed, so a misconfigured
 * production deploy crashes at startup instead of serving traffic with an
 * unsafe or broken configuration.
 *
 * A no-op when NODE_ENV !== 'production' -- local dev and test runs must
 * never be forced to set production secrets just to start or run tests.
 */
export function validateProductionEnvironment(environment: ServerEnvironment = process.env): void {
  if (environment.NODE_ENV !== 'production') {
    return;
  }

  const issues: string[] = [];

  if (!isNonEmptyString(environment.DATABASE_URL)) {
    issues.push(
      'DATABASE_URL is required in production and must be a non-empty connection string.'
    );
  }

  if (environment.PORT !== undefined && !isValidPort(environment.PORT)) {
    issues.push(
      `PORT must be a valid TCP port number (${MIN_PORT}-${MAX_PORT}) when set; got "${environment.PORT}".`
    );
  }

  // PROHIBITED PRODUCTION FLAG: ALLOW_DEV_AUTH must never be active in
  // production. dev-auth.ts's isDevAuthEnabled() already refuses to honor
  // it when NODE_ENV === 'production' (a second, independent gate), but a
  // production deploy that has the flag set at all is itself a
  // misconfiguration worth failing loudly on rather than silently ignoring
  // -- it signals the deploy environment was copied from a dev/staging
  // template without being cleaned up.
  if (environment.ALLOW_DEV_AUTH === 'true') {
    issues.push(
      'ALLOW_DEV_AUTH must not be "true" in production (dev auth is a development/test-only bypass).'
    );
  }

  if (environment.RATE_LIMIT_STORE !== 'external') {
    issues.push(
      'RATE_LIMIT_STORE must be "external" in production. A shared distributed rate-limit store is required.'
    );
  }

  // When external store is configured, Redis connection must be available
  if (environment.RATE_LIMIT_STORE === 'external' && !isNonEmptyString(environment.REDIS_URL)) {
    issues.push('REDIS_URL is required in production when RATE_LIMIT_STORE is "external".');
  }

  if (issues.length > 0) {
    throw new Error(
      `Refusing to start: invalid production configuration.\n${issues.map((issue) => `  - ${issue}`).join('\n')}`
    );
  }
}

// ============================================================
// DATABASE RUNTIME ROLE GUARD
// ============================================================
// RLS is the tenant-isolation backbone of this app (see database.ts /
// packages/domain/tenant-context). A Postgres connection made through a
// superuser role, or a role with the BYPASSRLS attribute, silently ignores
// every RLS policy -- every withTenantTransaction() call would still
// "work" but stop actually isolating tenants. This does not change role
// architecture or RLS policy semantics; it only reads the already-granted
// privileges of whatever role the pool is already configured to connect as
// and refuses to start if that role would defeat RLS in production.
interface RoleRow {
  rolsuper: boolean;
  rolbypassrls: boolean;
}

export interface RoleCheckQueryable {
  query(text: string): Promise<{ rows: RoleRow[] }>;
}

/**
 * Verifies the role the pool is connected as does not have superuser or
 * BYPASSRLS privileges. No-op outside production. Throws (fail closed) if
 * the connected role would defeat RLS, or if role metadata could not be
 * read at all (an unreadable pg_roles row in production is itself treated
 * as unsafe -- we cannot prove RLS will hold, so we do not start).
 */
export async function assertSafeDatabaseRole(
  pool: RoleCheckQueryable,
  environment: ServerEnvironment = process.env
): Promise<void> {
  if (environment.NODE_ENV !== 'production') {
    return;
  }

  const result = await pool.query(
    'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'
  );
  const role = result.rows[0];

  if (!role) {
    throw new Error(
      "Refusing to start: could not read the connected database role's privileges from pg_roles " +
        '(current_user did not match any row). Unable to verify RLS will be enforced.'
    );
  }

  if (role.rolsuper) {
    throw new Error(
      'Refusing to start: the database connection uses a SUPERUSER role. Superuser connections ' +
        'bypass Row-Level Security entirely, silently defeating tenant isolation. Configure a ' +
        'non-superuser application role for production.'
    );
  }

  if (role.rolbypassrls) {
    throw new Error(
      'Refusing to start: the database connection role has BYPASSRLS. This silently defeats Row-Level ' +
        'Security tenant isolation. Configure the production application role without BYPASSRLS.'
    );
  }
}
