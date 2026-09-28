#!/usr/bin/env node
// ============================================================
// OPERATIONAL (not a migration): one-time bootstrap of the FIRST
// PLATFORM_OWNER in platform_users.
// ============================================================
// Production window step (docs/release/REMOTE_MIGRATION_RUNBOOK_084_095.md,
// G6): run only AFTER travel_app_platform exists (T2) and 095 is applied (T3).
//
// Reuses the application's own password hashing (scrypt, compiled
// services/api/dist/.../password-hashing.js) and the platform_user_audit
// trail used by platform-local-auth.ts. Credentials never go into SQL files,
// argv, stdout or logs.
//
// Required env:
//   PLATFORM_DATABASE_URL    connection as travel_app_platform (never postgres/runtime)
//   PLATFORM_OWNER_EMAIL     login e-mail (stored lower-cased and trimmed)
//   PLATFORM_OWNER_PASSWORD  initial password (>= 16 chars); or pass
//                            --password-stdin and pipe it on stdin
// Flags:
//   --confirm-production     required when the database host is not local
//
// Guarantees:
//   - refuses if ANY PLATFORM_OWNER already exists (one-time only)
//   - refuses if the e-mail already exists (case-insensitive)
//   - creates exactly one row: role PLATFORM_OWNER, status ACTIVE,
//     mfa_enabled=false, mfa_secret NULL (MFA is enrolled by the owner at the
//     first login through /platform-auth/mfa/enroll + /enroll/confirm)
//   - writes platform_user_audit action PLATFORM_OWNER_BOOTSTRAPPED
//   - never prints the password or the hash
// Build first if dist is missing: npm run build -w @travel-platform/api
// ============================================================
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { URL } = require('node:url');

const HASHING_MODULE = path.resolve(
  __dirname,
  '../../services/api/dist/services/api/src/password-hashing.js',
);
const MIN_PASSWORD_LENGTH = 16;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal']);

function fail(message) {
  console.error(`bootstrap_platform_owner: ${message}`);
  process.exit(1);
}

function maskEmail(email) {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}

async function readPassword(args) {
  if (!args.includes('--password-stdin')) {
    return process.env.PLATFORM_OWNER_PASSWORD ?? '';
  }
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

async function main() {
  const args = process.argv.slice(2);

  const rawUrl = process.env.PLATFORM_DATABASE_URL;
  if (!rawUrl) fail('PLATFORM_DATABASE_URL is required.');
  let dbUrl;
  try {
    dbUrl = new URL(rawUrl);
  } catch {
    fail('PLATFORM_DATABASE_URL is not a valid URL.');
  }
  const dbUser = decodeURIComponent(dbUrl.username);
  if (!/^travel_app_platform(_local)?(\.|$)/.test(dbUser)) {
    fail(`must connect as the platform role (travel_app_platform), got "${dbUser.split('.')[0]}".`);
  }
  const isLocal = LOCAL_HOSTS.has(dbUrl.hostname) || dbUrl.hostname.startsWith('127.');
  if (!isLocal && !args.includes('--confirm-production')) {
    fail(`remote host ${dbUrl.hostname}: re-run with --confirm-production.`);
  }

  const email = (process.env.PLATFORM_OWNER_EMAIL ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('PLATFORM_OWNER_EMAIL is missing or invalid.');

  const password = await readPassword(args);
  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`password must have at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password.toLowerCase().includes(email.split('@')[0])) {
    fail('password must not contain the e-mail local part.');
  }

  if (!fs.existsSync(HASHING_MODULE)) {
    fail('compiled password hashing not found; run: npm run build -w @travel-platform/api');
  }
  const { hashPassword, verifyPassword } = require(HASHING_MODULE);
  const passwordHash = await hashPassword(password);
  if (!(await verifyPassword(password, passwordHash))) fail('hash self-check failed.');

  const { Client } = require(require.resolve('pg', { paths: [path.resolve(__dirname, '../../services/api')] }));
  const client = new Client({ connectionString: rawUrl, connectionTimeoutMillis: 15000 });
  await client.connect();
  try {
    const role = await client.query(
      'SELECT current_user AS u, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
    );
    const r = role.rows[0];
    if (!r || r.rolsuper || r.rolbypassrls || !/^travel_app_platform(_local)?$/.test(r.u)) {
      fail('connected role is not a safe platform role (NOSUPERUSER/NOBYPASSRLS travel_app_platform).');
    }

    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('bootstrap_platform_owner'))");
    const owners = await client.query(
      `SELECT count(*)::int AS n FROM platform_users WHERE role = 'PLATFORM_OWNER'`,
    );
    if (owners.rows[0].n > 0) {
      await client.query('ROLLBACK');
      fail(`a PLATFORM_OWNER already exists (${owners.rows[0].n}); this bootstrap is one-time only.`);
    }
    const taken = await client.query('SELECT 1 FROM platform_users WHERE lower(email) = $1', [email]);
    if (taken.rowCount > 0) {
      await client.query('ROLLBACK');
      fail('e-mail already registered in platform_users.');
    }
    const inserted = await client.query(
      `INSERT INTO platform_users (email, password_hash, role, status, mfa_enabled, mfa_secret)
       VALUES ($1, $2, 'PLATFORM_OWNER', 'ACTIVE', false, NULL)
       RETURNING id`,
      [email, passwordHash],
    );
    const id = inserted.rows[0].id;
    await client.query(
      `INSERT INTO platform_user_audit (platform_user_id, action, details) VALUES ($1, $2, $3::jsonb)`,
      [id, 'PLATFORM_OWNER_BOOTSTRAPPED', JSON.stringify({ method: 'infrastructure/ops/bootstrap_platform_owner.cjs', mfa: 'pending_enrollment' })],
    );
    await client.query('COMMIT');
    console.log(`PLATFORM_OWNER created: id=${id} email=${maskEmail(email)} status=ACTIVE mfa_enabled=false`);
    console.log('Next: first login -> POST /platform-auth/mfa/enroll -> POST /platform-auth/mfa/enroll/confirm.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    fail(String(error && error.message ? error.message : error).replace(/postgres(ql)?:\/\/\S+/g, '***'));
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => fail(String(error && error.message ? error.message : error)));
