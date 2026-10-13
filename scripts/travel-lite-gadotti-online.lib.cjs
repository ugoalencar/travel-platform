'use strict';

/**
 * Gadotti initial provisioning for the online Travel Lite database.
 *
 * Rules enforced here (see docs/travel-lite/GADOTTI-ONLINE-PROVISION.md):
 *  - every statement runs inside one transaction with the tenant context set
 *    (RLS is FORCEd on users/sellers/user_permissions/audit_logs);
 *  - the database and tenant identity are verified before any write;
 *  - one completion marker in audit_logs makes the routine run-once, so a
 *    restart never re-applies restrictions after Patricia edited permissions;
 *  - audit rows have no acting user (user_id NULL, source in metadata): the
 *    routine never attributes its work to an employee or to Patricia;
 *  - nothing returned or thrown for logging contains passwords, hashes,
 *    e-mail addresses or database error text.
 */

const { randomBytes, scrypt } = require('node:crypto');

const EXPECTED_DATABASE = 'travel_lite';
const TENANT = { name: 'B&B GADOTTI VIAGENS LTDA', slug: 'gadotti' };
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 200;
const MARKER_EVENT = 'GADOTTI_PROVISION_COMPLETED';
const SOURCE = 'travel-lite-gadotti-online';
const REQUIRED_MIGRATION_PREFIXES = ['001_', '002_', '003_', '004_', '005_', '006_', '007_'];

const PEOPLE = [
  { name: 'Patricia Voltolini', email: 'patricia.voltolini@gadottijoinville.com.br', role: 'MASTER' },
  { name: 'Nykaya Korine Koch Agostinho de Farias', email: 'turismo@gadottijoinville.com.br', role: 'SELLER' },
  { name: 'Rafaela Teixeira Martins', email: 'joinville@gadotti.com.br', role: 'SELLER' },
  { name: 'Letícia Cristtine Santana', email: 'gadottijoinville2@gmail.com', role: 'SELLER' },
  { name: 'Andrielle Rodrigues Dell Agnolo', email: 'vendas@gadottijoinville.com.br', role: 'SELLER' },
];

const SELLER_PERMISSIONS = [
  'customers.create',
  'customers.read_own',
  'customers.update_own',
  'sales.create',
  'sales.read_own',
  'sales.update_own',
];

/** A refusal whose message is safe to print (written by this module only). */
class ProvisionRefusal extends Error {}

// ---------------------------------------------------------------- passwords

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new ProvisionRefusal(`temporary passwords must have ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters`);
  }
  return password;
}

function validatePasswordSet(passwords) {
  if (!passwords || Array.isArray(passwords) || typeof passwords !== 'object') {
    throw new ProvisionRefusal('passwords must be an object keyed by e-mail');
  }
  const expected = PEOPLE.map((person) => person.email).sort();
  const actual = Object.keys(passwords).sort();
  if (actual.length !== expected.length || actual.some((email, index) => email !== expected[index])) {
    throw new ProvisionRefusal('exactly one password for each configured identity is required');
  }
  const values = Object.values(passwords).map(validatePassword);
  if (new Set(values).size !== values.length) throw new ProvisionRefusal('temporary passwords must be unique');
  return passwords;
}

function parsePasswordsJson(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') throw new ProvisionRefusal('the passwords secret is empty');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ProvisionRefusal('the passwords secret is not valid JSON');
  }
  return validatePasswordSet(parsed);
}

/**
 * Reads the private credentials table (| Nome | Usuario | Senha |) and
 * returns { email: password }. Names and e-mails must match PEOPLE exactly.
 */
function parseCredentialsDocument(markdown) {
  const passwords = {};
  for (const line of String(markdown).split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
    if (cells.length !== 3) continue;
    const person = PEOPLE.find((entry) => entry.email === cells[1]);
    if (!person) continue;
    if (person.name !== cells[0]) throw new ProvisionRefusal('credentials document name does not match an identity');
    if (cells[2] === '') continue;
    if (passwords[person.email] !== undefined) throw new ProvisionRefusal('credentials document repeats an identity');
    passwords[person.email] = cells[2];
  }
  return validatePasswordSet(passwords);
}

function hashPassword(password) {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, key) => {
      if (error) reject(error);
      else resolve(`scrypt$16384$8$1$${salt.toString('hex')}$${key.toString('hex')}`);
    });
  });
}

// ------------------------------------------------------------- permissions

