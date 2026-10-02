#!/usr/bin/env node
/**
 * Travel Lite ONLINE migration runner — the only script authorized to run
 * infrastructure/migrations-travel-lite/*.sql against a REMOTE database
 * (Render or any other online host).
 *
 * scripts/travel-lite-migrate.cjs (the local runner) refuses NODE_ENV=production
 * and any non-local host on purpose — that guard stays untouched. This is a
 * SEPARATE, standalone script instead of a flag on the local one, so the two
 * never share a single "unlock" switch that a copy-pasted env var could
 * accidentally flip.
 *
 * Fail-closed, with two independent gates, both required:
 *
 *   1. MIGRATIONS_DATABASE_URL must be set explicitly — no local fallback
 *      exists here (unlike the local script), and its host must NOT be a
 *      local/loopback/docker-internal name (this script refuses to touch a
 *      local database; use the local script for that).
 *   2. TRAVEL_LITE_ONLINE_MIGRATION_CONFIRM_HOST must be set to the EXACT
 *      hostname parsed from MIGRATIONS_DATABASE_URL. This is a deliberate
 *      "retype the target to confirm" gate: it does nothing to stop someone
 *      who truly intends to run against that host, but it stops the far
 *      more common accident — a stale/copy-pasted connection string left
 *      over from another project or environment — because the operator has
 *      to consciously read the host out of the URL they are about to use
 *      and type it again as a second value.
 *
 * Usage:
 *   MIGRATIONS_DATABASE_URL="postgresql://...@<render-host>/travel_lite" \
 *   TRAVEL_LITE_ONLINE_MIGRATION_CONFIRM_HOST="<render-host>" \
 *   node scripts/travel-lite-migrate-online.cjs
 *
 * Optional:
 *   TRAVEL_LITE_ONLINE_MIGRATION_DRY_RUN=true   lists pending migrations and exits; applies nothing.
 *
 * Never run this against the Travel Platform (Full) database. This only
 * ever touches infrastructure/migrations-travel-lite/*.sql, the same
 * idempotent `migrations` control table as the local script, so re-running
 * it is always safe (already-applied files are skipped).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { Pool } = require('pg');

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', 'host.docker.internal']);

function isLocalHost(hostname) {
  const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  if (LOCAL_HOSTS.has(host)) return true;
  // docker-compose service names have no dots (e.g. `postgres`)
  return host.length > 0 && !host.includes('.') && !host.includes(':');
}

function fail(message) {
  console.error(`[travel-lite-migrate-online] refused: ${message}`);
  process.exit(1);
}

function resolveTarget() {
  const databaseUrl = process.env.MIGRATIONS_DATABASE_URL;
  if (!databaseUrl || databaseUrl.trim() === '') {
    fail('MIGRATIONS_DATABASE_URL is required (no local fallback exists in this script).');
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl.trim());
  } catch {
    fail('MIGRATIONS_DATABASE_URL is not a valid PostgreSQL connection URL.');
  }

  if (isLocalHost(parsed.hostname)) {
    fail(
      `MIGRATIONS_DATABASE_URL host "${parsed.hostname}" looks local. ` +
        'This script only runs against remote hosts — use scripts/travel-lite-migrate.cjs for local targets.',
    );
  }

  const confirmHost = process.env.TRAVEL_LITE_ONLINE_MIGRATION_CONFIRM_HOST;
  if (!confirmHost || confirmHost.trim() === '') {
    fail(
      'TRAVEL_LITE_ONLINE_MIGRATION_CONFIRM_HOST is required: set it to the exact host you see in ' +
        'MIGRATIONS_DATABASE_URL, as a deliberate confirmation that this is the database you mean to migrate.',
    );
  }
  if (confirmHost.trim() !== parsed.hostname) {
    fail(
      `TRAVEL_LITE_ONLINE_MIGRATION_CONFIRM_HOST ("${confirmHost.trim()}") does not match the host in ` +
        `MIGRATIONS_DATABASE_URL ("${parsed.hostname}"). Refusing to guess which one is right.`,
    );
  }

  return { databaseUrl: databaseUrl.trim(), host: parsed.hostname, database: parsed.pathname.replace(/^\//, '') };
}

async function run() {
  const target = resolveTarget();
  const dryRun = process.env.TRAVEL_LITE_ONLINE_MIGRATION_DRY_RUN === 'true';

  console.log(
    `[travel-lite-migrate-online] target host=${target.host} database=${target.database} dryRun=${dryRun}`,
  );

  const pool = new Pool({ connectionString: target.databaseUrl });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const migrationsDir = path.join(__dirname, '..', 'infrastructure', 'migrations-travel-lite');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      throw new Error(`No migration files found in ${migrationsDir}`);
    }

    const pending = [];
    for (const file of files) {
      const check = await pool.query('SELECT 1 FROM migrations WHERE name = $1', [file]);
      if (check.rows.length === 0) pending.push(file);
    }

    if (pending.length === 0) {
      console.log('[travel-lite-migrate-online] nothing pending — database is already up to date.');
      return;
    }

    console.log(`[travel-lite-migrate-online] pending (${pending.length}): ${pending.join(', ')}`);
    if (dryRun) {
      console.log('[travel-lite-migrate-online] dry run — applied nothing.');
      return;
    }

    let applied = 0;
    for (const file of pending) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      // One dedicated connection per migration: pool.query() may hand each
      // statement to a different connection, which would run the migration
      // outside the BEGIN/COMMIT.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[travel-lite-migrate-online] applied ${file}`);
        applied += 1;
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`[travel-lite-migrate-online] FAILED ${file}: ${error.message.split('\n')[0]}`);
        throw error;
      } finally {
        client.release();
      }
    }

    console.log(`[travel-lite-migrate-online] complete — applied: ${applied}, skipped: ${files.length - applied}`);
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error('[travel-lite-migrate-online] migration run failed:', error);
  process.exit(1);
});
