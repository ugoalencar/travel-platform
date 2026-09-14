/**
 * Local password hashing (Pilot Delivery Gap Closure -- Agent 02/Identity).
 *
 * Uses Node's built-in scrypt (RFC 7914) rather than adding a new
 * dependency (bcrypt/argon2) -- the codebase already leans on node:crypto
 * everywhere else (see mfa-provider.ts, production-auth.ts). scrypt is
 * memory-hard and a sound choice for password storage.
 *
 * Stored format: `scrypt$N$r$p$<saltHex>$<hashHex>` -- self-describing so
 * the cost parameters can be tuned later without breaking verification of
 * passwords hashed under the old parameters.
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const SCRYPT_N = 16384; // CPU/memory cost (2^14)
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

function scrypt(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await scrypt(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltHex = parts[4];
  const hashHex = parts[5];

  if (
    !Number.isInteger(n) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    !saltHex ||
    !hashHex
  ) {
    return false;
  }

  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');

  let derivedKey: Buffer;
  try {
    derivedKey = await scrypt(password, salt, expected.length, { N: n, r, p });
  } catch {
    return false;
  }

  if (derivedKey.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(derivedKey, expected);
}

/** A password_hash value no real password will ever match -- used for
 * invitation rows before the invitee sets a real password, and to avoid
 * user-enumeration timing differences (verify against this when the
 * looked-up user/email does not exist, so the response time is the same
 * either way). */
export function unusablePasswordHash(): string {
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${randomBytes(SALT_LENGTH).toString('hex')}$${randomBytes(KEY_LENGTH).toString('hex')}`;
}
