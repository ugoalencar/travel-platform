// ============================================================
// VERSION / RELEASE METADATA (ops/release hardening -- Wave 2, Agent 01)
// ============================================================
// Exposes appVersion / buildSha / migrationVersion / deploymentId /
// releasedAt per RELEASE_UPDATE_STRATEGY.md. Deliberately unauthenticated
// (mounted next to /health) -- none of these fields are sensitive, and a
// release/rollback runbook needs to be able to curl it without a token.
// Never includes a stack trace or a filesystem path in its response body.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DatabaseRuntime } from './database';

export interface VersionInfo {
  appVersion: string;
  buildSha: string;
  migrationVersion: string;
  deploymentId: string;
  releasedAt: string;
}

interface ResolveVersionInfoOptions {
  /** Directory containing services/api/package.json. Defaults to this file's package root. */
  packageDir?: string;
  environment?: NodeJS.ProcessEnv;
}

// __dirname (not import.meta.dirname): services/api builds to CommonJS
// (tsconfig.build.json), which does not support import.meta.
//
// This file's __dirname differs between "running from source"
// (services/api/src, vitest) and "running compiled" (tsconfig.build.json's
// rootDir mirrors the full repo-root-relative path under dist/, so
// __dirname becomes services/api/dist/services/api/src). Rather than
// hardcode one specific ".." depth and silently break under whichever
// layout wasn't tested, every plausible candidate is tried and the first
// one that actually contains the expected marker file/dir wins.
function firstExistingDir(candidates: string[], marker: string): string | undefined {
  return candidates.find((dir) => existsSync(resolve(dir, marker)));
}

const PACKAGE_DIR_FROM_SOURCE = resolve(__dirname, '..'); // src -> services/api (running from source)
const PACKAGE_DIR_FROM_DIST = resolve(__dirname, '../../../..'); // dist/services/api/src -> services/api (compiled)
const PACKAGE_DIR_CANDIDATES = [PACKAGE_DIR_FROM_SOURCE, PACKAGE_DIR_FROM_DIST];

const DEFAULT_PACKAGE_DIR =
  firstExistingDir(PACKAGE_DIR_CANDIDATES, 'package.json') ?? PACKAGE_DIR_FROM_SOURCE;

interface PackageJsonWithVersion {
  version: string;
}

function hasStringVersion(value: unknown): value is PackageJsonWithVersion {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    typeof (value as Record<string, unknown>).version === 'string'
  );
}

function readAppVersion(packageDir: string): string {
  try {
    const raw = readFileSync(resolve(packageDir, 'package.json'), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (hasStringVersion(parsed)) {
      return parsed.version;
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Highest migration actually applied to the connected database, read from
 * schema_migrations (097). This is the database's real state, not the set of
 * migration files shipped with the build. Any failure (table not created
 * yet, database unreachable) degrades to 'unknown' so /version never fails.
 */
export async function readAppliedMigrationVersion(database: DatabaseRuntime): Promise<string> {
  try {
    const result = await database.withPlatformTransaction((client) =>
      client.query<{ version: string | null }>('SELECT max(version) AS version FROM schema_migrations'),
    );
    return result.rows[0]?.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  return values.find((value) => value !== undefined && value.trim() !== '')?.trim() ?? 'unknown';
}

export function resolveVersionInfo(options: ResolveVersionInfoOptions = {}): VersionInfo {
  const environment = options.environment ?? process.env;
  const packageDir = options.packageDir ?? DEFAULT_PACKAGE_DIR;

  return {
    appVersion: readAppVersion(packageDir),
    // RENDER_GIT_COMMIT is injected by Render for every git-backed deploy, so
    // it is the authoritative SHA there; GIT_SHA/BUILD_SHA stay as explicit
    // overrides for other hosts and CI images.
    buildSha: firstNonEmpty(
      environment.RENDER_GIT_COMMIT,
      environment.GIT_SHA,
      environment.BUILD_SHA,
      environment.VERCEL_GIT_COMMIT_SHA,
    ),
    // Filled from the database by the /version route (readAppliedMigrationVersion).
    migrationVersion: 'unknown',
    deploymentId: environment.DEPLOYMENT_ID ?? environment.RENDER_INSTANCE_ID ?? 'unknown',
    releasedAt: environment.RELEASED_AT ?? 'unknown',
  };
}
