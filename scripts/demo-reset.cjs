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
const { existsSync, readFileSync } = require('node:fs');

const repoRoot = resolve(__dirname, '..');

// Load .env.local if it exists
const envLocalPath = resolve(repoRoot, '.env.local');
if (existsSync(envLocalPath)) {
  const envContent = readFileSync(envLocalPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && !process.env[key.trim()]) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

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
    const isDev = url.pathname.includes('test') || url.pathname.includes('dev');

    if (!isLocal || !isDev) {
      console.error('❌ ERROR: Database URL is not a local test/dev database.\n');
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

  // Step 3: Seed platform base data
  console.log('\nStep 3/6: Seeding platform base data...\n');
  const seedResult = spawnSync('node', [resolve(repoRoot, 'scripts/seed-demo-data.cjs')], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  if (seedResult.status !== 0) {
    console.error('\n❌ Base seeding failed.\n');
    process.exit(1);
  }

  // Step 4: Seed platform SaaS demo data
  console.log('\nStep 4/6: Seeding platform SaaS demo data...\n');
  const platformSeedResult = spawnSync('node', [resolve(repoRoot, 'scripts/seed-platform-demo-data.cjs')], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  if (platformSeedResult.status !== 0) {
    console.error('\n❌ Platform seeding failed.\n');
    process.exit(1);
  }

  // Step 5: Seed comprehensive tenant data (customers, financials, end-to-end stories)
  console.log('\nStep 5/6: Seeding comprehensive tenant demo data...\n');
  const tenantSeedResult = spawnSync('node', [resolve(repoRoot, 'scripts/seed-tenant-demo-data.cjs')], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  if (tenantSeedResult.status !== 0) {
    console.error('\n❌ Tenant seeding failed.\n');
    process.exit(1);
  }

  // Step 6: Verify
  console.log('\nStep 6/6: Verifying demo data...\n');
  const verifyPool = new Pool({ connectionString: databaseUrl });

  try {
    // Verify tenant data
    const agenciesResult = await verifyPool.query('SELECT COUNT(*) as count FROM agencies;');
    const customersResult = await verifyPool.query('SELECT COUNT(*) as count FROM customers;');
    const wishesResult = await verifyPool.query('SELECT COUNT(*) as count FROM wishes;');
    const tripsResult = await verifyPool.query('SELECT COUNT(*) as count FROM trips;');
    const offersResult = await verifyPool.query('SELECT COUNT(*) as count FROM offers;');
    const proposalsResult = await verifyPool.query('SELECT COUNT(*) as count FROM proposals;');
    const bookingsResult = await verifyPool.query('SELECT COUNT(*) as count FROM bookings;');
    const revenuesResult = await verifyPool.query('SELECT COUNT(*) as count FROM revenues;');
    const expensesResult = await verifyPool.query('SELECT COUNT(*) as count FROM expenses;');

    // Verify platform SaaS data
    const subscribersResult = await verifyPool.query('SELECT COUNT(*) as count FROM subscriber_tenants;');
    const plansResult = await verifyPool.query('SELECT COUNT(*) as count FROM plans;');
    const subscriptionsResult = await verifyPool.query('SELECT COUNT(*) as count FROM subscriptions;');
    const leadsResult = await verifyPool.query('SELECT COUNT(*) as count FROM leads;');
    const supportResult = await verifyPool.query('SELECT COUNT(*) as count FROM support_cases;');

    const agencies = parseInt(agenciesResult.rows[0].count, 10);
    const customers = parseInt(customersResult.rows[0].count, 10);
    const wishes = parseInt(wishesResult.rows[0].count, 10);
    const trips = parseInt(tripsResult.rows[0].count, 10);
    const offers = parseInt(offersResult.rows[0].count, 10);
    const proposals = parseInt(proposalsResult.rows[0].count, 10);
    const bookings = parseInt(bookingsResult.rows[0].count, 10);
    const revenues = parseInt(revenuesResult.rows[0].count, 10);
    const expenses = parseInt(expensesResult.rows[0].count, 10);
    const subscribers = parseInt(subscribersResult.rows[0].count, 10);
    const plans = parseInt(plansResult.rows[0].count, 10);
    const subscriptions = parseInt(subscriptionsResult.rows[0].count, 10);
    const leads = parseInt(leadsResult.rows[0].count, 10);
    const support = parseInt(supportResult.rows[0].count, 10);

    console.log('   📊 DEMO DATABASE INVENTORY\n');
    console.log('   Tenant Operations:');
    console.log(`     ✅ Agencies: ${agencies}`);
    console.log(`     ✅ Customers: ${customers}`);
    console.log(`     ✅ Wishes: ${wishes}`);
    console.log(`     ✅ Trips: ${trips}`);
    console.log(`     ✅ Offers: ${offers}`);
    console.log(`     ✅ Proposals: ${proposals}`);
    console.log(`     ✅ Bookings: ${bookings}`);
    console.log('\n   Financial:');
    console.log(`     ✅ Revenues: ${revenues}`);
    console.log(`     ✅ Expenses: ${expenses}`);
    console.log('\n   Platform SaaS:');
    console.log(`     ✅ Subscriber Tenants: ${subscribers}`);
    console.log(`     ✅ Plans: ${plans}`);
    console.log(`     ✅ Subscriptions: ${subscriptions}`);
    console.log(`     ✅ Leads: ${leads}`);
    console.log(`     ✅ Support Cases: ${support}`);

    const allRequirementssMet =
      agencies > 0 && customers >= 15 && wishes >= 10 && trips >= 8 && offers >= 8 &&
      proposals >= 10 && bookings >= 5 && revenues >= 15 && expenses >= 10 &&
      subscribers >= 12 && plans >= 4 && subscriptions >= 20 && leads >= 25 && support >= 12;

    if (allRequirementssMet) {
      console.log('\n========================================');
      console.log('✅ DEMO RESET COMPLETE');
      console.log('Database populated with realistic demo data');
      console.log('ready for local demonstration.');
      console.log('========================================\n');
      process.exit(0);
    } else {
      console.error('\n⚠️  Verification warning: some data targets not met.\n');
      console.error('   Expected minimums:');
      console.error('   - customers >= 15 (got ' + customers + ')');
      console.error('   - wishes >= 10 (got ' + wishes + ')');
      console.error('   - trips >= 8 (got ' + trips + ')');
      console.error('   - offers >= 8 (got ' + offers + ')');
      console.error('   - proposals >= 10 (got ' + proposals + ')');
      console.error('   - revenues >= 15 (got ' + revenues + ')');
      console.error('   - expenses >= 10 (got ' + expenses + ')');
      console.error('\n   (Continuing anyway — demo is usable but minimal)\n');
      process.exit(0);
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
