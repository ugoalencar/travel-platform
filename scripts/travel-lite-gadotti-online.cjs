#!/usr/bin/env node
'use strict';

/**
 * One-off Gadotti provisioning, run by the Render container at start-up.
 *
 *   TRAVEL_LITE_GADOTTI_PROVISION=dry-run|apply   (unset => does nothing)
 *   TRAVEL_LITE_ONLINE_PROVISION_CONFIRM=gadotti
 *   TRAVEL_LITE_GADOTTI_PASSWORDS_JSON=<secret>
 *   DATABASE_URL (already set on the service)
 *
 * Failures are logged without data and never stop the application.
 */

const { describeFailure, parsePasswordsJson, provisionGadotti, ProvisionRefusal } = require('./travel-lite-gadotti-online.lib.cjs');

const OVERALL_TIMEOUT_MS = 60_000;

async function runFromEnvironment(env = process.env) {
  const mode = env.TRAVEL_LITE_GADOTTI_PROVISION;
  if (!mode) return null;
  if (mode !== 'dry-run' && mode !== 'apply') throw new ProvisionRefusal('unknown provisioning mode');
  if (env.TRAVEL_LITE_ONLINE_PROVISION_CONFIRM !== 'gadotti') throw new ProvisionRefusal('tenant confirmation missing');
  if (!env.DATABASE_URL) throw new ProvisionRefusal('DATABASE_URL is required');
  const passwords = parsePasswordsJson(env.TRAVEL_LITE_GADOTTI_PASSWORDS_JSON);

  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10_000 });
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new ProvisionRefusal('provisioning timed out')), OVERALL_TIMEOUT_MS);
    });
    return await Promise.race([provisionGadotti(pool, passwords, { apply: mode === 'apply' }), timeout]);
  } finally {
    clearTimeout(timer);
    await pool.end().catch(() => undefined);
  }
}

async function runAndLog(env = process.env) {
  try {
    const summary = await runFromEnvironment(env);
    if (summary) console.log(`[gadotti-provision] ${JSON.stringify(summary)}`);
    return true;
  } catch (error) {
    console.error(`[gadotti-provision] ${describeFailure(error)}`);
    return false;
  }
}

if (require.main === module) {
  runAndLog().then((ok) => {
    process.exitCode = ok ? 0 : 1;
  });
}

module.exports = { runAndLog, runFromEnvironment };
