#!/usr/bin/env node
/**
 * Script de reset da demo - restaura o banco local para um estado limpo.
 * 
 * Uso: npm run demo:reset
 * 
 * Executa:
 * 1. Verifica o ambiente local/dev (recusa produção)
 * 2. Reseta o banco de dados
 * 3. Aplica todas as migrations
 * 4. Popula dados de demonstração
 * 5. Verifica os registros esperados
 */

const { spawnSync } = require('node:child_process');
const { Pool } = require('pg');
const { resolve } = require('node:path');
const { URL } = require('node:url');
const { existsSync, readFileSync } = require('node:fs');

const repoRoot = resolve(__dirname, '..');

// Carrega .env.local se existir
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
  console.log('Reset da demo - restaurando estado limpo');
  console.log('========================================\n');

  // Verifica o ambiente
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ ERRO: Não é permitido resetar o banco da demo em modo de produção.\n');
    process.exit(1);
  }

  // Verifica se é um banco local
  try {
    const url = new URL(databaseUrl);
    const isLocal = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const isDev = url.pathname.includes('test') || url.pathname.includes('dev');

    if (!isLocal || !isDev) {
      console.error('❌ ERRO: DATABASE_URL não aponta para um banco local de teste/dev.\n');
      console.error(`   URL: ${databaseUrl}\n`);
      process.exit(1);
    }
  } catch {
    console.error('❌ ERRO: DATABASE_URL inválida.\n');
    process.exit(1);
  }

  // Etapa 1: Derrubar e recriar schema
  console.log('Etapa 1/4: Resetando schema do banco de dados...\n');
  const pool = new Pool({ connectionString: databaseUrl });
  
  try {
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    console.log('✅ Reset do schema concluído.\n');
  } catch (err) {
    console.error('❌ Falha ao resetar schema:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }

  // Etapa 2: Aplicar migrations
  console.log('Etapa 2/4: Aplicando migrations...\n');
  const migrationsResult = spawnSync('node', [resolve(repoRoot, 'scripts/apply-all-migrations.cjs')], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  if (migrationsResult.status !== 0) {
    console.error('\n❌ Falha na migration.\n');
    process.exit(1);
  }

  // Etapa 3: Popular dados base da plataforma
  console.log('\nEtapa 3/6: Populando dados base da plataforma...\n');
  const seedResult = spawnSync('node', [resolve(repoRoot, 'scripts/seed-demo-data.cjs')], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  if (seedResult.status !== 0) {
    console.error('\n❌ Falha ao popular dados base.\n');
    process.exit(1);
  }

  // Etapa 4: Popular dados de demonstração da plataforma SaaS
  console.log('\nEtapa 4/6: Populando dados de demonstração da plataforma SaaS...\n');
  const platformSeedResult = spawnSync('node', [resolve(repoRoot, 'scripts/seed-platform-demo-data.cjs')], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  if (platformSeedResult.status !== 0) {
    console.error('\n❌ Falha ao popular dados da plataforma.\n');
    process.exit(1);
  }

  // Etapa 5: Popular dados completos do tenant (clientes, financeiro e histórias E2E)
  console.log('\nEtapa 5/6: Populando dados completos de demonstração do tenant...\n');
  const tenantSeedResult = spawnSync('node', [resolve(repoRoot, 'scripts/seed-tenant-demo-data.cjs')], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  if (tenantSeedResult.status !== 0) {
    console.error('\n❌ Falha ao popular dados do tenant.\n');
    process.exit(1);
  }

  // Etapa 6: Verificar
  console.log('\nEtapa 6/6: Verificando dados da demo...\n');
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

    console.log('   📊 INVENTÁRIO DO BANCO DA DEMO\n');
    console.log('   Operações do tenant:');
    console.log(`     ✅ Agências: ${agencies}`);
    console.log(`     ✅ Clientes: ${customers}`);
    console.log(`     ✅ Desejos: ${wishes}`);
    console.log(`     ✅ Viagens: ${trips}`);
    console.log(`     ✅ Ofertas: ${offers}`);
    console.log(`     ✅ Propostas: ${proposals}`);
    console.log(`     ✅ Reservas: ${bookings}`);
    console.log('\n   Financeiro:');
    console.log(`     ✅ Receitas: ${revenues}`);
    console.log(`     ✅ Despesas: ${expenses}`);
    console.log('\n   Platform SaaS:');
    console.log(`     ✅ Tenants assinantes: ${subscribers}`);
    console.log(`     ✅ Planos: ${plans}`);
    console.log(`     ✅ Assinaturas: ${subscriptions}`);
    console.log(`     ✅ Leads: ${leads}`);
    console.log(`     ✅ Casos de suporte: ${support}`);

    const allRequirementssMet =
      agencies > 0 && customers >= 15 && wishes >= 10 && trips >= 8 && offers >= 8 &&
      proposals >= 10 && bookings >= 5 && revenues >= 15 && expenses >= 10 &&
      subscribers >= 12 && plans >= 4 && subscriptions >= 20 && leads >= 25 && support >= 12;

    if (allRequirementssMet) {
      console.log('\n========================================');
      console.log('✅ RESET DA DEMO CONCLUÍDO');
      console.log('Banco populado com dados realistas de demonstração');
      console.log('pronto para demonstração local.');
      console.log('========================================\n');
      process.exit(0);
    } else {
      console.error('\n⚠️  Aviso de verificação: alguns alvos de dados não foram atingidos.\n');
      console.error('   Mínimos esperados:');
      console.error('   - clientes >= 15 (obtido ' + customers + ')');
      console.error('   - desejos >= 10 (obtido ' + wishes + ')');
      console.error('   - viagens >= 8 (obtido ' + trips + ')');
      console.error('   - ofertas >= 8 (obtido ' + offers + ')');
      console.error('   - propostas >= 10 (obtido ' + proposals + ')');
      console.error('   - receitas >= 15 (obtido ' + revenues + ')');
      console.error('   - despesas >= 10 (obtido ' + expenses + ')');
      console.error('\n   (Continuando mesmo assim — a demo está utilizável, mas mínima)\n');
      process.exit(0);
    }
  } catch (err) {
    console.error('❌ Falha na verificação:', err.message);
    process.exit(1);
  } finally {
    await verifyPool.end();
  }
}

main().catch((err) => {
  console.error('❌ Erro inesperado:', err.message);
  process.exit(1);
});
