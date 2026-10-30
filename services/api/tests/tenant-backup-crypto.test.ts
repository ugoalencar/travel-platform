import { describe, expect, it } from 'vitest';
import {
  canonicalTableHash,
  decryptBackup,
  encryptBackup,
  type BackupPlaintext,
} from '../src/tenant-backup-crypto';

const agency = '10000000-0000-4000-8000-000000000001';
const other = '20000000-0000-4000-8000-000000000001';
const password = 'uma senha longa e unica 123';

const plaintext = (): BackupPlaintext => ({
  format: 'travel-platform-tenant-operations-v1',
  agencyId: agency,
  createdAt: '2026-10-24T12:00:00.000Z',
  schemaVersion: '109',
  manifest: [{ table: 'customers', rows: 1, sha256: canonicalTableHash([{ id: 'c1', name: 'Ana' }]) }],
  tables: { customers: [{ id: 'c1', name: 'Ana' }] },
});

describe('tenant backup envelope (AES-256-GCM + scrypt, AAD = agency)', () => {
  it('round-trips with the right password and agency', async () => {
    const envelope = await encryptBackup(plaintext(), password);
    expect(envelope).toMatchObject({ format: 'travel-platform-encrypted-v1', agencyId: agency, algorithm: 'aes-256-gcm', kdf: 'scrypt' });
    expect(envelope.kdfParams).toMatchObject({ N: 131072, r: 8, p: 1 });
    expect(await decryptBackup(envelope, password, agency)).toEqual(plaintext());
  });

  it('never repeats salt or iv and never contains the plaintext', async () => {
    const [a, b] = await Promise.all([encryptBackup(plaintext(), password), encryptBackup(plaintext(), password)]);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(JSON.stringify(a)).not.toContain('Ana');
  });

  it('fails with a wrong password, a tampered tag, truncated data, or another agency (AAD)', async () => {
    const envelope = await encryptBackup(plaintext(), password);
    await expect(decryptBackup(envelope, 'outra senha completamente diferente', agency)).rejects.toThrow();
    const tag = Buffer.from(envelope.tag, 'base64');
    tag[0] = (tag[0] ?? 0) ^ 0xff;
    await expect(decryptBackup({ ...envelope, tag: tag.toString('base64') }, password, agency)).rejects.toThrow();
    await expect(decryptBackup({ ...envelope, data: envelope.data.slice(0, -8) }, password, agency)).rejects.toThrow();
    await expect(decryptBackup(envelope, password, other)).rejects.toThrow();
  });

  it('refuses a foreign format (a Lite file is never accepted) and a malformed envelope', async () => {
    const envelope = await encryptBackup(plaintext(), password);
    await expect(decryptBackup({ ...envelope, format: 'travel-lite-encrypted-v1' } as never, password, agency)).rejects.toThrow(/format/i);
    await expect(decryptBackup({ ...envelope, algorithm: 'aes-128-cbc' } as never, password, agency)).rejects.toThrow();
    await expect(decryptBackup(null as never, password, agency)).rejects.toThrow();
  });

  it('bounds the KDF parameters read from the file (no resource exhaustion by a crafted file)', async () => {
    const envelope = await encryptBackup(plaintext(), password);
    await expect(decryptBackup({ ...envelope, kdfParams: { N: 2 ** 30, r: 8, p: 1 } }, password, agency)).rejects.toThrow(/kdf/i);
    await expect(decryptBackup({ ...envelope, kdfParams: { N: 1000, r: 8, p: 1 } }, password, agency)).rejects.toThrow(/kdf/i);
  });

  it('rejects a payload whose agency differs from the envelope even with the right key', async () => {
    const bad = { ...plaintext(), agencyId: other };
    const envelope = await encryptBackup(bad, password);
    // envelope.agencyId comes from the plaintext; reading it as `agency` must fail on the plaintext check
    await expect(decryptBackup({ ...envelope, agencyId: agency }, password, agency)).rejects.toThrow();
  });
});

describe('canonicalTableHash', () => {
  it('is stable for the same rows in any order and any key order, and changes with the content', () => {
    const a = canonicalTableHash([{ id: '1', name: 'A' }, { id: '2', name: 'B' }]);
    const b = canonicalTableHash([{ name: 'B', id: '2' }, { name: 'A', id: '1' }]);
    expect(a).toBe(b);
    expect(canonicalTableHash([{ id: '1', name: 'A' }, { id: '2', name: 'C' }])).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
