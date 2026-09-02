#!/usr/bin/env node
/**
 * Database Migration Runner
 * Applies all SQL migrations in sequence
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const databaseUrl = process.env.DATABASE_URL ||
  'postgresql://travel_test:travel_test_password@127.0.0.1:55432/travel_platform_test';

const pool = new Pool({ connectionString: databaseUrl });

async function runMigrations() {
  console.log('\n========================================');
  console.log('Running Database Migrations');
  console.log('========================================\n');

  try {
    // Create migrations table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✓ Migrations table ready\n');

    // Get list of migration files
    const migrationsDir = path.join(__dirname, '..', 'infrastructure', 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`Found ${files.length} migration files\n`);

    let applied = 0;
    let skipped = 0;

    for (const file of files) {
      const migrationName = file;

      // Check if already applied
      const checkResult = await pool.query(
        'SELECT 1 FROM migrations WHERE name = $1',
        [migrationName]
      );

      if (checkResult.rows.length > 0) {
        console.log(`⊘ ${file} (already applied)`);
        skipped++;
        continue;
      }

      // Read and apply migration
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      try {
        await pool.query(sql);
        await pool.query(
          'INSERT INTO migrations (name) VALUES ($1)',
          [migrationName]
        );
        console.log(`✓ ${file}`);
        applied++;
      } catch (error) {
        console.error(`✗ ${file} - ${error.message.split('\n')[0]}`);
        throw error;
      }
    }

    console.log(`\n========================================`);
    console.log(`Applied: ${applied} | Skipped: ${skipped}`);
    console.log('✅ Migrations complete\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
