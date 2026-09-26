// Fail-closed guard for local dev/demo/seed scripts: they must never reach a
// remote (e.g. Supabase production) database, even when a production
// DATABASE_URL is exported in the shell. Mirrors
// services/api/src/env.ts#validateNonProductionDatabaseTargets, which guards
// the API server boot itself; these scripts run as plain Node outside the
// TypeScript build, so they need their own copy of the rule.
'use strict';

const { URL } = require('node:url');

const DATABASE_URL_VARIABLES = ['DATABASE_URL', 'DATABASE_ADMIN_URL', 'PLATFORM_DATABASE_URL'];

// Loopback, or a single-label hostname (docker-compose service names such
// as `db` / `postgres-staging`). Any dotted, non-loopback host -- including
// every *.supabase.co / *.supabase.com pooler -- is treated as remote.
function isLocalDatabaseHost(hostname) {
  const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === '::1' || host === 'host.docker.internal') return true;
  if (/^127(\.\d{1,3}){3}$/.test(host)) return true;
  return host.length > 0 && !host.includes('.') && !host.includes(':');
}

function describeTarget(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`;
  } catch {
    return '(URL invalida)';
  }
}

function findRemoteDatabaseTargets(environment) {
  const problems = [];
  for (const name of DATABASE_URL_VARIABLES) {
    const value = environment[name];
    if (typeof value !== 'string' || value.trim() === '') continue;
    let hostname;
    try {
      hostname = new URL(value.trim()).hostname;
    } catch {
      problems.push(`${name}: URL invalida`);
      continue;
    }
    if (!isLocalDatabaseHost(hostname)) {
      problems.push(`${name}: host remoto ${describeTarget(value)}`);
    }
  }
  return problems;
}

// Exits the process (never returns) when any DB URL points outside the
// local machine / docker network, or when NODE_ENV=production. Prints only
// host:port, never credentials.
function assertLocalDatabaseTargets(scriptName, environment = process.env) {
  const problems = [];
  if (environment.NODE_ENV === 'production') {
    problems.push('NODE_ENV=production');
  }
  problems.push(...findRemoteDatabaseTargets(environment));
  if (problems.length === 0) return;
  console.error(`Recusando executar ${scriptName}: este script so pode usar banco local.`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('Aponte DATABASE_URL (e DATABASE_ADMIN_URL/PLATFORM_DATABASE_URL, se definidas) para localhost.');
  process.exit(1);
}

module.exports = { assertLocalDatabaseTargets, findRemoteDatabaseTargets, isLocalDatabaseHost };