/** Same resolution as services/api-lite/src/access.ts effectivePermissions. */
async function effectivePermissions(client, tenantId, userId, role) {
  const result = await client.query(
    `SELECT p.key
       FROM permissions p
       JOIN roles r ON r.key = $3
      WHERE r.grants_all
         OR (EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role = r.key AND rp.permission = p.key)
             AND NOT EXISTS (SELECT 1 FROM user_permissions up
                              WHERE up.tenant_id = $1 AND up.user_id = $2
                                AND up.permission = p.key AND up.effect = 'REVOKE'))
         OR EXISTS (SELECT 1 FROM user_permissions up
                     WHERE up.tenant_id = $1 AND up.user_id = $2
                       AND up.permission = p.key AND up.effect = 'GRANT')
      ORDER BY p.key`,
    [tenantId, userId, role],
  );
  return result.rows.map((row) => row.key);
}

/**
 * Makes the seller's overrides produce exactly SELLER_PERMISSIONS:
 * REVOKE every role default outside the list, drop GRANTs outside the list,
 * and make sure each listed permission is available. Returns change counts.
 */
async function enforceSellerPermissions(client, tenantId, userId, catalog, roleDefaults) {
  const allowed = new Set(SELLER_PERMISSIONS);
  const missing = SELLER_PERMISSIONS.filter((key) => !catalog.includes(key));
  if (missing.length > 0) throw new ProvisionRefusal('permission catalog is missing a seller permission');

  const counts = { revoked: 0, grantedDropped: 0, granted: 0, revokeLifted: 0 };
  const existing = await client.query(
    'SELECT permission, effect FROM user_permissions WHERE tenant_id = $1 AND user_id = $2',
    [tenantId, userId],
  );
  const overrides = new Map(existing.rows.map((row) => [row.permission, row.effect]));

  for (const key of catalog) {
    const current = overrides.get(key);
    if (allowed.has(key)) {
      if (current === 'REVOKE') {
        await client.query(
          'DELETE FROM user_permissions WHERE tenant_id = $1 AND user_id = $2 AND permission = $3',
          [tenantId, userId, key],
        );
        counts.revokeLifted += 1;
      }
      if (!roleDefaults.has(key) && current !== 'GRANT') {
        await client.query(
          `INSERT INTO user_permissions (tenant_id, user_id, permission, effect, granted_by)
           VALUES ($1, $2, $3, 'GRANT', NULL)
           ON CONFLICT (tenant_id, user_id, permission) DO UPDATE SET effect = 'GRANT', granted_by = NULL`,
          [tenantId, userId, key],
        );
        counts.granted += 1;
      }
      continue;
    }
    if (current === 'GRANT') {
      await client.query(
        'DELETE FROM user_permissions WHERE tenant_id = $1 AND user_id = $2 AND permission = $3',
        [tenantId, userId, key],
      );
      counts.grantedDropped += 1;
    }
    if (roleDefaults.has(key) && current !== 'REVOKE') {
      await client.query(
        `INSERT INTO user_permissions (tenant_id, user_id, permission, effect, granted_by)
         VALUES ($1, $2, $3, 'REVOKE', NULL)
         ON CONFLICT (tenant_id, user_id, permission) DO UPDATE SET effect = 'REVOKE', granted_by = NULL`,
        [tenantId, userId, key],
      );
      counts.revoked += 1;
    }
  }
  return counts;
}

// --------------------------------------------------------------- audit rows

async function audit(client, tenantId, eventType, entityType, entityId, metadata) {
  await client.query(
    `INSERT INTO audit_logs (tenant_id, user_id, event_type, entity_type, entity_id, metadata)
     VALUES ($1, NULL, $2, $3, $4, $5::jsonb)`,
    [tenantId, eventType, entityType, entityId, JSON.stringify({ source: SOURCE, ...metadata })],
  );
}

// ----------------------------------------------------------------- identity

async function assertTarget(client, expectedDatabase) {
  const identity = await client.query(
    `SELECT current_database() AS database,
            (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypasses_rls`,
  );
  if (identity.rows[0].database !== expectedDatabase) throw new ProvisionRefusal('unexpected database');
  if (identity.rows[0].bypasses_rls) throw new ProvisionRefusal('database role bypasses row level security');

  const migrations = await client.query('SELECT name FROM migrations');
  const names = migrations.rows.map((row) => row.name);
  for (const prefix of REQUIRED_MIGRATION_PREFIXES) {
    if (!names.some((name) => name.startsWith(prefix))) throw new ProvisionRefusal('unexpected schema version');
  }

  const tenants = await client.query('SELECT id, name, status FROM tenants WHERE slug = $1', [TENANT.slug]);
  if (tenants.rowCount !== 1) throw new ProvisionRefusal('tenant gadotti not found');
  const tenant = tenants.rows[0];
  if (tenant.name !== TENANT.name) throw new ProvisionRefusal('tenant gadotti has an unexpected name');
  if (tenant.status !== 'ACTIVE') throw new ProvisionRefusal('tenant gadotti is not ACTIVE');
  return tenant.id;
}

