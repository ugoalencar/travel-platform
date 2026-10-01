#!/usr/bin/env node
/**
 * Travel Lite — seed idempotente para a agência piloto (Gadotti).
 *
 * Cria/apenas completa, de forma repetível:
 *   - tenant "B&B GADOTTI VIAGENS LTDA"
 *   - categorias de venda: AÉREO, TERRESTRE, EXCURSÃO, OUTROS
 *   - métodos de pagamento, conta financeira e categorias financeiras padrão
 *   - vendedores (Patricia + equipe)
 *   - usuários/login SÓ quando TRAVEL_LITE_SEED_PASSWORD estiver definido
 *     (nenhuma senha é hardcoded neste repositório)
 *
 * Uso:
 *   $env:TRAVEL_LITE_SEED_PASSWORD = '<senha-gerada-localmente>'
 *   node scripts/travel-lite-seed-gadotti.cjs
 */
'use strict';

const { randomBytes, scrypt: scryptCallback } = require('node:crypto');
const { URL } = require('node:url');
const { Pool } = require('pg');

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', 'host.docker.internal']);

function isLocalHost(hostname) {
  const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  if (LOCAL_HOSTS.has(host)) return true;
  return host.length > 0 && !host.includes('.') && !host.includes(':');
}

function assertLocalTargets() {
  const problems = [];
  if (process.env.NODE_ENV === 'production') problems.push('NODE_ENV=production');
  for (const name of ['MIGRATIONS_DATABASE_URL', 'DATABASE_URL']) {
    const value = process.env[name];
    if (typeof value !== 'string' || value.trim() === '') continue;
    let hostname;
    try {
      hostname = new URL(value.trim()).hostname;
    } catch {
      problems.push(`${name}: invalid URL`);
      continue;
    }
    if (!isLocalHost(hostname)) problems.push(`${name}: non-local host ${hostname}`);
  }
  if (problems.length > 0) {
    console.error(`[seed-gadotti] refused to run: ${problems.join('; ')}`);
    process.exit(1);
  }
}

// scrypt local (mesmo formato do services/api/src/password-hashing.ts;
// cópia deliberada — edições separadas não compartilham código de runtime).
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

