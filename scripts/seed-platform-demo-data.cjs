#!/usr/bin/env node
/**
 * Platform SaaS Demo Data Seed Script
 */

const { Pool } = require('pg');
const crypto = require('crypto');

const databaseUrl = process.env.DATABASE_URL ||
  'postgresql://travel_test:travel_test_password@127.0.0.1:55432/travel_platform_test';

const pool = new Pool({ connectionString: databaseUrl });

function generateId() {
  return crypto.randomUUID();
}

async function seedPlatformData() {
  console.log('\n========================================');
  console.log('Seeding Platform SaaS Demo Data');
  console.log('========================================\n');

  try {
    console.log('1. Creating Platform Users...');
    await seedPlatformUsers();

    console.log('2. Creating Plans...');
    const plans = await seedPlans();

    console.log('3. Creating Subscriber Tenants...');
    const tenants = await seedSubscriberTenants();

    console.log('4. Creating Subscriptions...');
    await seedSubscriptions(tenants, plans);

    console.log('5. Creating Leads...');
    await seedLeads();

    console.log('6. Creating Invoices...');
    await seedInvoicesAndPayments(tenants);

    console.log('\n7. Verifying data...');
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

    result.push({ id, name: plan.name });
    console.log(`   ✓ ${plan.name}`);
  }

  return result;
}

async function seedSubscriberTenants() {
  const agencies = ['Alpha Viagens', 'Bella Tours', 'Caribé Turismo', 'Dream Trips', 'Escape Viagens', 'Flex Tours', 'Global Viagens', 'Happy Travel', 'Mundo Viagens', 'Premium Tours', 'Quality Travel', 'Quintessence'];
  const result = [];

  for (const name of agencies) {
    const id = crypto.randomUUID();
    const email = `contact@${name.toLowerCase().replace(/\s+/g, '-')}.test`;

    await pool.query(
      `INSERT INTO subscriber_tenants (id, name, email, phone, status, created_at, updated_at)
       VALUES ($1, $2, $3, '11-99999-0000', 'ACTIVE', NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [id, name, email]
    );

    result.push({ id, name });
    console.log(`   ✓ ${name}`);
  }

  return result;
}

async function seedSubscriptions(tenants, plans) {
  const statuses = ['ACTIVE', 'ACTIVE', 'ACTIVE', 'TRIAL', 'TRIAL', 'PAST_DUE'];
  const now = new Date();
  let count = 0;

  for (let i = 0; i < tenants.length; i++) {
    const tenant = tenants[i];
    const plan = plans[i % plans.length];
    const status = statuses[i % statuses.length];
    const startDate = new Date(now.getTime() - Math.random() * 180 * 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO subscriptions (id, subscriber_tenant_id, plan_id, status, started_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [crypto.randomUUID(), tenant.id, plan.id, status, startDate]
    );
    count++;
  }

  for (let i = 0; i < 8; i++) {
    const tenant = tenants[i];
    const plan = plans[i % plans.length];
    const startDate = new Date(now.getTime() - Math.random() * 180 * 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO subscriptions (id, subscriber_tenant_id, plan_id, status, started_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'ACTIVE', $4, NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [crypto.randomUUID(), tenant.id, plan.id, startDate]
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
      `INSERT INTO leads (id, company_name, contact_name, email, phone, status, source, created_at, updated_at)
       VALUES ($1, $2, $3, $4, '11-99999-1000', $5, 'WEBSITE', NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [crypto.randomUUID(), `Company ${i}`, name, `lead${i}@test.com`, statuses[i % statuses.length]]
    );
  }

  console.log(`   ✓ Created 25 leads`);
}

async function seedInvoicesAndPayments(tenants) {
  const now = new Date();
  const statuses = ['PAID', 'PAID', 'PAID', 'OPEN', 'OPEN', 'OVERDUE'];

  for (let i = 0; i < 15; i++) {
    const tenant = tenants[i % tenants.length];
    const amount = (99 + Math.random() * 900).toFixed(2);
    const status = statuses[i % statuses.length];
    const invoiceId = crypto.randomUUID();
    const issueDate = new Date(now.getTime() - Math.random() * 90 * 24 * 60 * 60 * 1000);
    const dueDate = new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO billing_invoices (id, subscriber_tenant_id, amount, currency, status, issued_at, due_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'BRL', $4, $5, $6, NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [invoiceId, tenant.id, amount, status, issueDate, dueDate]
    );

    if (status === 'PAID') {
      await pool.query(
        `INSERT INTO billing_payments (id, invoice_id, amount, currency, status, paid_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'BRL', 'SUCCESSFUL', $4, NOW(), NOW()) ON CONFLICT DO NOTHING`,
        [crypto.randomUUID(), invoiceId, amount, issueDate]
      );
    }
  }

  console.log(`   ✓ Created 15 invoices`);
}

async function verifyDemoData() {
  const queries = [
    ['Platform Users', 'SELECT COUNT(*) as count FROM platform_users'],
    ['Plans', 'SELECT COUNT(*) as count FROM plans'],
    ['Subscriber Tenants', 'SELECT COUNT(*) as count FROM subscriber_tenants'],
    ['Subscriptions', 'SELECT COUNT(*) as count FROM subscriptions'],
    ['Leads', 'SELECT COUNT(*) as count FROM leads'],
  ];

  for (const [label, sql] of queries) {
    const result = await pool.query(sql);
    console.log(`   ✓ ${label}: ${result.rows[0].count}`);
  }
}

seedPlatformData();