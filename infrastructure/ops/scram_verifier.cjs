#!/usr/bin/env node
// ============================================================
// OPERATIONAL: compute a PostgreSQL SCRAM-SHA-256 password verifier locally.
// ============================================================
// Production logs DDL (log_statement = ddl), so `CREATE/ALTER ROLE ...
// PASSWORD '<plaintext>'` would write the password into the Supabase logs.
// PostgreSQL accepts a pre-computed verifier instead; only the verifier
// (a salted hash) ever reaches the server and its logs.
//
// Usage (password on stdin, verifier on stdout; nothing else is printed):
//   printf '%s' "$PASSWORD" | node infrastructure/ops/scram_verifier.cjs
//
// Format (RFC 5802/7677, same as PostgreSQL's pg_be_scram_build_secret):
//   SCRAM-SHA-256$<iterations>:<salt b64>$<StoredKey b64>:<ServerKey b64>
// Only printable ASCII passwords are accepted, so SASLprep is the identity.
// ============================================================
'use strict';

const crypto = require('node:crypto');

const ITERATIONS = 4096;
const SALT_BYTES = 16;
const MIN_LENGTH = 16;

function fail(message) {
  process.stderr.write(`scram_verifier: ${message}\n`);
  process.exit(1);
}

function buildVerifier(password, salt, iterations) {
  const salted = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const clientKey = crypto.createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = crypto.createHash('sha256').update(clientKey).digest();
  const serverKey = crypto.createHmac('sha256', salted).update('Server Key').digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

async function main() {
  if (process.stdin.isTTY) fail('pipe the password on stdin (it is never read from argv).');
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const password = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');

  if (password.length < MIN_LENGTH) fail(`password must have at least ${MIN_LENGTH} characters.`);
  if (!/^[\x21-\x7e]+$/.test(password)) fail('password must be printable ASCII without spaces.');

  process.stdout.write(buildVerifier(password, crypto.randomBytes(SALT_BYTES), ITERATIONS));
}

main().catch((error) => fail(String(error && error.message ? error.message : error)));
