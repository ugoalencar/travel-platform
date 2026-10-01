#!/usr/bin/env node
/**
 * Travel Lite migration runner.
 *
 * Applies infrastructure/migrations-travel-lite/*.sql in order against the
 * dedicated Travel Lite database (never the Travel Platform database).
 * Idempotent: a `migrations` control table records what already ran.
 *
 * Usage:
 *   node scripts/travel-lite-migrate.cjs
 *
 * Environment:
 *   MIGRATIONS_DATABASE_URL  admin/superuser URL (migrations + role grants)
 *   DATABASE_URL             optional; validated too when present
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

function assertLocalTargets() {
  const problems = [];
  if (process.env.NODE_ENV === 'production') {
    problems.push('NODE_ENV=production');
  }
  for (const name of ['MIGRATIONS_DATABASE_URL', 'DATABASE_URL']) {
    const value = process.env[name];
    if (typeof value !== 'string' || value.trim() === '') continue;
    let hostname;
    try {
      hostname = new URL(value.trim()).hostname;
    } catch {
      problems.push(`${name}: invalid URL`);
      continue;
    }
    if (!isLocalHost(hostname)) {
      problems.push(`${name}: non-local host ${hostname}`);
    }
  }
  if (problems.length > 0) {
    console.error(
      `travel-lite-migrate.cjs refused to run (Travel Lite may only target local databases): ${problems.join('; ')}`,
    );
    process.exit(1);
  }
}

async function runMigrations() {
  assertLocalTargets();

  const databaseUrl =
    process.env.MIGRATIONS_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgresql://travel_lite_admin:travel_lite_admin_password@127.0.0.1:55436/travel_lite';

  const pool = new Pool({ connectionString: databaseUrl });

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

    let applied = 0;
    let skipped = 0;

    for (const file of files) {
      const check = await pool.query('SELECT 1 FROM migrations WHERE name = $1', [file]);
      if (check.rows.length > 0) {
        skipped += 1;
        continue;
      }

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
        console.log(`[travel-lite] applied ${file}`);
        applied += 1;
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`[travel-lite] FAILED ${file}: ${error.message.split('\n')[0]}`);
        throw error;
      } finally {
        client.release();
      }
    }

    console.log(`[travel-lite] migrations complete — applied: ${applied}, skipped: ${skipped}`);
  } finally {
    await pool.end();
  }
}

runMigrations().catch((error) => {
  console.error('[travel-lite] migration run failed:', error);
  process.exit(1);
});