async function loadUser(client, tenantId, person) {
  const found = await client.query(
    'SELECT id, name, role, status FROM users WHERE tenant_id = $1 AND email = $2 FOR UPDATE',
    [tenantId, person.email],
  );
  if (found.rowCount > 1) throw new ProvisionRefusal('duplicate user e-mail');
  if (found.rowCount === 0) return null;
  const user = found.rows[0];
  if (user.name !== person.name) throw new ProvisionRefusal('existing user has a different name');
  if (user.status !== 'ACTIVE') throw new ProvisionRefusal('existing user is not ACTIVE');
  if (user.role !== person.role) throw new ProvisionRefusal('existing user has a different role');
  return user;
}

/**
 * The seller row of a person: the one already linked to the user, otherwise
 * an unlinked one with the same e-mail AND name (another seller may share the
 * e-mail). Creates it only when nothing matches.
 */
async function ensureSeller(client, tenantId, person, userId) {
  const linked = await client.query(
    'SELECT id, name, user_id FROM sellers WHERE tenant_id = $1 AND user_id = $2 FOR UPDATE',
    [tenantId, userId],
  );
  if (linked.rowCount > 1) throw new ProvisionRefusal('user is linked to more than one seller');
  if (linked.rowCount === 1) return { id: linked.rows[0].id, created: false, linkedNow: false };

  const candidates = await client.query(
    `SELECT id, user_id FROM sellers
      WHERE tenant_id = $1 AND email = $2 AND name = $3 FOR UPDATE`,
    [tenantId, person.email, person.name],
  );
  if (candidates.rowCount > 1) throw new ProvisionRefusal('ambiguous seller for a person');
  if (candidates.rowCount === 1) {
    const candidate = candidates.rows[0];
    if (candidate.user_id && candidate.user_id !== userId) {
      throw new ProvisionRefusal('seller is already linked to another user');
    }
    await client.query('UPDATE sellers SET user_id = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2', [
      tenantId,
      candidate.id,
      userId,
    ]);
    return { id: candidate.id, created: false, linkedNow: true };
  }

  const inserted = await client.query(
    `INSERT INTO sellers (tenant_id, name, email, user_id, commission_rule_type)
     VALUES ($1, $2, $3, $4, 'UNDEFINED') RETURNING id`,
    [tenantId, person.name, person.email, userId],
  );
  return { id: inserted.rows[0].id, created: true, linkedNow: true };
}

async function userChoseOwnPassword(client, tenantId, userId) {
  const result = await client.query(
    `SELECT 1 FROM audit_logs
      WHERE tenant_id = $1 AND entity_type = 'user' AND entity_id = $2
        AND event_type = 'USER_REQUIRED_PASSWORD_CHANGED' LIMIT 1`,
    [tenantId, userId],
  );
  return result.rowCount > 0;
}

// -------------------------------------------------------------- orchestrator

/**
 * Runs the whole provisioning in one transaction.
 *   options.apply   false => everything is executed and then rolled back
 *   options.expectedDatabase  tests only; the online runner always uses travel_lite
 *   options.hooks   test seam: { afterUsers(), afterPermissions() }
 * Returns a summary that is safe to print.
 */
