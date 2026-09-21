/**
 * MFA Secret Encryption at Rest
 *
 * Encrypts TOTP secrets before storing them in the database and decrypts
 * them when needed for verification. Uses AES-256-GCM (authenticated
 * encryption) to provide both confidentiality and integrity.
 *
 * The encryption key is derived from MFA_ENCRYPTION_KEY environment variable
 * using PBKDF2 with a per-secret random salt. This means:
 * - Each MFA secret has its own unique encryption key
 * - The master key never appears in the database
 * - Brute-forcing one secret doesn't compromise others
 *
 * Format of encrypted blob: base64(salt + iv + authTag + ciphertext)
 *
 * SECURITY:
 * - MFA_ENCRYPTION_KEY is a server-side secret ONLY
 * - Never exposed to the browser or logs
 * - The key should be at least 32 bytes (256 bits)
 */

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits for GCM
const SALT_LENGTH = 16; // 128 bits for PBKDF2
const PBKDF2_ITERATIONS = 100_000;
const AUTH_TAG_LENGTH = 16; // 128 bits for GCM

/**
 * Get the master encryption key from environment.
 * Throws if not configured (fail-closed).
 */
function getMasterKey(): Buffer {
  const key = process.env.MFA_ENCRYPTION_KEY?.trim();
  if (!key) {
    throw new Error(
      'MFA_ENCRYPTION_KEY is required for MFA secret encryption. ' +
        'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  if (key.length < 32) {
    throw new Error(
      'MFA_ENCRYPTION_KEY must be at least 32 characters (256 bits).'
    );
  }
  return Buffer.from(key, 'utf-8');
}

/**
 * Derive an encryption key from the master key and salt using PBKDF2.
 */
function deriveKey(masterKey: Buffer, salt: Buffer): Buffer {
  return pbkdf2Sync(masterKey, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt a plaintext TOTP secret.
 *
 * @param plaintext - The base32 TOTP secret to encrypt
 * @returns Base64-encoded encrypted blob (salt + iv + authTag + ciphertext)
 */
export function encryptMfaSecret(plaintext: string): string {
  const masterKey = getMasterKey();
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(masterKey, salt);

  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Pack: salt (16) + iv (16) + authTag (16) + ciphertext (variable)
  const packed = Buffer.concat([salt, iv, authTag, encrypted]);
  return packed.toString('base64');
}

/**
 * Decrypt an encrypted TOTP secret.
 *
 * @param encryptedBase64 - Base64-encoded encrypted blob from encryptMfaSecret()
 * @returns The original base32 TOTP secret
 */
export function decryptMfaSecret(encryptedBase64: string): string {
  const masterKey = getMasterKey();
  const packed = Buffer.from(encryptedBase64, 'base64');

  // Minimum size: salt (16) + iv (16) + authTag (16) + at least 1 byte ciphertext
  if (packed.length < SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('Invalid MFA encrypted secret: too short');
  }

  const salt = packed.subarray(0, SALT_LENGTH);
  const iv = packed.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = packed.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

  const key = deriveKey(masterKey, salt);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf-8');
}

/**
 * Check if a stored secret appears to be encrypted (base64 blob)
 * or plaintext (base32 string). This is used for migration detection:
 * if secrets are still plaintext, we encrypt them on first access.
 */
export function isMfaSecretEncrypted(stored: string): boolean {
  // Encrypted secrets are base64 and longer than typical base32 secrets
  // A 32-byte TOTP secret in base32 is 52 chars (with padding)
  // An encrypted blob is much longer (salt + iv + tag + ciphertext = 64+ bytes)
  try {
    const decoded = Buffer.from(stored, 'base64');
    // Must be valid base64 AND have minimum encrypted blob size
    return decoded.length >= SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH + 1;
  } catch {
    return false;
  }
}
