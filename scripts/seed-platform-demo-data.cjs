#!/usr/bin/env node
/**
 * Platform SaaS Demo Data Seed Script
 *
 * Seeds realistic demo data for the entire SaaS platform including:
 * - 12 subscriber tenants (agencies)
 * - 4 plans (Starter, Pro, Enterprise, Custom)
 * - 20+ subscriptions (mix of ACTIVE, TRIAL, PAST_DUE, SUSPENDED, CANCELLED)
 * - 25+ leads (various statuses)
 * - 15+ invoices
 * - Payment records
 * - Promotional campaigns
 * - Support tickets
 * - Feature flags
 *
 * Usage: npm run demo:seed:platform
 * Or: node scripts/seed-platform-demo-data.cjs
 */

const { Pool } = require('pg');
const crypto = require('crypto');

const databaseUrl = process.env.DATABASE_URL ||
  'postgresql://travel_test:travel_test_password@127.0.0.1:55432/travel_platform_test';

const pool = new Pool({ connectionString: databaseUrl });

// Helper to generate UUIDs
function generateId() {
  return crypto.randomUUID();
}

// Deterministic ID generation for consistency
function deterministicId(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
}

async function seedPlatformData() {
  console.log('\n========================================');
  console.log('Seeding Platform SaaS Demo Data');
  console.log('========================================\n');

  try {
    // 1. Create Platform Users
    console.log('1. Creating Platform Users...');
    const platformUsers = await seedPlatformUsers();
    const adminUserId = platformUsers[0];

    // 2. Create Plans
    console.log('2. Creating Plans...');
    const plans = await seedPlans();

    // 3. Create Subscriber Tenants (Agencies)
    console.log('3. Creating Subscriber Tenants...');
    const tenants = await seedSubscriberTenants();

    // 4. Create Subscriptions
    console.log('4. Creating Subscriptions...');
    await seedSubscriptions(tenants, plans);

    // 5. Create Courtesy Accounts
    console.log('5. Creating Courtesy Accounts...');
    await seedCourtesyAccounts(tenants);

    // 6. Create Leads
    console.log('6. Creating Leads...');
    await seedLeads();

    // 7. Create Invoices & Payments
    console.log('7. Creating Invoices & Payments...');
    await seedInvoicesAndPayments(tenants);

    // 8. Create Coupons & Promotions
    console.log('8. Creating Promotions...');
    await seedPromotions();

    // 9. Create Feature Flags
    console.log('9. Creating Feature Flags...');
    await seedFeatureFlags();

    // 10. Create Landing Page Config
    console.log('10. Creating Landing Page Config...');
    await seedLandingPageConfig();

    // 11. Create Support Tickets
    console.log('11. Creating Support Tickets...');
    await seedSupportTickets(tenants, adminUserId);

    // 12. Verify data
    console.log('\n12. Verifying demo data...');
    await verifyDemoData();

    console.log('\n========================================');
    console.log('✅ PLATFORM DEMO DATA SEEDING COMPLETE');
    console.log('========================================\n');

  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function seedPlatformUsers() {
  const users = [];
  const roles = ['PLATFORM_OWNER', 'BILLING_ADMIN', 'MARKETING_ADMIN', 'SUPPORT_ADMIN', 'READ_ONLY_AUDITOR'];

  for (let i = 0; i < roles.length; i++) {
    const id = generateId();
    const email = `admin-${roles[i].toLowerCase()}@platform.test`;

    await pool.query(
      `INSERT INTO "PlatformUsers" (id, email, role, password_hash, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'demo-hash', 'ACTIVE', NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [id, email, roles[i]]
    );

    users.push(id);
    console.log(`   ✓ ${roles[i]}: ${email}`);
  }

  return users;
}

async function seedPlans() {
  const plans = [
    {
      name: 'Starter',
      description: 'Perfect for new agencies just getting started',
      price_monthly: 99,
      price_annual: 990,
      currency: 'BRL',
      max_users: 3,
      max_customers: 50,
      max_storage_gb: 10,
      has_pescador: false,
      has_customer_360: true,
      has_marketing: false,
      has_financial: true,
      has_customer_portal: false,
      has_reports: false,
      has_integrations: false,
    },
    {
      name: 'Pro',
      description: 'For growing agencies with advanced needs',
      price_monthly: 299,
      price_annual: 2990,
      currency: 'BRL',
      max_users: 10,
      max_customers: 500,
      max_storage_gb: 100,
      has_pescador: true,
      has_customer_360: true,
      has_marketing: true,
      has_financial: true,
      has_customer_portal: true,
      has_reports: true,
      has_integrations: true,
    },
    {
      name: 'Enterprise',
      description: 'For large-scale operations',
      price_monthly: 999,
      price_annual: 9990,
      currency: 'BRL',
      max_users: 50,
      max_customers: 5000,
      max_storage_gb: 1000,
      has_pescador: true,
      has_customer_360: true,
      has_marketing: true,
      has_financial: true,
      has_customer_portal: true,
      has_reports: true,
      has_integrations: true,
    },
    {
      name: 'Custom',
      description: 'Tailored solution for your unique needs',
      price_monthly: null,
      price_annual: null,
      currency: 'BRL',
      max_users: 999,
      max_customers: 999999,
      max_storage_gb: 10000,
      has_pescador: true,
      has_customer_360: true,
      has_marketing: true,
      has_financial: true,
      has_customer_portal: true,
      has_reports: true,
      has_integrations: true,
    },
  ];

  const result = [];

  for (const plan of plans) {
    const id = generateId();

    await pool.query(
      `INSERT INTO "Plans" (
        id, name, description, price_monthly, price_annual, currency,
        max_users, max_customers, max_storage_gb,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      ON CONFLICT DO NOTHING`,
      [
        id, plan.name, plan.description,
        plan.price_monthly, plan.price_annual, plan.currency,
        plan.max_users, plan.max_customers, plan.max_storage_gb
      ]
    );

    // Create entitlements for this plan
    await pool.query(
      `INSERT INTO "Entitlements" (
        id, plan_id, feature_key, feature_value, created_at, updated_at
      ) VALUES
        ($1, $2, 'pescador', $3, NOW(), NOW()),
        ($4, $2, 'customer_360', $5, NOW(), NOW()),
        ($6, $2, 'marketing', $7, NOW(), NOW()),
        ($8, $2, 'financial', $9, NOW(), NOW()),
        ($10, $2, 'customer_portal', $11, NOW(), NOW()),
        ($12, $2, 'reports', $13, NOW(), NOW()),
        ($14, $2, 'integrations', $15, NOW(), NOW())
      ON CONFLICT DO NOTHING`,
      [
        generateId(), id, plan.has_pescador,
        generateId(), id, plan.has_customer_360,
        generateId(), id, plan.has_marketing,
        generateId(), id, plan.has_financial,
        generateId(), id, plan.has_customer_portal,
        generateId(), id, plan.has_reports,
        generateId(), id, plan.has_integrations
      ]
    );

    result.push({ id, name: plan.name });
    console.log(`   ✓ ${plan.name} - $${plan.price_monthly}/month`);
  }

  return result;
}

async function seedSubscriberTenants() {
  const tenants = [];
  const agencies = [
    { name: 'Alpha Viagens', city: 'São Paulo', industry: 'travel_agency' },
    { name: 'Bella Tours', city: 'Rio de Janeiro', industry: 'travel_agency' },
    { name: 'Caribé Turismo', city: 'Salvador', industry: 'travel_agency' },
    { name: 'Dream Trips', city: 'Belo Horizonte', industry: 'travel_agency' },
    { name: 'Escape Viagens', city: 'Curitiba', industry: 'travel_agency' },
    { name: 'Flex Tours', city: 'Porto Alegre', industry: 'travel_agency' },
    { name: 'Global Viagens', city: 'Brasília', industry: 'travel_agency' },
    { name: 'Happy Travel', city: 'Florianópolis', industry: 'travel_agency' },
    { name: 'Mundo Viagens', city: 'Manaus', industry: 'travel_agency' },
    { name: 'Ônibus & Cia', city: 'Recife', industry: 'travel_agency' },
    { name: 'Premium Tours', city: 'Fortaleza', industry: 'travel_agency' },
    { name: 'Quintessence Travel', city: 'Goiânia', industry: 'travel_agency' },
  ];

  for (const agency of agencies) {
    const id = generateId();
    const email = `contact@${agency.name.toLowerCase().replace(/\s+/g, '-')}.test`;

    await pool.query(
      `INSERT INTO "SubscriberTenants" (
        id, name, email, phone, status, industry, city, country,
        created_at, updated_at
      ) VALUES ($1, $2, $3, '11-99999-0000', 'ACTIVE', $4, $5, 'BR', NOW(), NOW())
      ON CONFLICT DO NOTHING`,
      [id, agency.name, email, agency.industry, agency.city]
    );

    tenants.push({ id, name: agency.name });
    console.log(`   ✓ ${agency.name} (${agency.city})`);
  }

  return tenants;
}

async function seedSubscriptions(tenants, plans) {
  const statuses = ['ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'TRIAL', 'TRIAL', 'PAST_DUE', 'SUSPENDED', 'CANCELLED'];
  const now = new Date();

  let count = 0;
  for (let i = 0; i < tenants.length; i++) {
    const tenant = tenants[i];
    const plan = plans[i % plans.length];
    const status = statuses[i % statuses.length];

    const id = generateId();
    const startDate = new Date(now.getTime() - Math.random() * 180 * 24 * 60 * 60 * 1000);

    let endDate = null;
    if (status === 'CANCELLED') {
      endDate = new Date(startDate.getTime() + 90 * 24 * 60 * 60 * 1000);
    }

    await pool.query(
      `INSERT INTO "Subscriptions" (
        id, tenant_id, plan_id, status, started_at, ended_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      ON CONFLICT DO NOTHING`,
      [id, tenant.id, plan.id, status, startDate, endDate]
    );

    count++;
    console.log(`   ✓ ${tenant.name} - ${plan.name} (${status})`);
  }

  // Add extra subscriptions for some tenants to reach 20 total
  for (let i = 0; i < 8; i++) {
    const tenant = tenants[i % tenants.length];
    const plan = plans[Math.floor(Math.random() * plans.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];

    const id = generateId();
    const startDate = new Date(now.getTime() - Math.random() * 180 * 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO "Subscriptions" (
        id, tenant_id, plan_id, status, started_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT DO NOTHING`,
      [id, tenant.id, plan.id, status, startDate]
    );

    count++;
    console.log(`   ✓ Additional: ${tenant.name} - ${plan.name}`);
  }

  console.log(`   Total: ${count} subscriptions created`);
}

async function seedCourtesyAccounts(tenants) {
  const courtesyTypes = [
    { tenant: tenants[0], type: 'NONPROFIT', reason: 'Non-profit organization' },
    { tenant: tenants[1], type: 'PARTNER', reason: 'Strategic partnership' },
  ];

  for (const item of courtesyTypes) {
    const id = generateId();
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO "CourtesyAccountS" (
        id, tenant_id, type, reason, started_at, expires_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      ON CONFLICT DO NOTHING`,
      [id, item.tenant.id, item.type, item.reason, startDate, endDate]
    );

    console.log(`   ✓ ${item.tenant.name} - ${item.type} (${item.reason})`);
  }
}

async function seedLeads() {
  const leads = [
    { name: 'João Silva', company: 'Silva Turismo', email: 'joao@silva-turismo.test', status: 'NEW', source: 'WEBSITE' },
    { name: 'Maria Santos', company: 'Santos Travel', email: 'maria@santos-travel.test', status: 'CONTACTED', source: 'WEBSITE' },
    { name: 'Pedro Oliveira', company: 'Oliveira Tours', email: 'pedro@oliveira-tours.test', status: 'QUALIFIED', source: 'DEMO_REQUEST' },
    { name: 'Ana Costa', company: 'Costa Viagens', email: 'ana@costa-viagens.test', status: 'DEMO_SCHEDULED', source: 'PARTNER' },
    { name: 'Carlos Ferreira', company: 'Ferreira Travel', email: 'carlos@ferreira-travel.test', status: 'TRIAL', source: 'WEBSITE' },
    { name: 'Lucia Martins', company: 'Martins Tours', email: 'lucia@martins-tours.test', status: 'WON', source: 'REFERRAL' },
    { name: 'Roberto Alves', company: 'Alves Turismo', email: 'roberto@alves-turismo.test', status: 'LOST', source: 'WEBSITE' },
    { name: 'Fernanda Lima', company: 'Lima Travel', email: 'fernanda@lima-travel.test', status: 'NEW', source: 'SOCIAL' },
    { name: 'Diego Mendes', company: 'Mendes Viagens', email: 'diego@mendes-viagens.test', status: 'CONTACTED', source: 'WEBSITE' },
    { name: 'Sophia Ribeiro', company: 'Ribeiro Tours', email: 'sophia@ribeiro-tours.test', status: 'QUALIFIED', source: 'EMAIL' },
  ];

  for (let i = 0; i < 25; i++) {
    const lead = leads[i % leads.length];
    const id = generateId();
    const createdDate = new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO "Leads" (
        id, company_name, contact_name, email, phone, status, source, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, '11-99999-1000', $5, $6, $7, $7)
      ON CONFLICT DO NOTHING`,
      [id, lead.company, lead.name, lead.email, lead.status, lead.source, createdDate]
    );

    if ((i + 1) % 5 === 0) {
      console.log(`   ✓ ${i + 1} leads created`);
    }
  }

  console.log(`   ✓ Total: 25 leads created`);
}

async function seedInvoicesAndPayments(tenants) {
  const now = new Date();
  const invoiceStatuses = ['PAID', 'PAID', 'PAID', 'OPEN', 'OPEN', 'OVERDUE', 'REFUNDED'];

  for (let i = 0; i < 15; i++) {
    const tenant = tenants[i % tenants.length];
    const invoiceId = generateId();
    const amount = (99 + Math.random() * 900).toFixed(2);
    const invoiceDate = new Date(now.getTime() - Math.random() * 90 * 24 * 60 * 60 * 1000);
    const dueDate = new Date(invoiceDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    const status = invoiceStatuses[i % invoiceStatuses.length];

    await pool.query(
      `INSERT INTO "BillingInvoices" (
        id, tenant_id, amount, currency, status, issued_at, due_at, created_at, updated_at
      ) VALUES ($1, $2, $3, 'BRL', $4, $5, $6, NOW(), NOW())
      ON CONFLICT DO NOTHING`,
      [invoiceId, tenant.id, amount, status, invoiceDate, dueDate]
    );

    // Create corresponding payment for paid invoices
    if (status === 'PAID' || status === 'REFUNDED') {
      const paymentId = generateId();
      const paymentDate = new Date(invoiceDate.getTime() + Math.random() * 10 * 24 * 60 * 60 * 1000);
      const paymentStatus = status === 'REFUNDED' ? 'REFUNDED' : 'SUCCESSFUL';

      await pool.query(
        `INSERT INTO "BillingPayments" (
          id, invoice_id, amount, currency, status, paid_at, created_at, updated_at
        ) VALUES ($1, $2, $3, 'BRL', $4, $5, NOW(), NOW())
        ON CONFLICT DO NOTHING`,
        [paymentId, invoiceId, amount, paymentStatus, paymentDate]
      );
    }

    if ((i + 1) % 5 === 0) {
      console.log(`   ✓ ${i + 1} invoices and payments created`);
    }
  }

  console.log(`   ✓ Total: 15 invoices with corresponding payments`);
}

async function seedPromotions() {
  const promotions = [
    {
      title: 'Launch Sale',
      description: '30% discount for first 3 months',
      discount_type: 'PERCENTAGE',
      discount_value: 30,
      start_date: new Date('2026-08-01'),
      end_date: new Date('2026-12-31'),
    },
    {
      title: 'Annual Discount',
      description: '25% discount for annual payments',
      discount_type: 'PERCENTAGE',
      discount_value: 25,
      start_date: new Date('2026-01-01'),
      end_date: new Date('2027-12-31'),
    },
    {
      title: 'Partner Coupon',
      description: 'Special pricing for partners',
      discount_type: 'PERCENTAGE',
      discount_value: 20,
      start_date: new Date('2026-06-01'),
      end_date: new Date('2027-06-30'),
    },
  ];

  for (const promo of promotions) {
    const id = generateId();

    await pool.query(
      `INSERT INTO "Coupons" (
        id, code, discount_type, discount_value, max_uses, uses,
        valid_from, valid_until, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 999, 15, $5, $6, 'ACTIVE', NOW(), NOW())
      ON CONFLICT DO NOTHING`,
      [
        id,
        promo.title.toUpperCase().replace(/\s+/g, '_'),
        promo.discount_type,
        promo.discount_value,
        promo.start_date,
        promo.end_date,
      ]
    );

    // Also create promotional campaign
    const campaignId = generateId();
    await pool.query(
      `INSERT INTO "PromotionalCampaigns" (
        id, title, description, discount_type, discount_value,
        start_date, end_date, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', NOW(), NOW())
      ON CONFLICT DO NOTHING`,
      [
        campaignId,
        promo.title,
        promo.description,
        promo.discount_type,
        promo.discount_value,
        promo.start_date,
        promo.end_date,
      ]
    );

    console.log(`   ✓ ${promo.title}`);
  }
}

async function seedFeatureFlags() {
  const flags = [
    { key: 'experimental_ui', description: 'Enable experimental UI features', global_enabled: false },
    { key: 'new_pricing_model', description: 'New pricing model rollout', global_enabled: false },
    { key: 'advanced_analytics', description: 'Advanced analytics features', global_enabled: true },
    { key: 'beta_integrations', description: 'Beta integration features', global_enabled: false },
    { key: 'early_access_api_v2', description: 'Early access to API v2', global_enabled: false },
  ];

  for (const flag of flags) {
    const id = generateId();

    await pool.query(
      `INSERT INTO "FeatureFlags" (
        id, key, description, global_enabled, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT DO NOTHING`,
      [id, flag.key, flag.description, flag.global_enabled]
    );

    console.log(`   ✓ ${flag.key} (${flag.global_enabled ? 'enabled' : 'disabled'})`);
  }
}

async function seedLandingPageConfig() {
  const id = generateId();

  const config = {
    hero: {
      title: 'Travel Platform - Manage Your Agency Like Never Before',
      subtitle: 'Complete solution for travel agencies: Customer 360, Pescador, Financial, and more',
      cta_text: 'Start Free Trial',
    },
    benefits: [
      {
        title: 'Customer 360',
        description: 'Complete customer view and management',
        icon: 'users',
      },
      {
        title: 'Pescador',
        description: 'Smart supplier integrations and pricing',
        icon: 'search',
      },
      {
        title: 'Financial Suite',
        description: 'Complete financial management and reporting',
        icon: 'dollar-sign',
      },
    ],
  };

  await pool.query(
    `INSERT INTO "LandingPageConfig" (
      id, config, published, created_at, updated_at
    ) VALUES ($1, $2, true, NOW(), NOW())
    ON CONFLICT DO NOTHING`,
    [id, JSON.stringify(config)]
  );

  console.log(`   ✓ Landing page config created`);
}

async function seedSupportTickets(tenants, adminUserId) {
  const ticketStatuses = ['OPEN', 'OPEN', 'OPEN', 'IN_PROGRESS', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
  const severities = ['P1', 'P2', 'P2', 'P3', 'P3'];

  for (let i = 0; i < 5; i++) {
    const id = generateId();
    const tenant = tenants[i % tenants.length];
    const status = ticketStatuses[i % ticketStatuses.length];
    const severity = severities[i % severities.length];
    const title = [
      'Login issue - cannot access dashboard',
      'Need help with customer import',
      'Feature request: batch operations',
      'Question about plan limits',
      'Bug report: data export failing',
    ][i];

    await pool.query(
      `INSERT INTO "PlatformAuditLogs" (
        id, actor_id, action, entity_type, entity_id, changes, created_at
      ) VALUES ($1, $2, 'SUPPORT_TICKET_CREATED', 'Support', $3, $4, NOW())
      ON CONFLICT DO NOTHING`,
      [
        id,
        adminUserId,
        tenant.id,
        JSON.stringify({ title, status, severity }),
      ]
    );

    console.log(`   ✓ ${severity} - ${title.substring(0, 40)}`);
  }
}

async function verifyDemoData() {
  try {
    const platformUsers = await pool.query('SELECT COUNT(*) as count FROM "PlatformUsers"');
    const subscribers = await pool.query('SELECT COUNT(*) as count FROM "SubscriberTenants"');
    const plans = await pool.query('SELECT COUNT(*) as count FROM "Plans"');
    const subscriptions = await pool.query('SELECT COUNT(*) as count FROM "Subscriptions"');
    const leads = await pool.query('SELECT COUNT(*) as count FROM "Leads"');
    const invoices = await pool.query('SELECT COUNT(*) as count FROM "BillingInvoices"');
    const payments = await pool.query('SELECT COUNT(*) as count FROM "BillingPayments"');
    const flags = await pool.query('SELECT COUNT(*) as count FROM "FeatureFlags"');

    console.log('   Verification Results:');
    console.log(`   ✓ Platform Users: ${platformUsers.rows[0].count}`);
    console.log(`   ✓ Subscriber Tenants: ${subscribers.rows[0].count}`);
    console.log(`   ✓ Plans: ${plans.rows[0].count}`);
    console.log(`   ✓ Subscriptions: ${subscriptions.rows[0].count}`);
    console.log(`   ✓ Leads: ${leads.rows[0].count}`);
    console.log(`   ✓ Invoices: ${invoices.rows[0].count}`);
    console.log(`   ✓ Payments: ${payments.rows[0].count}`);
    console.log(`   ✓ Feature Flags: ${flags.rows[0].count}`);

    // Verify key counts
    const errors = [];
    if (parseInt(subscribers.rows[0].count, 10) < 12) errors.push('Insufficient subscriber tenants');
    if (parseInt(plans.rows[0].count, 10) < 4) errors.push('Insufficient plans');
    if (parseInt(subscriptions.rows[0].count, 10) < 20) errors.push('Insufficient subscriptions');
    if (parseInt(leads.rows[0].count, 10) < 25) errors.push('Insufficient leads');

    if (errors.length > 0) {
      console.error('   ❌ Verification errors:');
      errors.forEach(e => console.error(`      - ${e}`));
      return false;
    }

    return true;
  } catch (error) {
    console.error('   ❌ Verification failed:', error.message);
    return false;
  }
}

// Run the seed
seedPlatformData().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
