#!/usr/bin/env node
// SEC-I: Containerized Recovery Drill
// Runs a full backup → restore → verify cycle using Docker containers.
// Requires: Docker Desktop running. No native psql/pg_dump needed.

const { spawnSync } = require('node:child_process');
const { readdirSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const repoRoot = resolve(__dirname, '..');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.recovery-drill.yml');
const migrationsDir = resolve(repoRoot, 'infrastructure/migrations');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const rlsRuntimeTestSql = resolve(repoRoot, 'tests/integration/database/003_rls_runtime_test.sql');

const projectName = 'travel-recovery-drill';
const sourceContainer = 'travel-recovery-source';
const targetContainer = 'travel-recovery-target';
const sourceHost = '127.0.0.1';
const sourcePort = '55433';
const targetHost = '127.0.0.1';
const targetPort = '55434';
const dbName = 'travel_recovery_source';
const adminUser = 'travel_recovery';
const adminPassword = 'travel_test_password';
const runtimeUser = 'travel_app_runtime_local';
const runtimePassword = 'travel_app_runtime_local_password';

const expectedTables = [
  'agencies',
  'agency_entitlements',
  'audit_logs',
  'assets',
  'automation_executions',
  'automations',
  'booking_passengers',
  'bookings',
  'brokers',
  'campaign_offers',
  'campaigns',
  'commercial_opportunities',
  'commercial_tasks',
  'commissions',
  'connector_actions',
  'coupon_grants',
  'coupon_redemptions',
  'coupons',
  'customer_accounts',
  'customer_interactions',
  'customers',
  'engagements',
  'external_offer_captures',
  'offer_growth_audit_log',
  'offers',
  'operation_assignments',
  'operation_checkpoints',
  'operational_costs',
  'operational_staff',
  'operational_staff_capabilities',
  'payables',
  'payment_allocations',
  'payments',
  'pipeline_access',
  'pipeline_stages',
  'pipelines',
  'proposals',
  'publications',
  'receivables',
  'route_points',
  'routes',
  'sales',
  'scheduled_departures',
  'suppliers',
  'transport_operations',
  'transport_products',
  'trips',
  'users',
  'wishes',
];

let passed = 0;
let failed = 0;
const results = {};

function log(heading) {
  console.log(`\n=== ${heading} ===`);
}

function record(name, ok, detail) {
  if (ok) {
    passed++;
    results[name] = 'PASS';
    console.log(`  PASS: ${name}${detail ? ` (${detail})` : ''}`);
  } else {
    failed++;
    results[name] = 'FAIL';
    console.log(`  FAIL: ${name}${detail ? ` (${detail})` : ''}`);
  }
}

// ── Safety guards ──────────────────────────────────────────────
function assertSafe() {
  const forbidden = ['production', 'prod', 'staging', 'stage', 'rds', 'amazonaws', 'azure', 'gcp'];
  for (const marker of forbidden) {
    if (sourceHost.includes(marker) || targetHost.includes(marker)) {
      throw new Error(`Refusing to contact non-local host: ${sourceHost} / ${targetHost}`);
    }
  }
  if (!['127.0.0.1', 'localhost'].includes(sourceHost) || !['127.0.0.1', 'localhost'].includes(targetHost)) {
    throw new Error('Source and target must be localhost only.');
  }
  for (const env of [process.env.NODE_ENV, process.env.APP_ENV, process.env.DATABASE_ENV]) {
    if (env && forbidden.includes(env.toLowerCase())) {
      throw new Error(`Refusing to run in production/staging environment (${env}).`);
    }
  }
}

// ── Docker helpers ─────────────────────────────────────────────
function run(cmd, args, input, throwOnError = true) {
  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    input,
    maxBuffer: 1024 * 1024 * 50,
  });
  const stdout = (result.stdout || '').toString();
  const stderr = (result.stderr || '').toString();
  if (throwOnError && result.status !== 0) {
    throw new Error(
      [`Command failed: ${cmd} ${redactArgs(args).join(' ')}`, `Exit: ${result.status}`, stdout, stderr]
        .filter(Boolean)
        .join('\n'),
    );
  }
  return { stdout, stderr };
}

function redactArgs(args) {
  return args.map((a) => (typeof a === 'string' && a.startsWith('PGPASSWORD=')) ? 'PGPASSWORD=<redacted>' : a);
}

