/**
 * Encrypted envelope for the per-agency operational backup (BAK-01).
 * AES-256-GCM, key derived with scrypt, AAD binds the file to the agency, so a
 * file of agency A cannot be opened for agency B. Pure: no database, no I/O.
 * A Lite file (`travel-lite-encrypted-v1`) is refused on purpose.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt } from 'node:crypto';

export const BACKUP_FORMAT = 'travel-platform-tenant-operations-v1';
export const ENVELOPE_FORMAT = 'travel-platform-encrypted-v1';
const AAD_PREFIX = 'travel-platform-backup-v1:';

/** Default KDF cost (stronger than the Lite); the reader accepts only a bounded range. */
const DEFAULT_KDF = { N: 131072, r: 8, p: 1 } as const;
const MIN_N = 16384;
const MAX_N = 262144;
const MAX_R = 16;
const MAX_P = 4;
const SCRYPT_MAXMEM = 512 * 1024 * 1024;

export interface BackupPlaintext {
  format: typeof BACKUP_FORMAT;
  agencyId: string;
  createdAt: string;
  schemaVersion: string;
  manifest: Array<{ table: string; rows: number; sha256: string }>;
  tables: Record<string, Array<Record<string, unknown>>>;
}

export interface BackupEnvelope {
  format: typeof ENVELOPE_FORMAT;
  agencyId: string;
  algorithm: 'aes-256-gcm';
  kdf: 'scrypt';
  kdfParams: { N: number; r: number; p: number };
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

const deriveKey = (password: string, salt: Buffer, params: { N: number; r: number; p: number }): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password, salt, 32, { ...params, maxmem: SCRYPT_MAXMEM }, (error, key) => (error ? reject(error) : resolve(key)));
  });

export async function encryptBackup(plaintext: BackupPlaintext, password: string): Promise<BackupEnvelope> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(password, salt, DEFAULT_KDF);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(`${AAD_PREFIX}${plaintext.agencyId}`));
    const data = Buffer.concat([cipher.update(JSON.stringify(plaintext), 'utf8'), cipher.final()]);
    return {
      format: ENVELOPE_FORMAT,
      agencyId: plaintext.agencyId,
      algorithm: 'aes-256-gcm',
      kdf: 'scrypt',
      kdfParams: { ...DEFAULT_KDF },
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64'),
    };
  } finally {
    key.fill(0);
  }
}

export async function decryptBackup(
  envelope: BackupEnvelope,
  password: string,
  expectedAgencyId: string,
): Promise<BackupPlaintext> {
  if (!envelope || typeof envelope !== 'object') throw new Error('Invalid backup envelope');
  if (envelope.format !== ENVELOPE_FORMAT) throw new Error('Unsupported backup format');
  if (envelope.algorithm !== 'aes-256-gcm' || envelope.kdf !== 'scrypt') throw new Error('Unsupported backup algorithm');
  const { N, r, p } = envelope.kdfParams ?? ({} as BackupEnvelope['kdfParams']);
  // Bounds protect the server from a crafted file asking for absurd memory/time.
  if (![N, r, p].every(Number.isInteger) || N < MIN_N || N > MAX_N || (N & (N - 1)) !== 0 || r < 1 || r > MAX_R || p < 1 || p > MAX_P) {
    throw new Error('Invalid kdf parameters');
  }
  if (envelope.agencyId !== expectedAgencyId) throw new Error('Backup belongs to another agency');
  const key = await deriveKey(password, Buffer.from(envelope.salt, 'base64'), { N, r, p });
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(Buffer.from(`${AAD_PREFIX}${expectedAgencyId}`));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const text = Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(text) as BackupPlaintext;
    if (parsed.format !== BACKUP_FORMAT || parsed.agencyId !== expectedAgencyId) throw new Error('Backup content does not match the agency');
    return parsed;
  } finally {
    key.fill(0);
  }
}

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

/** SHA-256 of the table rows in canonical form (row order and key order do not matter). */
export function canonicalTableHash(rows: ReadonlyArray<Record<string, unknown>>): string {
  const lines = rows.map(canonical).sort();
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}
