#!/usr/bin/env node
const { readFileSync, readdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { Pool } = require('pg');

const repoRoot = resolve(__dirname, '..');
const migrationDir = resolve(repoRoot, 'infrastructure/migrations');

const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/travel_platform_dev';

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.log('Applying all migrations to dev database...');
    console.log(`Database: ${databaseUrl}`);

    // Get all migration files in order
    const files = readdirSync(migrationDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    console.log(`Found ${files.length} migration files`);

    for (const file of files) {
      const filePath = resolve(migrationDir, file);
      const sql = readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .filter((line) => !line.trimStart().startsWith('\\'))
        .join('\n');

      console.log(`Applying ${file}...`);
      try {
        await pool.query(sql);
        console.log(`✓ ${file}`);
      } catch (err) {
        console.error(`✗ ${file}: ${err.message}`);
        throw err;
      }
    }

    console.log('\n✓ All migrations applied successfully');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exitCode = 1;
});