async function provisionGadotti(pool, passwordsInput, options = {}) {
  const passwords = validatePasswordSet(passwordsInput);
  const apply = options.apply === true;
  const hooks = options.hooks || {};
  const hashes = new Map();
  for (const person of PEOPLE) hashes.set(person.email, await hashPassword(passwords[person.email]));

  const client = await pool.connect();
  const summary = {
    tenant: TENANT.slug,
    mode: apply ? 'apply' : 'dry-run',
    alreadyProvisioned: false,
    users: [],
  };
  try {
    await client.query('BEGIN');
    const tenantId = await assertTarget(client, options.expectedDatabase || EXPECTED_DATABASE);
    await client.query('SELECT set_tenant_context($1, NULL)', [tenantId]);

    const marker = await client.query(
      'SELECT 1 FROM audit_logs WHERE tenant_id = $1 AND event_type = $2 LIMIT 1',
      [tenantId, MARKER_EVENT],
    );
    if (marker.rowCount > 0) {
      summary.alreadyProvisioned = true;
      await client.query('ROLLBACK');
      return summary;
    }

    const catalog = (await client.query('SELECT key FROM permissions ORDER BY key')).rows.map((row) => row.key);
    const sellerDefaults = new Set(
      (await client.query("SELECT permission FROM role_permissions WHERE role = 'SELLER'")).rows.map((row) => row.permission),
    );

    const masters = await client.query("SELECT email FROM users WHERE tenant_id = $1 AND role = 'MASTER'", [tenantId]);
    if (masters.rows.some((row) => row.email !== PEOPLE[0].email)) {
      throw new ProvisionRefusal('another MASTER exists in the tenant');
    }

    const resolved = [];
    for (const person of PEOPLE) {
      let user = await loadUser(client, tenantId, person);
      let created = false;
      if (!user) {
        const inserted = await client.query(
          `INSERT INTO users (tenant_id, name, email, password_hash, role)
           VALUES ($1, $2, $3, $4, $5) RETURNING id, name, role, status`,
          [tenantId, person.name, person.email, hashes.get(person.email), person.role],
        );
        user = inserted.rows[0];
        created = true;
        await audit(client, tenantId, 'USER_CREATED', 'user', user.id, { role: person.role });
      }

      const seller = await ensureSeller(client, tenantId, person, user.id);
      if (seller.linkedNow && !seller.created) {
        await audit(client, tenantId, 'USER_SELLER_LINKED', 'user', user.id, { seller_id: seller.id });
      }

      let password = 'unchanged';
      if (created || !(await userChoseOwnPassword(client, tenantId, user.id))) {
        if (!created) {
          await client.query('UPDATE users SET password_hash = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2', [
            tenantId,
            user.id,
            hashes.get(person.email),
          ]);
        }
        const revoked = await client.query(
          `UPDATE auth_sessions SET revoked_at = now()
            WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
          [tenantId, user.id],
        );
        await audit(client, tenantId, 'USER_PASSWORD_RESET', 'user', user.id, {
          reason: 'INITIAL_GADOTTI_PROVISION',
          revoked_sessions: revoked.rowCount,
        });
        password = 'temporary-set';
      } else {
        password = 'kept-user-owned';
      }

      resolved.push({ person, user, seller, created, password });
    }
    if (hooks.afterUsers) await hooks.afterUsers();

    for (const entry of resolved) {
      if (entry.person.role !== 'SELLER') continue;
      const counts = await enforceSellerPermissions(client, tenantId, entry.user.id, catalog, sellerDefaults);
      await audit(client, tenantId, 'USER_PERMISSIONS_CHANGED', 'user', entry.user.id, {
        reason: 'INITIAL_GADOTTI_PROVISION',
        revoked: counts.revoked,
        grants_dropped: counts.grantedDropped,
        granted: counts.granted,
        revokes_lifted: counts.revokeLifted,
      });
    }
    if (hooks.afterPermissions) await hooks.afterPermissions();

    for (const entry of resolved) {
      const effective = await effectivePermissions(client, tenantId, entry.user.id, entry.person.role);
      if (entry.person.role === 'SELLER') {
        const exact = effective.length === SELLER_PERMISSIONS.length && SELLER_PERMISSIONS.every((key) => effective.includes(key));
        if (!exact) throw new ProvisionRefusal('seller effective permissions do not match the approved set');
      } else if (effective.length !== catalog.length) {
        throw new ProvisionRefusal('MASTER does not hold the full permission catalog');
      }
      summary.users.push({
        role: entry.person.role,
        userCreated: entry.created,
        sellerCreated: entry.seller.created,
        sellerLinked: true,
        password: entry.password,
        effectivePermissions: effective.length,
      });
    }

    await audit(client, tenantId, MARKER_EVENT, 'tenant', tenantId, { users: resolved.length });
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    return summary;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Message that is safe to print for any thrown value. */
function describeFailure(error) {
  if (error instanceof ProvisionRefusal) return `refused: ${error.message}`;
  const code = error && typeof error.code === 'string' ? error.code : 'unknown';
  return `failed (code ${code})`;
}

module.exports = {
  EXPECTED_DATABASE,
  MARKER_EVENT,
  PEOPLE,
  ProvisionRefusal,
  SELLER_PERMISSIONS,
  TENANT,
  describeFailure,
  effectivePermissions,
  parseCredentialsDocument,
  parsePasswordsJson,
  provisionGadotti,
  validatePasswordSet,
};
