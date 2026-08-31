#!/usr/bin/env node
/**
 * Demo Orchestration Script - Starts all services for presentation-ready demo.
 * 
 * Usage: npm run demo
 * 
 * Starts in order:
 * 1. Verify local environment (dev mode only)
 * 2. Bootstrap/verify PostgreSQL
 * 3. Apply migrations
 * 4. Seed demo data
 * 5. Start API (port 4000)
 * 6. Start Agency Portal (port 5173)
 * 7. Start Customer Portal (port 5174)
 */

const { spawn, spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

const repoRoot = resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

console.log('\n========================================');
console.log('Travel Platform - Demo Orchestration');
console.log('========================================\n');

// Verify environment
if (process.env.NODE_ENV === 'production') {
  console.error('\n❌ ERROR: Cannot run demo in production mode.');
  console.error('   Set NODE_ENV=development and try again.\n');
  process.exit(1);
}

// Step 1: Bootstrap database
console.log('Step 1/5: Bootstrapping local PostgreSQL...\n');
const bootstrapResult = spawnSync(npmCommand, ['run', 'dev:db'], {
  cwd: resolve(repoRoot, 'services/api'),
  stdio: 'inherit',
});

if (bootstrapResult.status !== 0) {
  console.error('\n❌ Database bootstrap failed. Exiting.\n');
  process.exit(1);
}

// Step 2: Apply migrations
console.log('\nStep 2/5: Applying migrations...\n');
const migrationsResult = spawnSync('node', [resolve(repoRoot, 'scripts/apply-all-migrations.cjs')], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://travel_test:travel_test_password@127.0.0.1:55432/travel_platform_test',
  },
});

if (migrationsResult.status !== 0) {
  console.error('\n❌ Migration application failed. Exiting.\n');
  process.exit(1);
}

// Step 3: Seed demo data
console.log('\nStep 3/5: Seeding demo data...\n');
const seedResult = spawnSync('node', [resolve(repoRoot, 'scripts/seed-demo-data.cjs')], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://travel_test:travel_test_password@127.0.0.1:55432/travel_platform_test',
  },
});

if (seedResult.status !== 0) {
  console.error('\n❌ Demo data seeding failed. Exiting.\n');
  process.exit(1);
}

// Step 4-8: Start services
console.log('\nStep 4/8: Starting API Server (port 4000)...\n');
console.log('Step 5/8: Starting Agency Portal (port 5173)...\n');
console.log('Step 6/8: Starting Customer Portal (port 5174)...\n');
console.log('Step 7/8: Starting Marketing App (port 5175)...\n');
console.log('Step 8/8: Starting Platform Admin (port 5176)...\n');

console.log('========================================');
console.log('✅ DEMO READY - All 5 services starting...');
console.log('========================================\n');
console.log('API Server:      http://127.0.0.1:4000');
console.log('Agency Portal:   http://localhost:5173');
console.log('Customer Portal: http://localhost:5174');
console.log('Marketing App:   http://localhost:5175');
console.log('Platform Admin:  http://localhost:5176\n');
console.log('Press Ctrl+C to stop all services.\n');

// Start all services in parallel
const apiServer = spawn(npmCommand, ['run', 'dev'], {
  cwd: resolve(repoRoot, 'services/api'),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

const agencyPortal = spawn(npmCommand, ['run', 'dev'], {
  cwd: resolve(repoRoot, 'apps/agency'),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

const customerPortal = spawn(npmCommand, ['run', 'dev'], {
  cwd: resolve(repoRoot, 'apps/customer'),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

const marketingApp = spawn(npmCommand, ['run', 'dev'], {
  cwd: resolve(repoRoot, 'apps/marketing'),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

const platformAdminApp = spawn(npmCommand, ['run', 'dev'], {
  cwd: resolve(repoRoot, 'apps/platform-admin'),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

const handleExit = (signal) => {
  console.log('\n\nShutting down services...');
  [apiServer, agencyPortal, customerPortal, marketingApp, platformAdminApp].forEach((proc) => {
    if (!proc.killed) proc.kill(signal || 'SIGTERM');
  });
};

process.on('SIGINT', () => handleExit('SIGINT'));
process.on('SIGTERM', () => handleExit('SIGTERM'));

[apiServer, agencyPortal, customerPortal, marketingApp, platformAdminApp].forEach((proc) => {
  proc.on('exit', (code) => {
    if (code !== 0) {
      console.error(`Process exited with code ${code}`);
    }
  });
});
