import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '../../..');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');
const migrationsDir = resolve(repoRoot, 'infrastructure/migrations');
const constraintsTestSql = resolve(repoRoot, 'tests/integration/database/001_constraints_test.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const rlsRuntimeTestSql = resolve(repoRoot, 'tests/integration/database/003_rls_runtime_test.sql');

const projectName =
  process.env.DATABASE_TEST_PROJECT_NAME ??
  `travel-platform-local-postgres-${sanitizeDockerName(basename(repoRoot))}`;
const containerName =
  process.env.DATABASE_TEST_CONTAINER_NAME ?? `${projectName}-postgres-local`;
const postgresImage = 'postgres:15';
const testMode = process.env.DATABASE_TEST_MODE ?? 'local';
const isCiMode = testMode === 'ci';
const adminUser = process.env.DATABASE_TEST_USER ?? 'travel_test';
const adminPassword = process.env.DATABASE_TEST_PASSWORD ?? 'travel_test_password';
const databaseName = process.env.DATABASE_TEST_NAME ?? 'travel_platform_test';
const runtimeUser = 'travel_app_runtime_local';
const runtimePassword = 'travel_app_runtime_local_password';
const localHost = process.env.DATABASE_TEST_HOST ?? '127.0.0.1';
const localPort = process.env.DATABASE_TEST_PORT ?? (isCiMode ? '5432' : '0');

const expectedAllTables = [
  'agencies',
  'agency_entitlements',
  'agent_area_grants',
  'air_services',
  'assets',
  'audit_logs',
  'auth_sessions',
  'automation_executions',
  'automations',
  'billing_invoices',
  'billing_payments',
  'billing_webhook_audit',
  'billing_webhook_events',
  'booking_passengers',
  'bookings',
  'brokers',
  'campaign_attributions',
  'campaign_audit',
  'campaign_offers',
  'campaign_partner_stubs',
  'campaign_placements',
  'campaign_products',
  'campaigns',
  'captcha_verifications',
  'cash_transactions',
  'commercial_opportunities',
  'commercial_partners',
  'commercial_tasks',
  'commission_entries',
  'commission_plans',
  'commissions',
  'connector_actions',
  'contract_documents',
  'contract_parties',
  'contract_signature_evidence',
  'contract_signature_links',
  'contract_templates',
  'cost_centers',
  'coupon_grants',
  'coupon_redemptions',
  'coupons',
  'courtesy_account_audit',
  'courtesy_accounts',
  'customer_accounts',
  'customer_addresses',
  'customer_dependents',
  'customer_documents',
  'customer_interactions',
  'customer_password_reset_tokens',
  'customer_sessions',
  'customers',
  'departments',
  'document_attachments',
  'document_audit_events',
  'document_extractions',
  'document_verifications',
  'employee_deductions',
  'employees',
  'engagements',
  'enrollment_documents',
  'enrollment_links',
  'enrollment_submissions',
  'entitlement_changes',
  'entitlements',
  'excursion_customers',
  'excursion_departures',
  'excursions',
  'expenses',
  'external_offer_captures',
  'feature_flag_audit',
  'feature_flags',
  'financial_categories',
  'insurance_documents',
  'insurance_policies',
  'insurance_products',
  'insurance_travelers',
  'invitations',
  'land_services',
  'landing_page_config',
  'landing_promotions',
  'lead_conversions',
  'lead_interactions',
  'leads',
  'login_audit',
  'mfa_recovery_codes',
  'mfa_requirements',
  'mfa_totp_attempts',
  'mfa_totp_secrets',
  'notification_preferences',
  'offer_growth_audit_log',
  'offers',
  'operation_assignments',
  'operation_checkpoints',
  'operational_costs',
  'operational_staff',
  'operational_staff_capabilities',
  'partner_attributions',
  'partner_campaigns',
  'partner_commissions',
  'partner_contracts',
  'partner_links',
  'password_reset_tokens',
  'payables',
  'payment_allocations',
  'payments',
  'payroll_entries',
  'permission_restrictions',
  'pescador_search_results',
  'pescador_searches',
  'pescador_sources',
  'pipeline_access',
  'pipeline_stages',
  'pipelines',
  'plans',
  'platform_audit_logs',
  'platform_banners',
  'platform_coupon_redemptions',
  'platform_coupons',
  'platform_landing_page',
  'platform_landing_publications',
  'platform_landing_sections',
  'platform_partner_benefits',
  'platform_partner_commissions',
  'platform_partners',
  'platform_referral_credits',
  'platform_referrals',
  'platform_sessions',
  'platform_settings',
  'platform_user_audit',
  'platform_users',
  'post_trip_checklist',
  'product_assets',
  'promotional_campaigns',
  'proposal_optional_items',
  'proposals',
  'publications',
  'receivables',
  'reconciliations',
  'revenues',
  'route_points',
  'routes',
  'sale_items',
  'sales',
  'sales_demos',
  'sales_opportunities',
  'scheduled_departures',
  'sensitive_operations_log',
  'subscriber_tenant_audit',
  'subscriber_tenants',
  'subscription_state_changes',
  'subscriptions',
  'supplier_category_links',
  'suppliers',
  'support_access_log',
  'support_cases',
  'transport_operations',
  'transport_products',
  'travel_products',
  'travel_requirements',
  'trip_occurrences',
  'trip_photos',
  'trips',
  'upsell_rules',
  'upsell_suggestions',
  'users',
  'wishes',
];
const expectedTenantTables = [
  'agencies',
  'agency_entitlements',
  'agent_area_grants',
  'air_services',
  'assets',
  'audit_logs',
  'auth_sessions',
  'automation_executions',
  'automations',
  'booking_passengers',
  'bookings',
  'brokers',
  'campaign_attributions',
  'campaign_offers',
  'campaign_partner_stubs',
  'campaign_placements',
  'campaign_products',
  'campaigns',
  'captcha_verifications',
  'cash_transactions',
  'commercial_opportunities',
  'commercial_partners',
  'commercial_tasks',
  'commission_entries',
  'commission_plans',
  'commissions',
  'connector_actions',
  'contract_documents',
  'contract_parties',
  'contract_signature_evidence',
  'contract_signature_links',
  'contract_templates',
  'cost_centers',
  'coupon_grants',
  'coupon_redemptions',
  'coupons',
  'customer_accounts',
  'customer_addresses',
  'customer_dependents',
  'customer_documents',
  'customer_interactions',
  'customer_password_reset_tokens',
  'customer_sessions',
  'customers',
  'departments',
  'document_attachments',
  'document_audit_events',
  'document_extractions',
  'document_verifications',
  'employee_deductions',
  'employees',
  'engagements',
  'enrollment_documents',
  'enrollment_links',
  'enrollment_submissions',
  'excursion_customers',
  'excursion_departures',
  'excursions',
  'expenses',
  'external_offer_captures',
  'financial_categories',
  'insurance_documents',
  'insurance_policies',
  'insurance_products',
  'insurance_travelers',
  'invitations',
  'land_services',
  'mfa_recovery_codes',
  'mfa_requirements',
  'mfa_totp_attempts',
  'mfa_totp_secrets',
  'notification_preferences',
  'offer_growth_audit_log',
  'offers',
  'operation_assignments',
  'operation_checkpoints',
  'operational_costs',
  'operational_staff',
  'operational_staff_capabilities',
  'partner_attributions',
  'partner_campaigns',
  'partner_commissions',
  'partner_contracts',
  'partner_links',
  'password_reset_tokens',
  'payables',
  'payment_allocations',
  'payments',
  'payroll_entries',
  'permission_restrictions',
  'pescador_search_results',
  'pescador_searches',
  'pescador_sources',
  'pipeline_access',
  'pipeline_stages',
  'pipelines',
  'post_trip_checklist',
  'product_assets',
  'proposal_optional_items',
  'proposals',
  'publications',
  'receivables',
  'reconciliations',
  'revenues',
  'route_points',
  'routes',
  'sale_items',
  'sales',
  'scheduled_departures',
  'supplier_category_links',
  'suppliers',
  'transport_operations',
  'transport_products',
  'travel_products',
  'travel_requirements',
  'trip_occurrences',
  'trip_photos',
  'trips',
  'upsell_rules',
  'upsell_suggestions',
  'users',
  'wishes',
];
// Alphabetical order -- the assertion below compares against a query
// sorted by table_name, so this array must stay sorted too. The Platform
// Admin entries (billing_webhook_audit, campaign_audit, ...) were added
// by 077_platform_admin_table_grants.sql / 002_prepare_local_roles.sql --
// append-only audit/evidence/change-log tables, same convention as
// audit_logs.
const readInsertOnlyTables = [
  'audit_logs',
  'billing_webhook_audit',
  'campaign_attributions',
  'campaign_audit',
  'captcha_verifications',
  'cash_transactions',
  'contract_signature_evidence',
  'courtesy_account_audit',
  'document_audit_events',
  'entitlement_changes',
  'feature_flag_audit',
  'login_audit',
  'mfa_totp_attempts',
  'platform_audit_logs',
  'platform_landing_publications',
  'platform_user_audit',
  'sensitive_operations_log',
  'subscriber_tenant_audit',
  'subscription_state_changes',
  'support_access_log',
];
// SELECT/INSERT/UPDATE but no DELETE -- session and reset-token tables:
// a session/token is revoked or marked used via UPDATE, never physically
// deleted by application code. auth_sessions was previously (incorrectly)
// listed in readInsertOnlyTables above -- its real grant has always
// included UPDATE (needed to mark a session revoked), confirmed against
// the actual migrated grants rather than assumed.
const noDeleteTables = [
  'auth_sessions',
  'customer_password_reset_tokens',
  'customer_sessions',
  'password_reset_tokens',
  'platform_sessions',
  'platform_users',
];
const noUpdateTables = ['agent_area_grants', 'permission_restrictions'];
// Tables the runtime role is granted on but that are not tenant-scoped
// (no agency_id, no RLS) -- platform-admin-only tables, matching their
// own migrations' documented model. Not part of expectedTenantTables
// (which backs the FORCE RLS check), but still counted here so the
// grant-count assertion below covers every granted table, not just the
// tenant ones.
const nonTenantGrantedTables = [
  'platform_sessions',
  'platform_user_audit',
  'platform_users',
  // Added by 077_platform_admin_table_grants.sql -- these 32 tables existed
  // since migrations 026-036 but were never granted to the runtime role
  // (a real bug, found via Direction A Phase 3B live verification: every
  // Platform Admin data page failed with Postgres 42501). None has RLS
  // (confirmed directly), so none belongs in expectedTenantTables.
  'billing_invoices',
  'billing_payments',
  'billing_webhook_audit',
  'billing_webhook_events',
  'campaign_audit',
  'courtesy_account_audit',
  'courtesy_accounts',
  'entitlement_changes',
  'entitlements',
  'feature_flag_audit',
  'feature_flags',
  'landing_page_config',
  'landing_promotions',
  'lead_conversions',
  'lead_interactions',
  'leads',
  'login_audit',
  'plans',
  'platform_audit_logs',
  'platform_coupon_redemptions',
  'platform_coupons',
  'platform_settings',
  'promotional_campaigns',
  'sales_demos',
  'sales_opportunities',
  'sensitive_operations_log',
  'subscriber_tenant_audit',
  'subscriber_tenants',
  'subscription_state_changes',
  'subscriptions',
  'support_access_log',
  'support_cases',
  // Added by 078_platform_commercial_partnerships.sql -- Platform Admin
  // Comercial & Parcerias (Landing CMS, banners, platform-level
  // Partners/Referrals/Benefits/Credits/Commissions). Platform-global,
  // no RLS -- distinct from the tenant-scoped commercial_partners family
  // (054/058/059). platform_referral_credits has an agency_id FK but is
  // written exclusively by Platform Admin routes, never by tenant/agency
  // runtime code, so it belongs here rather than in expectedTenantTables.
  'platform_banners',
  'platform_landing_page',
  'platform_landing_publications',
  'platform_landing_sections',
  'platform_partner_benefits',
  'platform_partner_commissions',
  'platform_partners',
  'platform_referral_credits',
  'platform_referrals',
];

interface CommandResult {
  stdout: string;
  stderr: string;
}

describe('database integration migrations and RLS', () => {
  beforeAll(async () => {
    assertSafeTestDatabase();
    if (isCiMode) {
      await waitForPostgresConnection();
      // The CI postgres service is shared across the whole job -- by the
      // time this step runs, the "Unit tests" step's own disposable-DB
      // test files (customers.test.ts and friends) have already connected
      // to this exact service (their own container spin-up is a no-op
      // when CI=true) and each left behind whatever curated migration
      // subset it applies for itself. Without this reset, "applies every
      // ordered migration to an empty local database" runs against
      // whatever schema the last such file left, not an empty one --
      // found via a real CI run ("type Plan already exists" / duplicate
      // key errors, because migrations 001+ had already been applied
      // once by an earlier step).
      psqlAdmin('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    } else {
      resetDisposableDatabase();
      await waitForHealthyContainer();
      assertContainerIsLocal();
    }
  });

  afterAll(() => {
    assertSafeTestDatabase();
    if (!isCiMode) {
      compose(['down', '-v']);
    }
  });

  it('applies every ordered migration to an empty local database', () => {
    const result = psqlAdmin(readAllMigrations());

    expect(result.stdout).toContain('CREATE TABLE');
    expect(result.stdout).toContain('CREATE POLICY');
    expect(result.stderr).not.toContain('ERROR');
  });

  it('creates exactly the current migrated domain tables', () => {
    const tables = queryAdminLines(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;",
    );

    expect(tables).toEqual(expectedAllTables);
  });

  it('validates constraints, soft delete, tenant-safe FKs, CustomerAccount, and Proposal snapshot', () => {
    const result = psqlAdmin(readSql(constraintsTestSql));

    expect(result.stdout).toContain('Wish travelers_count = 0');
    expect(result.stdout).toContain('Customer CPF/email reuse after soft delete');
    expect(result.stdout).toContain('Customer can exist without CustomerAccount');
    expect(result.stdout).toContain('CustomerAccount duplicate Customer A');
    expect(result.stdout).toContain('Proposal Agency A -> Customer B');
    expect(result.stdout).toContain('Proposal Agency A -> Offer B');
    expect(result.stdout).toContain('Sale Agency A -> Proposal B');
    expect(result.stdout).toContain('Trip Agency A -> Sale B');
    expect(result.stdout).toContain('Proposal snapshot after Offer change');
    expect(result.stdout).toContain('(25 rows)');
    expect(result.stderr).not.toContain('ERROR');
  });

  it('prepares a non-superuser runtime role without BYPASSRLS', () => {
    const result = psqlAdmin(readSql(prepareRolesSql));

    expect(result.stdout).toContain(runtimeUser);
    expect(result.stdout).toContain(' f        | f            | f           | f');
    expect(result.stderr).not.toContain('ERROR');
  });

  it('seeds a second tenant audit event for runtime read-isolation validation', () => {
    const result = psqlAdmin(`
      INSERT INTO audit_logs
        (agency_id, actor_type, actor_id, event_type, entity_type, entity_id, outcome, metadata)
      VALUES
        ('20000000-0000-4000-8000-000000000001', 'USER',
         '21000000-0000-4000-8000-000000000001', 'PAYMENT_RECORDED',
         'payment', 'audit-payment-b', 'SUCCESS', '{}'::jsonb);
    `);

    expect(result.stderr).not.toContain('ERROR');
  });

  it('enforces RLS for SELECT, INSERT, UPDATE, DELETE, invalid tenants, and fail-closed access', () => {
    const result = psqlRuntime(readSql(rlsRuntimeTestSql));

    expect(result.stdout).toContain('RLS SELECT Customer A cannot see Customer B');
    expect(result.stdout).toContain('RLS INSERT Customer agency B while tenant A');
    expect(result.stdout).toContain('RLS UPDATE agency_id A to B');
    expect(result.stdout).toContain('RLS DELETE Customer B while tenant A');
    expect(result.stdout).toContain('RLS SELECT Audit Log B while tenant A');
    expect(result.stdout).toContain('RLS INSERT Audit Log agency B while tenant A');
    expect(result.stdout).toContain('Runtime cannot UPDATE Audit Log');
    expect(result.stdout).toContain('Runtime cannot DELETE Audit Log');
    expect(result.stdout).toContain('Fail closed SELECT without tenant');
    expect(result.stdout).toContain('Invalid tenant INSERT referencing real Customer A');
    expect(result.stdout).toContain('Runtime role rolsuper/rolbypassrls false');
    expect(result.stdout).toContain(
      'SEC-01 pool reuse: fresh transaction without context is fail-closed',
    );
    expect(result.stdout).toContain(
      'SEC-01 pool reuse: Agency A transaction sees only Agency A',
    );
    expect(result.stdout).toContain(
      'SEC-01 pool reuse: second reused transaction does not inherit Agency A',
    );
    expect(result.stdout).toContain(
      'SEC-01 pool reuse: Agency B transaction sees only Agency B, not Agency A',
    );
    expect(result.stdout).toContain(
      'SEC-01 pool reuse: third reused transaction does not inherit Agency B',
    );
    expect(result.stdout).toContain('(42 rows)');
    expect(result.stderr).not.toContain('ERROR');
  });

  it('keeps FORCE RLS enabled on every migrated tenant table', () => {
    const rows = queryAdminLines(`
      SELECT relname
      FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relkind = 'r'
        AND relname = ANY(ARRAY[${expectedTenantTables.map((table) => `'${table}'`).join(', ')}])
        AND relrowsecurity = TRUE
        AND relforcerowsecurity = TRUE
      ORDER BY relname;
    `);

    expect(rows).toEqual(expectedTenantTables);
  });

  it('keeps tenant context functions without SECURITY DEFINER', () => {
    const rows = queryAdminLines(`
      SELECT proname || ':' || prosecdef::TEXT
      FROM pg_proc
      JOIN pg_namespace n ON n.oid = pronamespace
      WHERE nspname = 'public'
        AND proname IN (
          'current_agency_id',
          'current_user_id',
          'set_tenant_context',
          'clear_tenant_context'
        )
      ORDER BY proname;
    `);

    expect(rows).toEqual([
      'clear_tenant_context:false',
      'current_agency_id:false',
      'current_user_id:false',
      'set_tenant_context:false',
    ]);
  });

  it('grants runtime role only the expected table and tenant function privileges', () => {
    const tableGrantCount = queryAdminScalar(`
      SELECT COUNT(*)
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND grantee = '${runtimeUser}'
        AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE');
    `);
    const functionGrants = queryAdminLines(`
      SELECT routine_name
      FROM information_schema.routine_privileges
      WHERE specific_schema = 'public'
        AND grantee = '${runtimeUser}'
      ORDER BY routine_name;
    `);

    // Every table the runtime role is actually granted on -- the tenant
    // (RLS-backed) tables plus the handful of platform-only tables that
    // are granted but not tenant-scoped (nonTenantGrantedTables above).
    const allGrantedTablesCount = expectedTenantTables.length + nonTenantGrantedTables.length;
    const fullCrudTablesCount =
      allGrantedTablesCount - readInsertOnlyTables.length - noDeleteTables.length - noUpdateTables.length;

    expect(tableGrantCount).toBe(
      String(
        fullCrudTablesCount * 4 +
          readInsertOnlyTables.length * 2 +
          noDeleteTables.length * 3 +
          noUpdateTables.length * 3,
      ),
    );
    expect(
      queryAdminLines(`
        SELECT table_name || ':' || privilege_type
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND grantee = '${runtimeUser}'
          AND table_name = ANY(ARRAY[${readInsertOnlyTables.map((table) => `'${table}'`).join(', ')}])
        ORDER BY table_name, privilege_type;
      `),
    ).toEqual(readInsertOnlyTables.flatMap((table) => [`${table}:INSERT`, `${table}:SELECT`]));
    expect(
      queryAdminLines(`
        SELECT table_name || ':' || privilege_type
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND grantee = '${runtimeUser}'
          AND table_name = ANY(ARRAY[${noDeleteTables.map((table) => `'${table}'`).join(', ')}])
        ORDER BY table_name, privilege_type;
      `),
    ).toEqual(
      noDeleteTables.flatMap((table) => [`${table}:INSERT`, `${table}:SELECT`, `${table}:UPDATE`]),
    );
    expect(
      queryAdminLines(`
        SELECT table_name || ':' || privilege_type
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND grantee = '${runtimeUser}'
          AND table_name = ANY(ARRAY[${noUpdateTables.map((table) => `'${table}'`).join(', ')}])
        ORDER BY table_name, privilege_type;
      `),
    ).toEqual(noUpdateTables.flatMap((table) => [`${table}:DELETE`, `${table}:INSERT`, `${table}:SELECT`]));
    expect(functionGrants).toEqual([
      'clear_tenant_context',
      'current_agency_id',
      'current_user_id',
      'set_tenant_context',
    ]);
  });
});

function assertSafeTestDatabase(): void {
  const forbiddenMarkers = ['production', 'prod', 'staging', 'stage'];
  const environmentValues = [
    process.env.NODE_ENV,
    process.env.APP_ENV,
    process.env.DATABASE_ENV,
    process.env.ENVIRONMENT,
  ];

  if (!['127.0.0.1', 'localhost'].includes(localHost)) {
    throw new Error('Database integration tests require localhost only.');
  }

  if (!['local', 'ci'].includes(testMode)) {
    throw new Error('DATABASE_TEST_MODE must be local or ci.');
  }

  if (isCiMode && process.env.GITHUB_ACTIONS !== 'true') {
    throw new Error('CI database mode is allowed only inside GitHub Actions.');
  }

  if (!isCiMode && !isSafeLocalPort(localPort)) {
    throw new Error('Local database integration tests require a safe local PostgreSQL port.');
  }

  if (isCiMode && localPort !== '5432') {
    throw new Error('CI database integration tests require the PostgreSQL service port 5432.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Database integration tests require a database name with a test marker.');
  }

  if (environmentValues.some((value) => value && forbiddenMarkers.includes(value.toLowerCase()))) {
    throw new Error('Refusing to run database tests in production/staging-like environment.');
  }

  if (process.env.DATABASE_URL) {
    assertDatabaseUrlIsSafe(process.env.DATABASE_URL);
  }
}

function assertDatabaseUrlIsSafe(rawUrl: string): void {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('DATABASE_URL is present but cannot be parsed safely.');
  }

  const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
  const safeDatabase = url.pathname.replace('/', '').includes('test');
  const safePort = url.port === localPort || url.port === '';

  if (!safeHost || !safeDatabase || !safePort) {
    throw new Error('Refusing to run database tests while DATABASE_URL points outside the approved local test database.');
  }
}

function resetDisposableDatabase(): void {
  compose(['down', '-v']);
  compose(['up', '-d']);
}

function compose(args: readonly string[]): CommandResult {
  return run('docker', ['compose', '-f', composeFile, '-p', projectName, ...args], undefined, true, {
    DATABASE_TEST_CONTAINER_NAME: containerName,
    DATABASE_TEST_PORT: localPort,
  });
}

function psqlAdmin(sql: string): CommandResult {
  return runPsql(adminUser, adminPassword, sql);
}

function psqlRuntime(sql: string): CommandResult {
  return runPsql(runtimeUser, runtimePassword, sql);
}

function runPsql(user: string, password: string, sql: string): CommandResult {
  if (isCiMode) {
    return dockerRunPsql(user, password, sql);
  }

  return dockerExecPsql(user, password, sql);
}

function dockerExecPsql(user: string, password: string, sql: string): CommandResult {
  return run('docker', [
    'exec',
    '-i',
    '-e',
    `PGPASSWORD=${password}`,
    containerName,
    'psql',
    '-h',
    localHost,
    '-p',
    '5432',
    '-U',
    user,
    '-d',
    databaseName,
    '-v',
    'ON_ERROR_STOP=1',
  ], sql);
}

function dockerRunPsql(user: string, password: string, sql: string): CommandResult {
  return run('docker', [
    'run',
    '--rm',
    '-i',
    '--network',
    'host',
    '-e',
    `PGPASSWORD=${password}`,
    postgresImage,
    'psql',
    '-h',
    localHost,
    '-p',
    '5432',
    '-U',
    user,
    '-d',
    databaseName,
    '-v',
    'ON_ERROR_STOP=1',
  ], sql);
}

function queryAdminLines(sql: string): string[] {
  return queryAdmin(sql)
    .stdout.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function queryAdminScalar(sql: string): string {
  const lines = queryAdminLines(sql);
  expect(lines).toHaveLength(1);
  return lines[0] ?? '';
}

function queryAdmin(sql: string): CommandResult {
  if (isCiMode) {
    return run('docker', [
      'run',
      '--rm',
      '--network',
      'host',
      '-e',
      `PGPASSWORD=${adminPassword}`,
      postgresImage,
      'psql',
      '-h',
      localHost,
      '-p',
      localPort,
      '-U',
      adminUser,
      '-d',
      databaseName,
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      sql,
    ]);
  }

  return run('docker', [
    'exec',
    '-e',
    `PGPASSWORD=${adminPassword}`,
    containerName,
    'psql',
    '-h',
    localHost,
    '-p',
    '5432',
    '-U',
    adminUser,
    '-d',
    databaseName,
    '-At',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  ]);
}

function readSql(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

function readAllMigrations(): string {
  const migrationFiles = readdirSync(migrationsDir)
    .filter((fileName) => /^\d+_.+\.sql$/.test(fileName))
    .sort();

  expect(migrationFiles.length).toBeGreaterThanOrEqual(15);
  migrationFiles.forEach((fileName, index) => {
    expect(fileName.startsWith(`${String(index + 1).padStart(3, '0')}_`)).toBe(true);
  });

  return migrationFiles
    .map((fileName) => readSql(resolve(migrationsDir, fileName)))
    .join('\n');
}

async function waitForHealthyContainer(): Promise<void> {
  const timeoutAt = Date.now() + 120_000;

  while (Date.now() < timeoutAt) {
    const result = run('docker', [
      'inspect',
      '-f',
      '{{.State.Health.Status}}',
      containerName,
    ], undefined, false);

    if (result.stdout.trim() === 'healthy') {
      return;
    }

    await new Promise((resolveWait) => {
      setTimeout(resolveWait, 2_000);
    });
  }

  throw new Error('Local PostgreSQL container did not become healthy in time.');
}

async function waitForPostgresConnection(): Promise<void> {
  const timeoutAt = Date.now() + 120_000;

  while (Date.now() < timeoutAt) {
    const result = run('docker', [
      'run',
      '--rm',
      '--network',
      'host',
      '-e',
      `PGPASSWORD=${adminPassword}`,
      postgresImage,
      'psql',
      '-h',
      localHost,
      '-p',
      localPort,
      '-U',
      adminUser,
      '-d',
      databaseName,
      '-At',
      '-c',
      'SELECT 1;',
    ], undefined, false);

    if (result.stdout.trim() === '1') {
      return;
    }

    await new Promise((resolveWait) => {
      setTimeout(resolveWait, 2_000);
    });
  }

  throw new Error('CI PostgreSQL service did not accept connections in time.');
}

function assertContainerIsLocal(): void {
  const result = run('docker', [
    'ps',
    '--filter',
    `name=${containerName}`,
    '--format',
    '{{.Image}}|{{.Ports}}',
  ]);
  const output = result.stdout.trim();

  expect(output).toContain(postgresImage);
  expect(output).toContain('->5432/tcp');
}

function sanitizeDockerName(value: string): string {
  const sanitized = value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return sanitized.length > 0 ? sanitized : 'workspace';
}

function isSafeLocalPort(value: string): boolean {
  if (!/^\d+$/.test(value)) {
    return false;
  }

  const port = Number(value);
  return port === 0 || (port >= 1024 && port <= 65535);
}

function run(
  command: string,
  args: readonly string[],
  input?: string,
  throwOnError = true,
  environmentOverrides: Record<string, string> = {},
): CommandResult {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...environmentOverrides },
    input,
    maxBuffer: 1024 * 1024 * 20,
  });

  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();

  if (throwOnError && result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${command} ${redactArgs(args).join(' ')}`,
        `Exit code: ${result.status ?? 'unknown'}`,
        stdout,
        stderr,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  return { stdout, stderr };
}

function redactArgs(args: readonly string[]): string[] {
  return args.map((arg) =>
    arg.startsWith('PGPASSWORD=') ? 'PGPASSWORD=<redacted>' : arg,
  );
}
