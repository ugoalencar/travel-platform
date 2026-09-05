#!/usr/bin/env node
/**
 * Script de orquestração da demo - inicia todos os serviços para apresentação.
 * 
 * Uso: npm run demo
 * 
 * Inicia nesta ordem:
 * 1. Verifica o ambiente local (somente modo dev)
 * 2. Inicializa/verifica o PostgreSQL
 * 3. Aplica migrations
 * 4. Popula dados de demonstração
 * 5. Inicia a API (porta 4000)
 * 6. Inicia o portal da agência (porta 5173)
 * 7. Inicia o portal do cliente (porta 5176)
 */

const { spawn, spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

const repoRoot = resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

console.log('\n========================================');
console.log('Travel Platform - Orquestração da demo');
console.log('========================================\n');

// Verifica o ambiente
if (process.env.NODE_ENV === 'production') {
  console.error('\n❌ ERRO: Não é permitido executar a demo em modo de produção.');
  console.error('   Defina NODE_ENV=development e tente novamente.\n');
  process.exit(1);
}

// Etapa 1: Inicializar banco de dados
console.log('Etapa 1/5: Inicializando PostgreSQL local...\n');
const bootstrapResult = spawnSync(npmCommand, ['run', 'dev:db'], {
  cwd: resolve(repoRoot, 'services/api'),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (bootstrapResult.status !== 0) {
  console.error('\n❌ Falha ao inicializar o banco de dados. Encerrando.\n');
  process.exit(1);
}

// Etapa 1b: Reset schema so migrations apply to a clean database.
// `dev:db` above already applies migrations 001/002 and seeds manual-testing
// fixtures for API-only workflows; the full demo needs a clean schema before
// re-applying every migration from scratch (matches demo-reset.cjs's flow).
console.log('\nEtapa 1b/5: Resetando schema do banco para aplicar todas as migrations...\n');
const schemaResetResult = spawnSync(
  'node',
  ['-e', "require('pg'); const { Pool } = require('pg'); const pool = new Pool({ connectionString: process.env.DATABASE_URL }); pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;').then(() => pool.end()).catch((err) => { console.error(err.message); process.exitCode = 1; return pool.end(); });"],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://travel_test:travel_test_password@127.0.0.1:55432/travel_platform_test',
    },
  },
);

if (schemaResetResult.status !== 0) {
  console.error('\n❌ Falha ao resetar o schema. Encerrando.\n');
  process.exit(1);
}

// Etapa 2: Aplicar migrations
console.log('\nEtapa 2/5: Aplicando migrations...\n');
const migrationsResult = spawnSync('node', [resolve(repoRoot, 'scripts/apply-all-migrations.cjs')], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://travel_test:travel_test_password@127.0.0.1:55432/travel_platform_test',
  },
});

if (migrationsResult.status !== 0) {
  console.error('\n❌ Falha ao aplicar migrations. Encerrando.\n');
  process.exit(1);
}

// Etapa 3: Popular dados de demonstração do tenant
console.log('\nEtapa 3/6: Populando dados de demonstração do tenant...\n');
const seedResult = spawnSync('node', [resolve(repoRoot, 'scripts/seed-demo-data.cjs')], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://travel_test:travel_test_password@127.0.0.1:55432/travel_platform_test',
  },
});

if (seedResult.status !== 0) {
  console.error('\n❌ Falha ao popular dados de demonstração do tenant. Encerrando.\n');
  process.exit(1);
}

// Etapa 4: Popular dados de demonstração da plataforma SaaS
console.log('\nEtapa 4/6: Populando dados de demonstração da plataforma SaaS...\n');
const platformSeedResult = spawnSync('node', [resolve(repoRoot, 'scripts/seed-platform-demo-data.cjs')], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://travel_test:travel_test_password@127.0.0.1:55432/travel_platform_test',
  },
});

if (platformSeedResult.status !== 0) {
  console.error('\n❌ Falha ao popular dados de demonstração da plataforma SaaS. Encerrando.\n');
  process.exit(1);
}

// Etapas 5-9: Iniciar serviços
console.log('\nEtapa 5/9: Iniciando servidor da API (porta 4000)...\n');
console.log('Etapa 6/9: Iniciando portal da agência (porta 5173)...\n');
console.log('Etapa 7/9: Iniciando portal do cliente (porta 5176)...\n');
console.log('Etapa 8/9: Iniciando app de marketing (porta 5175)...\n');
console.log('Etapa 9/9: Iniciando admin da plataforma (porta 5174)...\n');

console.log('========================================');
console.log('✅ DEMO PRONTA - Os 5 serviços estão iniciando...');
console.log('========================================\n');
console.log('Servidor da API: http://127.0.0.1:4000\n');
console.log('Apps:');
console.log('  Portal da agência:     http://localhost:5173');
console.log('  Portal do cliente:     http://localhost:5176');
console.log('  App de marketing:      http://localhost:5175');
console.log('  Admin da plataforma:   http://localhost:5174\n');
console.log('Pressione Ctrl+C para parar todos os serviços.\n');

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
  console.log('\n\nEncerrando serviços...');
  [apiServer, agencyPortal, customerPortal, marketingApp, platformAdminApp].forEach((proc) => {
    if (!proc.killed) proc.kill(signal || 'SIGTERM');
  });
};

process.on('SIGINT', () => handleExit('SIGINT'));
process.on('SIGTERM', () => handleExit('SIGTERM'));

[apiServer, agencyPortal, customerPortal, marketingApp, platformAdminApp].forEach((proc) => {
  proc.on('exit', (code) => {
    if (code !== 0) {
      console.error(`Processo encerrado com código ${code}`);
    }
  });
});
