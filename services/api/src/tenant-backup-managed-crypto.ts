import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { BackupPlaintext } from './tenant-backup-crypto';

export const MANAGED_BACKUP_ENVELOPE_FORMAT = 'travel-platform-managed-backup-v1';
const ALGORITHM = 'aes-256-gcm' as const;
const KEY_VERSION_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export interface ManagedBackupKey {
  keyVersion: string;
  key: Buffer;
}

export interface ManagedBackupEnvelope {
  format: typeof MANAGED_BACKUP_ENVELOPE_FORMAT;
  agencyId: string;
  algorithm: typeof ALGORITHM;
  keyVersion: string;
  iv: string;
  tag: string;
  data: string;
}

export type ManagedBackupKeyring = Readonly<Record<string, Buffer>>;

export function resolveCurrentManagedBackupKey(
  keyring: ManagedBackupKeyring,
  currentKeyVersion: string | undefined,
): ManagedBackupKey {
  if (!currentKeyVersion || !KEY_VERSION_PATTERN.test(currentKeyVersion)) {
    throw new Error('Managed backup current key version is not configured.');
  }
  const key = keyring[currentKeyVersion];
  if (!key || key.length !== 32) throw new Error('Managed backup current key version is unavailable.');
  return { keyVersion: currentKeyVersion, key };
}

function aad(agencyId: string, keyVersion: string): Buffer {
  return Buffer.from(`${MANAGED_BACKUP_ENVELOPE_FORMAT}:${agencyId}:${keyVersion}`, 'utf8');
}

function validAgencyId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200;
}

export function parseManagedBackupKeyring(serialized: string | undefined): ManagedBackupKeyring {
  if (!serialized?.trim()) throw new Error('Managed backup encryption keyring is not configured.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('Managed backup keyring configuration is invalid.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Managed backup keyring configuration is invalid.');
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 8) throw new Error('Managed backup keyring configuration is invalid.');
  const keyring: Record<string, Buffer> = {};
  for (const [version, encoded] of entries) {
    if (!KEY_VERSION_PATTERN.test(version)) throw new Error('Managed backup key version is invalid.');
    if (typeof encoded !== 'string' || !BASE64_PATTERN.test(encoded)) {
      throw new Error('Managed backup encryption key is invalid.');
    }
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32) throw new Error('Managed backup encryption keys must contain exactly 32 bytes.');
    keyring[version] = key;
  }
  return keyring;
}

export function encryptManagedBackup(
  plaintext: BackupPlaintext,
  key: ManagedBackupKey,
): ManagedBackupEnvelope {
  if (!validAgencyId(plaintext.agencyId)) throw new Error('Backup agency is invalid.');
  if (!KEY_VERSION_PATTERN.test(key.keyVersion) || !Buffer.isBuffer(key.key) || key.key.length !== 32) {
    throw new Error('Managed backup encryption key is invalid.');
  }
  const iv = randomBytes(12);
  const cipherKey = Buffer.from(key.key);
  try {
    const cipher = createCipheriv(ALGORITHM, cipherKey, iv);
    cipher.setAAD(aad(plaintext.agencyId, key.keyVersion));
    const data = Buffer.concat([cipher.update(JSON.stringify(plaintext), 'utf8'), cipher.final()]);
    return {
      format: MANAGED_BACKUP_ENVELOPE_FORMAT,
      agencyId: plaintext.agencyId,
      algorithm: ALGORITHM,
      keyVersion: key.keyVersion,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64'),
    };
  } finally {
    cipherKey.fill(0);
  }
}

export function decryptManagedBackup(
  envelope: ManagedBackupEnvelope,
  keyring: ManagedBackupKeyring,
  expectedAgencyId: string,
): BackupPlaintext {
  if (!envelope || typeof envelope !== 'object' || envelope.format !== MANAGED_BACKUP_ENVELOPE_FORMAT) {
    throw new Error('Managed backup envelope format is invalid.');
  }
  if (envelope.algorithm !== ALGORITHM || !validAgencyId(expectedAgencyId) || envelope.agencyId !== expectedAgencyId) {
    throw new Error('Managed backup envelope does not match the expected agency or algorithm.');
  }
  if (!KEY_VERSION_PATTERN.test(envelope.keyVersion)) throw new Error('Managed backup key version is invalid.');
  const key = keyring[envelope.keyVersion];
  if (!key) throw new Error(`Managed backup key version "${envelope.keyVersion}" is unavailable.`);
  if (key.length !== 32 || ![envelope.iv, envelope.tag, envelope.data].every(value => typeof value === 'string' && BASE64_PATTERN.test(value))) {
    throw new Error('Managed backup envelope is malformed.');
  }
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const data = Buffer.from(envelope.data, 'base64');
  if (iv.length !== 12 || tag.length !== 16 || data.length === 0) throw new Error('Managed backup envelope is malformed.');

  const cipherKey = Buffer.from(key);
  try {
    const decipher = createDecipheriv(ALGORITHM, cipherKey, iv);
    decipher.setAAD(aad(expectedAgencyId, envelope.keyVersion));
    decipher.setAuthTag(tag);
    const serialized = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    const plaintext = JSON.parse(serialized) as BackupPlaintext;
    if (plaintext.format !== 'travel-platform-tenant-operations-v1' || plaintext.agencyId !== expectedAgencyId) {
      throw new Error('Managed backup content does not match the expected agency.');
    }
    return plaintext;
  } finally {
    cipherKey.fill(0);
  }
}
