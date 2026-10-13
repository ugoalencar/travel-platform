'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { runAndLog, runFromEnvironment } = require('./travel-lite-gadotti-online.cjs');
const { PEOPLE, describeFailure } = require('./travel-lite-gadotti-online.lib.cjs');

const passwords = Object.fromEntries(PEOPLE.map((person, index) => [person.email, `Unit-${index}-secret-value!`]));

test('does nothing unless provisioning is explicitly requested', async () => {
  assert.equal(await runFromEnvironment({}), null);
  assert.equal(await runFromEnvironment({ DATABASE_URL: 'postgres://x', TRAVEL_LITE_GADOTTI_PASSWORDS_JSON: '{}' }), null);
});

test('refuses without the tenant confirmation, database or valid secret', async () => {
  const base = { TRAVEL_LITE_GADOTTI_PROVISION: 'apply' };
  await assert.rejects(runFromEnvironment(base), /tenant confirmation missing/);
  const confirmed = { ...base, TRAVEL_LITE_ONLINE_PROVISION_CONFIRM: 'gadotti' };
  await assert.rejects(runFromEnvironment(confirmed), /DATABASE_URL is required/);
  await assert.rejects(
    runFromEnvironment({ ...confirmed, DATABASE_URL: 'postgres://u:p@h/db', TRAVEL_LITE_GADOTTI_PASSWORDS_JSON: '{"a":"b"}' }),
    /exactly one password/,
  );
  await assert.rejects(runFromEnvironment({ ...base, TRAVEL_LITE_GADOTTI_PROVISION: 'sure' }), /unknown provisioning mode/);
});

test('logged failures never contain secrets, URLs or e-mail addresses', async () => {
  const lines = [];
  const original = console.error;
  console.error = (line) => lines.push(String(line));
  try {
    const ok = await runAndLog({
      TRAVEL_LITE_GADOTTI_PROVISION: 'dry-run',
      TRAVEL_LITE_ONLINE_PROVISION_CONFIRM: 'gadotti',
      DATABASE_URL: 'postgres://user:dbsecret@127.0.0.1:1/none',
      TRAVEL_LITE_GADOTTI_PASSWORDS_JSON: JSON.stringify(passwords),
    });
    assert.equal(ok, false);
  } finally {
    console.error = original;
  }
  const printed = lines.join('\n');
  assert.match(printed, /^\[gadotti-provision\] (refused|failed)/);
  for (const secret of [...Object.values(passwords), 'dbsecret', '127.0.0.1', '@']) {
    assert.ok(!printed.includes(secret), 'log line leaked a sensitive value');
  }
  assert.match(describeFailure(Object.assign(new Error('row (a@b.c)'), { code: '23505' })), /^failed \(code 23505\)$/);
});
