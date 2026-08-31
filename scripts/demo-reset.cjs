#!/usr/bin/env node
/**
 * Demo Reset Script - Resets demo database to pristine state.
 * 
 * Usage: npm run demo:reset
 * 
 * Performs:
 * 1. Verify local/dev environment (refuse production)
 * 2. Reset database
 * 3. Apply all migrations
 * 4. Seed demo data
 * 5. Verify expected records
 */

const { spawnSync } = require('node:child_process');
const { Pool } = require('pg');
const { resolve } = require('node:path');
const { URL } = require('node:url');

const repoRoot = resolve(__dirname, '..');

const databaseUrl = process.env.DATABASE_URL || 
  'postgresql://travel_test:travel_test_password@127.0.0.1:55432/travel_platform_test';

async function main() {
  console.log('\n========================================');
  console.log('Demo Reset - Restoring pristine state');
  console.log('========================================\n');

  // Verify environment
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ ERROR: Cannot reset demo database in production mode.\n');
    process.exit(1);
  }

  // Verify it's a local database
  try {
    const url = new URL(databaseUrl);
    const isLocal = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const isTest = url.pathname.includes('test');
    
    if (!isLocal || !isTest) {
      console.error('❌ ERROR: Database URL is not a local test database.\n');
      console.error(`   URL: ${databaseUrl}\n`);
      process.exit(1);
    }
  } catch {
    console.error('❌ ERROR: Invalid DATABASE_URL.\n');
    process.exit(1);
  }

  // Step 1: Drop and recreate schema
  console.log('Step 1/4: Resetting database schema...\n');
  const pool = new Pool({ connectionString: databaseUrl });
  
  try {
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    console.log('✅ Schema reset complete.\n');
  } catch (err) {
    console.error('❌ Schema reset failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }

  // Step 2: Apply migrations
  console.log('Step 2/4: Applying migrations...\n');
  const migrationsResult = spawnSync('node', [resolve(repoRoot, 'scripts/apply-all-migrations.cjs')], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  if (migrationsResult.status !== 0) {
    console.error('\n❌ Migration failed.\n');
    process.exit(1);
  }

  // Step 3: Seed demo data
  console.log('\nStep 3/4: Seeding demo data...\n');
  const seedResult = spawnSync('node', [resolve(repoRoot, 'scripts/seed-demo-data.cjs')], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  if (seedResult.status !== 0) {
    console.error('\n❌ Seeding failed.\n');
    process.exit(1);
  }

  // Step 4: Verify
  console.log('\nStep 4/4: Verifying demo data...\n');
  const verifyPool = new Pool({ connectionString: databaseUrl });
  
  try {
    const agenciesResult = await verifyPool.query('SELECT COUNT(*) as count FROM agencies;');
    const customersResult = await verifyPool.query('SELECT COUNT(*) as count FROM customers;');
    const wishesResult = await verifyPool.query('SELECT COUNT(*) as count FROM wishes;');
    
    const agencies = parseInt(agenciesResult.rows[0].count, 10);
    const customers = parseInt(customersResult.rows[0].count, 10);
    const wishes = parseInt(wishesResult.rows[0].count, 10);
    
    console.log(`✅ Agencies: ${agencies}`);
    console.log(`✅ Customers: ${customers}`);
    console.log(`✅ Wishes: ${wishes}`);
    
    if (agencies > 0 && customers > 0 && wishes > 0) {
      console.log('\n========================================');
      console.log('✅ DEMO RESET COMPLETE');
      console.log('========================================\n');
      process.exit(0);
    } else {
      console.error('\n❌ Verification failed: insufficient data.\n');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Verification failed:', err.message);
    process.exit(1);
  } finally {
    await verifyPool.end();
  }
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err.message);
  process.exit(1);
});
