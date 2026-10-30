import { describe, expect, it } from 'vitest';
import {
  decryptManagedBackup,
  encryptManagedBackup,
  parseManagedBackupKeyring,
  resolveCurrentManagedBackupKey,
} from '../src/tenant-backup-managed-crypto';
import { BACKUP_FORMAT, type BackupPlaintext } from '../src/tenant-backup-crypto';

const agencyId = '10000000-0000-4000-8000-000000000001';
const otherAgencyId = '20000000-0000-4000-8000-000000000001';
const key = Buffer.alloc(32, 7);
const plaintext: BackupPlaintext = {
  format: BACKUP_FORMAT,
  agencyId,
  createdAt: '2026-10-28T12:00:00.000Z',
  schemaVersion: 'test-schema',
  manifest: [],
  tables: {},
};

describe('managed tenant backup envelope', () => {
  it('round-trips with an explicit versioned server key and agency binding', () => {
    const envelope = encryptManagedBackup(plaintext, { keyVersion: 'v1', key });

    expect(envelope).toMatchObject({
      format: 'travel-platform-managed-backup-v1',
      agencyId,
      algorithm: 'aes-256-gcm',
      keyVersion: 'v1',
    });
    expect(decryptManagedBackup(envelope, { v1: key }, agencyId)).toEqual(plaintext);
  });

  it('uses a fresh IV and contains no plaintext data', () => {
    const first = encryptManagedBackup(plaintext, { keyVersion: 'v1', key });
    const second = encryptManagedBackup(plaintext, { keyVersion: 'v1', key });

    expect(first.iv).not.toBe(second.iv);
    expect(JSON.stringify(first)).not.toContain('test-schema');
  });

  it('rejects another agency, missing key versions, tampered tags and malformed envelopes', () => {
    const envelope = encryptManagedBackup(plaintext, { keyVersion: 'v1', key });

    expect(() => decryptManagedBackup(envelope, { v1: key }, otherAgencyId)).toThrow();
    expect(() => decryptManagedBackup(envelope, { v2: key }, agencyId)).toThrow(/key version/i);
    expect(() => decryptManagedBackup({ ...envelope, tag: Buffer.alloc(16).toString('base64') }, { v1: key }, agencyId)).toThrow();
    expect(() => decryptManagedBackup({ ...envelope, format: 'unknown' } as never, { v1: key }, agencyId)).toThrow(/format/i);
  });
});

describe('managed backup keyring configuration', () => {
  it('parses a versioned JSON keyring and rejects missing, malformed or weak keys', () => {
    const encoded = key.toString('base64');
    expect(parseManagedBackupKeyring(JSON.stringify({ v1: encoded }))).toEqual({ v1: key });
    expect(() => parseManagedBackupKeyring(undefined)).toThrow(/not configured/i);
    expect(() => parseManagedBackupKeyring('{invalid')).toThrow(/invalid/i);
    expect(() => parseManagedBackupKeyring(JSON.stringify({ v1: Buffer.alloc(16).toString('base64') }))).toThrow(/32 bytes/i);
    expect(() => parseManagedBackupKeyring(JSON.stringify({ 'bad version': encoded }))).toThrow(/version/i);
    const keyring = parseManagedBackupKeyring(JSON.stringify({ v1: encoded }));
    expect(resolveCurrentManagedBackupKey(keyring, 'v1')).toEqual({ keyVersion: 'v1', key });
    expect(() => resolveCurrentManagedBackupKey(keyring, undefined)).toThrow(/not configured/i);
    expect(() => resolveCurrentManagedBackupKey(keyring, 'v2')).toThrow(/unavailable/i);
  });
});