function scryptAsync(password, salt, keyLength, options) {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

async function hashPassword(password) {
  if (password.length < 8) {
    throw new Error('TRAVEL_LITE_SEED_PASSWORD must be at least 8 characters');
  }
  const salt = randomBytes(16);
  const derivedKey = await scryptAsync(password, salt, 64, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

const TENANT = {
  name: 'B&B GADOTTI VIAGENS LTDA',
  slug: 'gadotti',
};

const SALE_CATEGORIES = ['AÉREO', 'TERRESTRE', 'EXCURSÃO', 'OUTROS'];

const PAYMENT_METHODS = ['PIX', 'Dinheiro', 'Cartão de Crédito', 'Cartão de Débito', 'Boleto', 'Transferência'];

const FINANCIAL_CATEGORIES = [
  { name: 'Venda de serviços', direction: 'IN' },
  { name: 'Comissões', direction: 'OUT' },
  { name: 'Taxas', direction: 'OUT' },
  { name: 'Custos operacionais', direction: 'OUT' },
  { name: 'Fornecedores', direction: 'OUT' },
];

// Nomes e e-mails conforme docs/GadottiPati/Dados.txt.
// userRole: papel do LOGIN (usuário); o vendedor é a entidade comercial
// vinculada em sellers.user_id (Patricia = ADMIN + SELLER; demais =
// OPERATOR + SELLER).
const PEOPLE = [
  { name: 'Patricia Voltolini', email: 'patricia.voltolini@gadottijoinville.com.br', userRole: 'ADMIN' },
  {
    name: 'Nykaya Korine Koch Agostinho de Farias',
    email: 'turismo@gadottijoinville.com.br',
    userRole: 'OPERATOR',
  },
  { name: 'Rafaela Teixeira Martins', email: 'joinville@gadotti.com.br', userRole: 'OPERATOR' },
  { name: 'Letícia Cristtine Santana', email: 'gadottijoinville2@gmail.com', userRole: 'OPERATOR' },
  { name: 'Andrielle Rodrigues Dell Agnolo', email: 'vendas@gadottijoinville.com.br', userRole: 'OPERATOR' },
];

async function ensureTenant(client) {
  const inserted = await client.query(
    `INSERT INTO tenants (name, slug) VALUES ($1, $2)
     ON CONFLICT (slug) DO NOTHING
     RETURNING id`,
    [TENANT.name, TENANT.slug],
  );
  if (inserted.rows.length > 0) return { id: inserted.rows[0].id, created: true };

  const existing = await client.query('SELECT id FROM tenants WHERE slug = $1', [TENANT.slug]);
  if (existing.rows.length === 0) throw new Error('tenant slug conflict without row');
  return { id: existing.rows[0].id, created: false };
}

async function ensureRows(client, table, tenantId, names) {
  let created = 0;
  for (const name of names) {
    const result = await client.query(
      `INSERT INTO ${table} (tenant_id, name) VALUES ($1, $2)
       ON CONFLICT (tenant_id, name) DO NOTHING`,
      [tenantId, name],
    );
    created += result.rowCount;
  }
  return created;
}

async function ensureFinancialCategories(client, tenantId) {
  let created = 0;
  for (const category of FINANCIAL_CATEGORIES) {
    const result = await client.query(
      `INSERT INTO financial_categories (tenant_id, name, direction) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, name) DO NOTHING`,
      [tenantId, category.name, category.direction],
    );
    created += result.rowCount;
  }
  return created;
}

async function ensureSellers(client, tenantId) {
  let created = 0;
  for (const person of PEOPLE) {
    const existing = await client.query(
      'SELECT id FROM sellers WHERE tenant_id = $1 AND name = $2',
      [tenantId, person.name],
    );
    if (existing.rows.length === 0) {
      await client.query(
        `INSERT INTO sellers (tenant_id, name, email, commission_rule_type)
         VALUES ($1, $2, $3, 'UNDEFINED')`,
        [tenantId, person.name, person.email],
      );
      created += 1;
    }
  }
  return created;
}

async function ensureUsers(client, tenantId, password) {
  const passwordHash = await hashPassword(password);
  let created = 0;
  let linked = 0;

  for (const person of PEOPLE) {
    let userId;
    const existing = await client.query(
      'SELECT id FROM users WHERE tenant_id = $1 AND email = $2',
      [tenantId, person.email],
    );
    if (existing.rows.length > 0) {
      userId = existing.rows[0].id;
    } else {
      const inserted = await client.query(
        `INSERT INTO users (tenant_id, name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [tenantId, person.name, person.email, passwordHash, person.userRole],
      );
      userId = inserted.rows[0].id;
      created += 1;
    }

    const link = await client.query(
      `UPDATE sellers SET user_id = $3, updated_at = now()
       WHERE tenant_id = $1 AND name = $2 AND user_id IS NULL`,
      [tenantId, person.name, userId],
    );
    linked += link.rowCount;
  }

  return { created, linked };
}

async function run() {
  assertLocalTargets();

  const databaseUrl =
    process.env.MIGRATIONS_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgresql://travel_lite_admin:travel_lite_admin_password@127.0.0.1:55436/travel_lite';
  const seedPassword = process.env.TRAVEL_LITE_SEED_PASSWORD ?? process.env.TRAVEL_LITE_ADMIN_PASSWORD;

  const pool = new Pool({ connectionString: databaseUrl });
  // One dedicated connection: pool.query() could run each statement on a
  // different connection, outside the BEGIN/COMMIT.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tenant = await ensureTenant(client);
    const categories = await ensureRows(client, 'sale_categories', tenant.id, SALE_CATEGORIES);
    const methods = await ensureRows(client, 'payment_methods', tenant.id, PAYMENT_METHODS);
    const accounts = await ensureRows(client, 'financial_accounts', tenant.id, ['Caixa']);
    const finCategories = await ensureFinancialCategories(client, tenant.id);
    const sellers = await ensureSellers(client, tenant.id);

    let users = { created: 0, linked: 0 };
    if (seedPassword) {
      users = await ensureUsers(client, tenant.id, seedPassword);
    }

    await client.query('COMMIT');

    console.log('[seed-gadotti] done (idempotent)');
    console.log(`  tenant:            ${TENANT.name}${tenant.created ? ' (created)' : ' (existing)'}`);
    console.log(`  sale categories:   +${categories}`);
    console.log(`  payment methods:   +${methods}`);
    console.log(`  financial accounts:+${accounts}`);
    console.log(`  financial cats:    +${finCategories}`);
    console.log(`  sellers:           +${sellers}`);
    if (seedPassword) {
      console.log(`  users:             +${users.created} (seller links: +${users.linked})`);
    } else {
      console.log('  users:             skipped — set TRAVEL_LITE_SEED_PASSWORD to create logins');
      console.log('  (no password is hardcoded; seller rows exist and can be linked later)');
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[seed-gadotti] failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
