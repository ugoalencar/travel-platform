// ============================================================
// VERSION / RELEASE METADATA (ops/release hardening -- Wave 2, Agent 01)
// ============================================================
// Exposes appVersion / buildSha / migrationVersion / deploymentId /
// releasedAt per RELEASE_UPDATE_STRATEGY.md. Deliberately unauthenticated
// (mounted next to /health) -- none of these fields are sensitive, and a
// release/rollback runbook needs to be able to curl it without a token.
// Never includes a stack trace or a filesystem path in its response body.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

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
  /** Directory containing the numbered migration .sql files. */
  migrationsDir?: string;
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

const MIGRATIONS_DIR_FROM_SOURCE = resolve(__dirname, '../../../infrastructure/migrations');
const MIGRATIONS_DIR_FROM_DIST = resolve(__dirname, '../../../../../../infrastructure/migrations');
const MIGRATIONS_DIR_CANDIDATES = [MIGRATIONS_DIR_FROM_SOURCE, MIGRATIONS_DIR_FROM_DIST];

const DEFAULT_PACKAGE_DIR =
  firstExistingDir(PACKAGE_DIR_CANDIDATES, 'package.json') ?? PACKAGE_DIR_FROM_SOURCE;
const DEFAULT_MIGRATIONS_DIR =
  MIGRATIONS_DIR_CANDIDATES.find((dir) => existsSync(dir)) ?? MIGRATIONS_DIR_FROM_SOURCE;

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
 * Highest applied migration, identified by filename convention
 * (`NNN_description.sql`, numbered ascending -- see infrastructure/
 * migrations/). This reads the migrations directory shipped with THIS
 * build, not a live "what has actually been run against the DB" check --
 * it answers "what migration is this deployed code's schema expectation
 * at", which is the meaning RELEASE_UPDATE_STRATEGY.md's migrationVersion
 * field wants for release/rollback bookkeeping.
 */
function readMigrationVersion(migrationsDir: string): string {
  try {
    const files = readdirSync(migrationsDir).filter((name) => /^\d+_.+\.sql$/.test(name));
    if (files.length === 0) {
      return 'unknown';
    }
    files.sort();
    const latest = files[files.length - 1];
    return latest ? latest.replace(/\.sql$/, '') : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function resolveVersionInfo(options: ResolveVersionInfoOptions = {}): VersionInfo {
  const environment = options.environment ?? process.env;
  const packageDir = options.packageDir ?? DEFAULT_PACKAGE_DIR;
  const migrationsDir = options.migrationsDir ?? DEFAULT_MIGRATIONS_DIR;

  return {
    appVersion: readAppVersion(packageDir),
    buildSha: environment.GIT_SHA ?? environment.BUILD_SHA ?? environment.VERCEL_GIT_COMMIT_SHA ?? 'unknown',
    migrationVersion: readMigrationVersion(migrationsDir),
    deploymentId: environment.DEPLOYMENT_ID ?? environment.RENDER_INSTANCE_ID ?? 'unknown',
    releasedAt: environment.RELEASED_AT ?? 'unknown',
  };
}
