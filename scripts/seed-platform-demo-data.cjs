#!/usr/bin/env node
/**
 * Platform SaaS Demo Data Seed Script
 */

const { Pool } = require('pg');
const crypto = require('crypto');

const databaseUrl = process.env.DATABASE_URL ||
  'postgresql://travel_test:travel_test_password@127.0.0.1:55432/travel_platform_test';

const pool = new Pool({ connectionString: databaseUrl });

async function seedPlatformData() {
  console.log('\n========================================');
  console.log('Seeding Platform SaaS Demo Data');
  console.log('========================================\n');

  try {
    console.log('1. Creating Platform Users...');
    await seedPlatformUsers();

    console.log('2. Creating Plans...');
    const plans = await seedPlans();

    console.log('3. Creating Agencies...');
    const agencies = await seedAgencies();

    console.log('4. Creating Subscriber Tenants...');
    const tenants = await seedSubscriberTenants(agencies);

    console.log('5. Creating Subscriptions...');
    await seedSubscriptions(tenants, plans);

    console.log('6. Creating Leads...');
    await seedLeads();

    console.log('7. Creating Invoices...');
    await seedInvoicesAndPayments(tenants);

    console.log('8. Creating Support Cases...');
    await seedSupportCases(tenants);

    console.log('\n9. Verifying data...');
    await verifyDemoData();

    console.log('\n✅ SEEDING COMPLETE\n');
  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function seedPlatformUsers() {
  const roles = ['PLATFORM_OWNER', 'BILLING_ADMIN', 'MARKETING_ADMIN', 'SUPPORT_ADMIN', 'READ_ONLY_AUDITOR'];

  for (const role of roles) {
    const id = crypto.randomUUID();
    const email = `admin-${role.toLowerCase()}@platform.test`;

    await pool.query(
      `INSERT INTO platform_users (id, email, role, password_hash, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'demo-hash', 'ACTIVE', NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [id, email, role]
    );
    console.log(`   ✓ ${role}`);
  }
}

async function seedPlans() {
  const plans = [
    { name: 'Starter', slug: 'starter', price: 99 },
    { name: 'Pro', slug: 'pro', price: 299 },
    { name: 'Enterprise', slug: 'enterprise', price: 999 },
    { name: 'Custom', slug: 'custom', price: null },
  ];

  const result = [];

  for (const plan of plans) {
    const id = crypto.randomUUID();

    await pool.query(
      `INSERT INTO plans (id, name, slug, price_amount, price_currency, billing_interval, features, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'BRL', 'MONTHLY', '{}'::jsonb, true, NOW(), NOW()) ON CONFLICT (name) DO NOTHING`,
      [id, plan.name, plan.slug, plan.price || 0]
    );

    // Get the actual ID from the database
    const selectResult = await pool.query(
      `SELECT id FROM plans WHERE name = $1 LIMIT 1`,
      [plan.name]
    );

    if (selectResult.rows.length > 0) {
      result.push({ id: selectResult.rows[0].id, name: plan.name });
      console.log(`   ✓ ${plan.name}`);
    }
  }

  return result;
}

async function seedAgencies() {
  const agencies = [
    { name: 'Alpha Viagens', email: 'owner@alpha.test' },
    { name: 'Bella Tours', email: 'owner@bella.test' },
    { name: 'Caribé Turismo', email: 'owner@caribe.test' },
    { name: 'Dream Trips', email: 'owner@dream.test' },
    { name: 'Escape Viagens', email: 'owner@escape.test' },
    { name: 'Flex Tours', email: 'owner@flex.test' },
    { name: 'Global Viagens', email: 'owner@global.test' },
    { name: 'Happy Travel', email: 'owner@happy.test' },
    { name: 'Mundo Viagens', email: 'owner@mundo.test' },
    { name: 'Premium Tours', email: 'owner@premium.test' },
    { name: 'Quality Travel', email: 'owner@quality.test' },
    { name: 'Quintessence', email: 'owner@quintessence.test' }
  ];
  const result = [];

  for (const agency of agencies) {
    const id = crypto.randomUUID();
    const slug = agency.name.toLowerCase().replace(/\s+/g, '-');

    await pool.query(
      `INSERT INTO agencies (id, name, slug, email, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [id, agency.name, slug, agency.email]
    );

    result.push({ id, name: agency.name });
    console.log(`   ✓ ${agency.name}`);
  }

  return result;
}

async function seedSubscriberTenants(agencies) {
  const result = [];

  for (let i = 0; i < agencies.length; i++) {
    const agency = agencies[i];
    const id = crypto.randomUUID();
    const email = `billing@${agency.name.toLowerCase().replace(/\s+/g, '-')}.test`;

    await pool.query(
      `INSERT INTO subscriber_tenants (id, agency_id, legal_name, contact_email, contact_name, billing_status, subscription_status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', 'ACTIVE', NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [id, agency.id, agency.name, email, agency.name]
    );

    result.push({ id, agencyId: agency.id, name: agency.name });
    console.log(`   ✓ ${agency.name}`);
  }

  return result;
}

async function seedSubscriptions(tenants, plans) {
  const now = new Date();
  let count = 0;

  for (let i = 0; i < tenants.length; i++) {
    const tenant = tenants[i];
    const plan = plans[i % plans.length];
    const startDate = new Date(now.getTime() - Math.random() * 180 * 24 * 60 * 60 * 1000);
    const currentPeriodStart = new Date(startDate);
    const currentPeriodEnd = new Date(currentPeriodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
    const amount = plan.id === plans[0].id ? 99 : plan.id === plans[1].id ? 299 : 999;

    await pool.query(
      `INSERT INTO subscriptions (id, subscriber_tenant_id, plan_id, billing_interval, amount, currency, current_period_start, current_period_end, created_at, updated_at)
       VALUES ($1, $2, $3, 'MONTHLY', $4, 'BRL', $5, $6, NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [crypto.randomUUID(), tenant.id, plan.id, amount, currentPeriodStart, currentPeriodEnd]
    );
    count++;
  }

  for (let i = 0; i < 8; i++) {
    const tenant = tenants[i];
    const plan = plans[i % plans.length];
    const startDate = new Date(now.getTime() - Math.random() * 180 * 24 * 60 * 60 * 1000);
    const currentPeriodStart = new Date(startDate);
    const currentPeriodEnd = new Date(currentPeriodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
    const amount = plan.id === plans[0].id ? 99 : plan.id === plans[1].id ? 299 : 999;

    await pool.query(
      `INSERT INTO subscriptions (id, subscriber_tenant_id, plan_id, billing_interval, amount, currency, current_period_start, current_period_end, created_at, updated_at)
       VALUES ($1, $2, $3, 'MONTHLY', $4, 'BRL', $5, $6, NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [crypto.randomUUID(), tenant.id, plan.id, amount, currentPeriodStart, currentPeriodEnd]
    );
    count++;
  }

  console.log(`   ✓ Created ${count} subscriptions`);
}

async function seedLeads() {
  const names = ['João Silva', 'Maria Santos', 'Pedro Oliveira'];
  const statuses = ['NEW', 'CONTACTED', 'QUALIFIED', 'TRIAL', 'WON', 'LOST'];

  for (let i = 0; i < 25; i++) {
    const name = names[i % names.length];

    await pool.query(
      `INSERT INTO leads (id, company_name, name, email, phone, status, source, created_at, updated_at)
       VALUES ($1, $2, $3, $4, '11-99999-1000', $5, 'WEBSITE', NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [crypto.randomUUID(), `Company ${i}`, name, `lead${i}@test.com`, statuses[i % statuses.length]]
    );
  }

  console.log(`   ✓ Created 25 leads`);
}

async function seedInvoicesAndPayments(tenants) {
  const now = new Date();
  const statuses = ['PAID', 'PAID', 'PAID', 'SENT', 'SENT', 'OVERDUE'];

  for (let i = 0; i < 15; i++) {
    const tenant = tenants[i % tenants.length];
    const amount = (99 + Math.random() * 900).toFixed(2);
    const status = statuses[i % statuses.length];
    const invoiceId = crypto.randomUUID();
    const issueDate = new Date(now.getTime() - Math.random() * 90 * 24 * 60 * 60 * 1000);
    const dueDate = new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    const periodStart = new Date(issueDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const periodEnd = new Date(issueDate);
    const totalAmount = amount;

    await pool.query(
      `INSERT INTO billing_invoices (id, subscriber_tenant_id, amount, total_amount, currency, status, period_start, period_end, issued_at, due_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'BRL', $5, $6, $7, $8, $9, NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [invoiceId, tenant.id, amount, totalAmount, status, periodStart, periodEnd, issueDate, dueDate]
    );

    if (status === 'PAID') {
      await pool.query(
        `INSERT INTO billing_payments (id, invoice_id, amount, currency, status, completed_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'BRL', 'SUCCEEDED', $4, NOW(), NOW()) ON CONFLICT DO NOTHING`,
        [crypto.randomUUID(), invoiceId, amount, issueDate]
      );
    }
  }

  console.log(`   ✓ Created 15 invoices`);
}

async function seedSupportCases(tenants) {
  const titles = [
    'Storage limit exceeded',
    'Need feature configuration help',
    'Billing discrepancy',
    'Integration not working',
    'Performance issues',
    'MFA setup assistance',
    'Data export request',
    'Custom report needed',
  ];

  const statuses = ['OPEN', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
  const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

  for (let i = 0; i < 12; i++) {
    const tenant = tenants[i % tenants.length];
    const title = titles[i % titles.length];
    const status = statuses[i % statuses.length];
    const priority = priorities[i % priorities.length];
    const description = `Support case: ${title}\nTenant: ${tenant.contact_name}\nRequires urgent attention.`;

    await pool.query(
      `INSERT INTO support_cases (id, subscriber_tenant_id, title, description, status, priority, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [crypto.randomUUID(), tenant.id, title, description, status, priority]
    );
  }

  console.log(`   ✓ Created 12 support cases`);
}

async function verifyDemoData() {
  const queries = [
    ['Platform Users', 'SELECT COUNT(*) as count FROM platform_users'],
    ['Plans', 'SELECT COUNT(*) as count FROM plans'],
    ['Agencies', 'SELECT COUNT(*) as count FROM agencies'],
    ['Subscriber Tenants', 'SELECT COUNT(*) as count FROM subscriber_tenants'],
    ['Subscriptions', 'SELECT COUNT(*) as count FROM subscriptions'],
    ['Leads', 'SELECT COUNT(*) as count FROM leads'],
    ['Invoices', 'SELECT COUNT(*) as count FROM billing_invoices'],
    ['Support Cases', 'SELECT COUNT(*) as count FROM support_cases'],
  ];

  for (const [label, sql] of queries) {
    const result = await pool.query(sql);
    console.log(`   ✓ ${label}: ${result.rows[0].count}`);
  }
}

seedPlatformData();