function compose(args) {
  return run('docker', ['compose', '-f', composeFile, '-p', projectName, ...args]);
}

function dockerExecPsql(container, user, password, db, sql, flags = []) {
  return run('docker', [
    'exec', '-i', '-e', `PGPASSWORD=${password}`, container,
    'psql', '-h', '127.0.0.1', '-p', '5432', '-U', user, '-d', db,
    '-v', 'ON_ERROR_STOP=1', ...flags,
  ], sql);
}

function psqlAdmin(container, db, sql, flags = []) {
  return dockerExecPsql(container, adminUser, adminPassword, db, sql, flags);
}

function psqlRuntime(container, db, sql) {
  return dockerExecPsql(container, runtimeUser, runtimePassword, db, sql);
}

function psqlRuntimeScalar(container, db, sql) {
  const result = dockerExecPsql(container, runtimeUser, runtimePassword, db, sql, ['-At', '-t', '--no-align']);
  return result.stdout.trim();
}

function psqlAdminLines(container, db, sql) {
  return psqlAdmin(container, db, sql, ['-At'])
    .stdout.split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function psqlAdminScalar(container, db, sql) {
  const result = dockerExecPsql(container, adminUser, adminPassword, db, sql, ['-At', '-t', '--no-align']);
  const raw = result.stdout.trim();
  if (!raw) {
    throw new Error(`psqlAdminScalar returned empty output`);
  }
  return raw;
}

// ── File helpers ───────────────────────────────────────────────
function readSql(filePath) {
  return readFileSync(filePath, 'utf8');
}

function readAllMigrations() {
  const files = readdirSync(migrationsDir)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();
  if (files.length !== 15) {
    throw new Error(`Expected 15 migrations, found ${files.length}`);
  }
  return files.map((f) => readSql(resolve(migrationsDir, f))).join('\n');
}

// ── Wait for container health ──────────────────────────────────
async function waitForHealthy(container) {
  const timeoutAt = Date.now() + 120_000;
  while (Date.now() < timeoutAt) {
    const result = run('docker', ['inspect', '-f', '{{.State.Health.Status}}', container], undefined, false);
    if (result.stdout.trim() === 'healthy') return;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(`Container ${container} did not become healthy in time.`);
}

// ── Cleanup ────────────────────────────────────────────────────
function cleanup() {
  log('CLEANUP');
  compose(['down', '-v', '--remove-orphans']);
  console.log('  Ephemeral containers removed.');
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  assertSafe();

  console.log('SEC-I: Containerized Recovery Drill');
  console.log(`Source: ${sourceHost}:${sourcePort}`);
  console.log(`Target: ${targetHost}:${targetPort}`);

  try {
    // ── Phase 1: Start containers ──────────────────────────────
    log('PHASE 1: Start ephemeral containers');
    compose(['down', '-v', '--remove-orphans']);
    compose(['up', '-d']);
    await waitForHealthy(sourceContainer);
    await waitForHealthy(targetContainer);
    record('Containers healthy', true);

    // ── Phase 2: Apply migrations to source ────────────────────
    log('PHASE 2: Apply migrations to source');
    const migrationsSql = readAllMigrations();
    const migResult = psqlAdmin(sourceContainer, dbName, migrationsSql);
    record('Migrations applied', !migResult.stderr.includes('ERROR'), '14 migrations');

    // ── Phase 3: Prepare roles ─────────────────────────────────
    log('PHASE 3: Prepare runtime role on source');
    const rolesSql = readSql(prepareRolesSql);
    const rolesResult = psqlAdmin(sourceContainer, dbName, rolesSql);
    record('Runtime role created', !rolesResult.stderr.includes('ERROR'), runtimeUser);

    // ── Phase 4: Seed synthetic data ───────────────────────────
    log('PHASE 4: Seed synthetic data');
    const seedSql = `
      INSERT INTO agencies (id, name, slug, cnpj, email, plan, status)
      VALUES
        ('10000000-0000-4000-8000-000000000001', 'Agency A', 'recovery-agency-a', '0000000000191', 'agency-a@recovery.test', 'FREE', 'ACTIVE'),
        ('20000000-0000-4000-8000-000000000001', 'Agency B', 'recovery-agency-b', '0000000000272', 'agency-b@recovery.test', 'FREE', 'ACTIVE');

      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ('11000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'user-a@recovery.test', 'User A', 'OWNER', 'hash-recovery-only', 'ACTIVE'),
        ('21000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'user-b@recovery.test', 'User B', 'OWNER', 'hash-recovery-only', 'ACTIVE');

      INSERT INTO brokers (id, agency_id, name, email, commission, status)
      VALUES
        ('12000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Broker A', 'broker-a@recovery.test', 10, 'ACTIVE'),
        ('22000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Broker B', 'broker-b@recovery.test', 10, 'ACTIVE');

      INSERT INTO customers (id, agency_id, name, email, cpf, status)
      VALUES
        ('13000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Customer A', 'customer-a@recovery.test', '11144477735', 'ACTIVE'),
        ('23000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Customer B', 'customer-b@recovery.test', '22255588866', 'ACTIVE');

      INSERT INTO offers (id, agency_id, name, price, status)
      VALUES
        ('15000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Offer A', 5000.00, 'ACTIVE'),
        ('25000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Offer B', 6100.00, 'ACTIVE');

      INSERT INTO wishes (id, agency_id, customer_id, destination, start_date, end_date, budget, travelers_count, status)
      VALUES
        ('14000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', 'Lisbon', DATE '2027-04-10', DATE '2027-04-20', 7000.00, 2, 'ACTIVE'),
        ('24000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', 'Paris', DATE '2027-06-01', DATE '2027-06-10', 8000.00, 3, 'ACTIVE');

      INSERT INTO proposals (id, agency_id, customer_id, offer_id, user_id, proposed_price, discount, total, valid_until, status)
      VALUES
        ('16000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 5000.00, 0.00, 5000.00, now() + interval '7 days', 'SENT'),
        ('26000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', '25000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 6100.00, 0.00, 6100.00, now() + interval '7 days', 'SENT');

      INSERT INTO sales (id, agency_id, customer_id, proposal_id, broker_id, user_id, amount, discount, total, status)
      VALUES
        ('17000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 5000.00, 0.00, 5000.00, 'CONFIRMED'),
        ('27000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 6100.00, 0.00, 6100.00, 'CONFIRMED');

      INSERT INTO commissions (id, agency_id, sale_id, broker_id, user_id, amount, percentage, status)
      VALUES
        ('18000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 500.00, 10.00, 'PENDING'),
        ('28000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 610.00, 10.00, 'PENDING');

      INSERT INTO trips (id, agency_id, customer_id, sale_id, name, destination, start_date, end_date, status)
      VALUES
        ('19000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000001', 'Trip A', 'Lisbon', DATE '2027-04-10', DATE '2027-04-20', 'CONFIRMED'),
        ('29000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', 'Trip B', 'Paris', DATE '2027-06-01', DATE '2027-06-10', 'CONFIRMED');
    `;
    const seedResult = psqlAdmin(sourceContainer, dbName, seedSql);
    record('Synthetic data seeded', !seedResult.stderr.includes('ERROR'));

    // Verify source has data before dump
    const sourceAgencyCount = psqlAdminScalar(sourceContainer, dbName, "SELECT COUNT(*) FROM agencies;");
    const sourceCustomerCount = psqlAdminScalar(sourceContainer, dbName, "SELECT COUNT(*) FROM customers;");
    record('Source data verified', sourceAgencyCount === '2' && sourceCustomerCount === '2', `agencies=${sourceAgencyCount}, customers=${sourceCustomerCount}`);

    // ── Phase 5: Backup (pg_dump) ─────────────────────────────
    log('PHASE 5: Backup source (pg_dump)');
    const dumpResult = run('docker', [
      'exec', '-e', `PGPASSWORD=${adminPassword}`, sourceContainer,
      'pg_dump', '-h', '127.0.0.1', '-p', '5432', '-U', adminUser, '-d', dbName,
      '--no-owner', '--no-privileges', '--clean', '--if-exists',
    ]);
    const dumpSize = dumpResult.stdout.length;
    record('pg_dump executed', dumpResult.stderr === '' || !dumpResult.stderr.includes('ERROR'));
    record('Backup artifact non-empty', dumpSize > 100, `${dumpSize} bytes`);

    // ── Phase 6: Restore to target ─────────────────────────────
    log('PHASE 6: Restore to target');

    // Create the same database and roles on target first
    psqlAdmin(targetContainer, 'postgres', `
      DROP DATABASE IF EXISTS travel_recovery_target;
      CREATE DATABASE travel_recovery_target;
    `);

    // Restore dump into target
    const restoreResult = run('docker', [
      'exec', '-i', '-e', `PGPASSWORD=${adminPassword}`, targetContainer,
      'psql', '-h', '127.0.0.1', '-p', '5432', '-U', adminUser, '-d', 'travel_recovery_target',
      '-v', 'ON_ERROR_STOP=1',
    ], dumpResult.stdout);
    record('Restore executed', !restoreResult.stderr.includes('ERROR'), 'pg_restore via psql');

    // ── Phase 7: Post-restore verification ─────────────────────
    log('PHASE 7: Post-restore verification');

    // 7a. Schema — check all expected tables exist
    const targetTables = psqlAdminLines(targetContainer, 'travel_recovery_target',
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
    );
    const missingTables = expectedTables.filter((t) => !targetTables.includes(t));
    record('Schema: all tables present', missingTables.length === 0, missingTables.length === 0 ? `${expectedTables.length} tables` : `missing: ${missingTables.join(', ')}`);

    // 7b. Data — check representative row counts match source
    const targetAgencyCount = psqlAdminScalar(targetContainer, 'travel_recovery_target', "SELECT COUNT(*) FROM agencies;");
    const targetUserCount = psqlAdminScalar(targetContainer, 'travel_recovery_target', "SELECT COUNT(*) FROM users;");
    const targetCustomerCount = psqlAdminScalar(targetContainer, 'travel_recovery_target', "SELECT COUNT(*) FROM customers;");
    const targetOfferCount = psqlAdminScalar(targetContainer, 'travel_recovery_target', "SELECT COUNT(*) FROM offers;");
    const targetWishCount = psqlAdminScalar(targetContainer, 'travel_recovery_target', "SELECT COUNT(*) FROM wishes;");
    const targetProposalCount = psqlAdminScalar(targetContainer, 'travel_recovery_target', "SELECT COUNT(*) FROM proposals;");
    const targetSaleCount = psqlAdminScalar(targetContainer, 'travel_recovery_target', "SELECT COUNT(*) FROM sales;");
    const targetCommissionCount = psqlAdminScalar(targetContainer, 'travel_recovery_target', "SELECT COUNT(*) FROM commissions;");
    const targetTripCount = psqlAdminScalar(targetContainer, 'travel_recovery_target', "SELECT COUNT(*) FROM trips;");

    const dataChecks = [
      ['agencies', targetAgencyCount, '2'],
      ['users', targetUserCount, '2'],
      ['customers', targetCustomerCount, '2'],
      ['offers', targetOfferCount, '2'],
      ['wishes', targetWishCount, '2'],
      ['proposals', targetProposalCount, '2'],
      ['sales', targetSaleCount, '2'],
      ['commissions', targetCommissionCount, '2'],
      ['trips', targetTripCount, '2'],
    ];
    const dataMismatches = dataChecks.filter(([, actual, expected]) => actual !== expected);
    record('Data: row counts match', dataMismatches.length === 0, dataMismatches.length === 0 ? 'all tables verified' : `mismatch: ${dataMismatches.map(([t, a, e]) => `${t}=${a}/${e}`).join(', ')}`);

    // 7c. Prepare runtime role on target
    const targetRolesResult = psqlAdmin(targetContainer, 'travel_recovery_target', readSql(prepareRolesSql));
    record('Runtime role on target', !targetRolesResult.stderr.includes('ERROR'));

    // 7d. RLS — run the full RLS runtime test on target
    const rlsSql = readSql(rlsRuntimeTestSql);
    const rlsResult = psqlRuntime(targetContainer, 'travel_recovery_target', rlsSql);
    const rlsLines = rlsResult.stdout.split(/\r?\n/).filter((l) => l.includes('|'));
    const rlsTests = [];
    const rlsFailures = [];
    for (const line of rlsLines) {
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
        const testName = parts[0];
        const expected = parts[1];
        const result = parts[2];
        if (expected === 'PASS' || expected === 'FAIL') {
          rlsTests.push({ testName, expected, result });
          if (expected !== result) {
            rlsFailures.push({ testName, expected, result, detail: parts[3] || '' });
          }
        }
      }
    }
    record('RLS enforcement', rlsFailures.length === 0, `${rlsTests.length} tests, ${rlsFailures.length} failures`);
    if (rlsFailures.length > 0) {
      rlsFailures.forEach((f) => console.log(`    ${f.testName}: expected=${f.expected} got=${f.result} ${f.detail}`));
    }

    // 7e. FORCE RLS — check every expected table has FORCE RLS enabled
    const forceRlsRows = psqlAdminLines(targetContainer, 'travel_recovery_target', `
      SELECT relname
      FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relkind = 'r'
        AND relname = ANY(ARRAY[${expectedTables.map((t) => `'${t}'`).join(', ')}])
        AND relrowsecurity = TRUE
        AND relforcerowsecurity = TRUE
      ORDER BY relname;
    `);
    const missingForceRls = expectedTables.filter((t) => !forceRlsRows.includes(t));
    record('FORCE RLS enabled', missingForceRls.length === 0, missingForceRls.length === 0 ? `${expectedTables.length} tables` : `missing: ${missingForceRls.join(', ')}`);

    // 7f. Runtime role — non-superuser, no BYPASSRLS
    const roleInfo = psqlAdminScalar(targetContainer, 'travel_recovery_target', `
      SELECT rolsuper::TEXT || '|' || rolbypassrls::TEXT || '|' || rolcreaterole::TEXT
      FROM pg_roles WHERE rolname = '${runtimeUser}';
    `);
    const roleParts = roleInfo.split('|').map((p) => p.trim());
    const [isSuper, isBypass, isCreateRole] = roleParts;
    record('Runtime role: non-superuser', isSuper === 'false', `rolsuper=${isSuper}`);
    record('Runtime role: no BYPASSRLS', isBypass === 'false', `rolbypassrls=${isBypass}`);
    record('Runtime role: no CREATEROLE', isCreateRole === 'false', `rolcreaterole=${isCreateRole}`);

    // 7g. Tenant isolation — fail-closed without tenant context
    const visibleWithoutTenant = psqlRuntimeScalar(targetContainer, 'travel_recovery_target', `
      SELECT COUNT(*) FROM customers;
    `);
    record('Tenant isolation: fail-closed without context', visibleWithoutTenant === '0', `visible rows=${visibleWithoutTenant}`);

    // 7h. Tenant functions — no SECURITY DEFINER
    const funcCheck = psqlAdminLines(targetContainer, 'travel_recovery_target', `
      SELECT proname || ':' || prosecdef::TEXT
      FROM pg_proc
      JOIN pg_namespace n ON n.oid = pronamespace
      WHERE nspname = 'public'
        AND proname IN ('current_agency_id', 'current_user_id', 'set_tenant_context', 'clear_tenant_context')
      ORDER BY proname;
    `);
    const securityDefinerFuncs = funcCheck.filter((f) => f.endsWith(':true'));
    record('Tenant functions: no SECURITY DEFINER', securityDefinerFuncs.length === 0, `${funcCheck.length} functions checked`);

    // 7i. Table ownership — runtime role does not own any table
    const tableOwners = psqlAdminLines(targetContainer, 'travel_recovery_target', `
      SELECT relname || ':' || pg_get_userbyid(relowner)
      FROM pg_class
      WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
        AND relname = ANY(ARRAY[${expectedTables.map((t) => `'${t}'`).join(', ')}])
      ORDER BY relname;
    `);
    const runtimeOwnedTables = tableOwners.filter((o) => o.endsWith(`:${runtimeUser}`));
    record('Runtime role: owns no tables', runtimeOwnedTables.length === 0, runtimeOwnedTables.length === 0 ? 'clean' : `owns: ${runtimeOwnedTables.join(', ')}`);

  } catch (err) {
    console.error(`\nFATAL: ${err.message}`);
    failed++;
    results['FATAL ERROR'] = 'FAIL';
  } finally {
    cleanup();
  }

  // ── Summary ──────────────────────────────────────────────────
  log('RECOVERY DRILL RESULTS');
  for (const [name, status] of Object.entries(results)) {
    console.log(`  ${status}: ${name}`);
  }
  console.log(`\nTotal: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.log('\nRECOVERY DRILL FAILED');
    process.exit(1);
  } else {
    console.log('\nRECOVERY DRILL PASSED');
  }
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
