import { describe, expect, it } from 'vitest';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { DocumentAttachmentType } from '../../../packages/domain/types';
import {
  calculateFileHash,
  createAttachment,
  deleteAttachment,
  generateSecureFileKey,
  getAttachmentById,
  isBlockedFileName,
  listAttachments,
  MAX_ATTACHMENT_BYTES,
  validateFileSize,
  validateFileType,
} from '../src/document-attachments';
import { ValidationError } from '../src/errors';
import {
  AGENCY_A,
  AGENCY_B,
  attachmentRow,
  CONTEXT_A,
  CONTEXT_B,
  createFakeDatabase,
} from './helpers/fake-database';

function create(database: ReturnType<typeof createFakeDatabase>, overrides: {
  fileName?: string;
  fileSizeBytes?: number;
  fileMimeType?: string;
} = {}) {
  return createAttachment(
    database,
    'doc-1',
    DocumentAttachmentType.FRONT,
    overrides.fileName ?? 'passport.png',
    overrides.fileSizeBytes ?? 2048,
    overrides.fileMimeType ?? 'image/png',
    'documents/doc-1/abc.png',
  );
}

describe('validateFileType', () => {
  it.each(['image/png', 'image/jpeg', 'image/tiff', 'application/pdf'])(
    'accepts %s',
    (mimeType) => {
      expect(validateFileType(mimeType)).toBe(true);
    },
  );

  it('is case-insensitive and tolerates a charset parameter', () => {
    expect(validateFileType('IMAGE/PNG')).toBe(true);
    expect(validateFileType('application/pdf; charset=binary')).toBe(true);
  });

  it.each([
    'application/x-msdownload',
    'application/octet-stream',
    'text/html',
    'image/svg+xml',
    'application/x-sh',
  ])('rejects %s', (mimeType) => {
    expect(validateFileType(mimeType)).toBe(false);
  });

  it('rejects null, undefined and non-string input', () => {
    expect(validateFileType(null)).toBe(false);
    expect(validateFileType(undefined)).toBe(false);
    expect(validateFileType('')).toBe(false);
  });
});

describe('isBlockedFileName', () => {
  it.each([
    'payload.exe', 'run.bat', 'script.sh', 'legacy.com', 'installer.msi',
    'lib.dll', 'app.jar', 'x.ps1', 'shell.php', 'page.html', 'icon.svg',
  ])('blocks %s', (fileName) => {
    expect(isBlockedFileName(fileName)).toBe(true);
  });

  it('blocks a double extension whose final segment is executable', () => {
    expect(isBlockedFileName('passport.png.exe')).toBe(true);
  });

  it('blocks a file with no extension at all', () => {
    expect(isBlockedFileName('passport')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isBlockedFileName('PAYLOAD.EXE')).toBe(true);
  });

  it('allows genuine document scans', () => {
    expect(isBlockedFileName('passport.png')).toBe(false);
    expect(isBlockedFileName('rg-frente.jpg')).toBe(false);
    expect(isBlockedFileName('visa.pdf')).toBe(false);
  });

  it('blocks null and undefined', () => {
    expect(isBlockedFileName(null)).toBe(true);
    expect(isBlockedFileName(undefined)).toBe(true);
  });
});

describe('validateFileSize', () => {
  it('accepts sizes within the 20 MB ceiling', () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(20 * 1024 * 1024);
    expect(validateFileSize(1)).toBe(true);
    expect(validateFileSize(MAX_ATTACHMENT_BYTES)).toBe(true);
  });

  it('rejects an oversized file', () => {
    expect(validateFileSize(MAX_ATTACHMENT_BYTES + 1)).toBe(false);
  });

  it('rejects zero, negative and non-integer sizes', () => {
    expect(validateFileSize(0)).toBe(false);
    expect(validateFileSize(-1)).toBe(false);
    expect(validateFileSize(1.5)).toBe(false);
    expect(validateFileSize(Number.NaN)).toBe(false);
  });
});

describe('generateSecureFileKey', () => {
  it('never embeds the caller filename', () => {
    const key = generateSecureFileKey('doc-1', 'my secret passport scan.png');

    expect(key).not.toContain('secret');
    expect(key).not.toContain('passport');
  });

  it('produces a distinct key for every call', () => {
    const keys = new Set(
      Array.from({ length: 50 }, () => generateSecureFileKey('doc-1', 'a.png')),
    );

    expect(keys.size).toBe(50);
  });

  it('strips path traversal from the filename and the document id', () => {
    const key = generateSecureFileKey('../../etc', '../../../etc/passwd.png');

    expect(key).not.toContain('..');
    expect(key.split('/')).toHaveLength(3);
  });

  it('keeps a short safe extension for content-type purposes', () => {
    expect(generateSecureFileKey('doc-1', 'scan.png').endsWith('.png')).toBe(true);
    expect(generateSecureFileKey('doc-1', 'scan.pdf').endsWith('.pdf')).toBe(true);
  });

  it('drops an implausible extension rather than trusting it', () => {
    const key = generateSecureFileKey('doc-1', 'scan.thisisnotanextension');

    expect(key).not.toContain('thisisnotanextension');
  });

  it('is always scoped under the document prefix', () => {
    expect(generateSecureFileKey('doc-1', 'a.png').startsWith('documents/doc-1/')).toBe(true);
  });
});

describe('calculateFileHash', () => {
  it('returns a stable SHA-256 hex digest', () => {
    const hash = calculateFileHash('hello');

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(calculateFileHash('hello')).toBe(hash);
  });

  it('differs for different content', () => {
    expect(calculateFileHash('a')).not.toBe(calculateFileHash('b'));
  });
});

describe('document attachments -- creation', () => {
  it('fails closed when no tenant context is established', async () => {
    const database = createFakeDatabase();

    await expect(create(database)).rejects.toThrow();
    await expect(listAttachments(database, 'doc-1')).rejects.toThrow();
    await expect(deleteAttachment(database, 'att-1')).rejects.toThrow();
  });

  it('binds the caller own agency id on every statement', async () => {
    const database = createFakeDatabase(() => [attachmentRow()]);

    await runWithTenantContext(CONTEXT_A, async () => {
      await create(database);
      await listAttachments(database, 'doc-1');
      await getAttachmentById(database, 'att-1');
      await deleteAttachment(database, 'att-1');
    });

    for (const query of database.find('document_attachments')) {
      expect(query.values[0]).toBe(AGENCY_A);
      expect(query.values).not.toContain(AGENCY_B);
    }
  });

  it('scopes list reads to the calling tenant', async () => {
    const database = createFakeDatabase(() => []);

    await runWithTenantContext(CONTEXT_B, () => listAttachments(database, 'doc-1'));

    expect(database.findOne('SELECT').values[0]).toBe(AGENCY_B);
  });

  it('stores metadata only -- no blob column is written', async () => {
    const database = createFakeDatabase(() => [attachmentRow()]);

    await runWithTenantContext(CONTEXT_A, () => create(database));

    const insert = database.findOne('INSERT INTO document_attachments');
    expect(insert.text).not.toMatch(/\bcontent\b|\bblob\b|\bbytes\b|\bfile_data\b/i);
    expect(insert.text).toContain('secure_file_key');
  });

  it('rejects a blocked executable filename before writing anything', async () => {
    const database = createFakeDatabase(() => [attachmentRow()]);

    await expect(
      runWithTenantContext(CONTEXT_A, () => create(database, { fileName: 'payload.exe' })),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(database.queries).toHaveLength(0);
  });

  it('rejects a disallowed MIME type', async () => {
    const database = createFakeDatabase(() => [attachmentRow()]);

    await expect(
      runWithTenantContext(CONTEXT_A, () =>
        create(database, { fileMimeType: 'application/octet-stream' }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(database.queries).toHaveLength(0);
  });

  it('rejects an executable masquerading as an image by MIME type', async () => {
    const database = createFakeDatabase(() => [attachmentRow()]);

    await expect(
      runWithTenantContext(CONTEXT_A, () =>
        create(database, { fileName: 'evil.exe', fileMimeType: 'image/png' }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an oversized file', async () => {
    const database = createFakeDatabase(() => [attachmentRow()]);

    await expect(
      runWithTenantContext(CONTEXT_A, () =>
        create(database, { fileSizeBytes: MAX_ATTACHMENT_BYTES + 1 }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(database.queries).toHaveLength(0);
  });

  it('rejects an unknown attachment type', async () => {
    const database = createFakeDatabase(() => [attachmentRow()]);

    await expect(
      runWithTenantContext(CONTEXT_A, () =>
        createAttachment(
          database,
          'doc-1',
          'SELFIE' as DocumentAttachmentType,
          'a.png',
          10,
          'image/png',
          'documents/doc-1/x',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('persists an optional file hash when supplied', async () => {
    const database = createFakeDatabase(() => [attachmentRow({ file_hash: 'abc' })]);

    const attachment = await runWithTenantContext(CONTEXT_A, () =>
      createAttachment(
        database,
        'doc-1',
        DocumentAttachmentType.FRONT,
        'a.png',
        10,
        'image/png',
        'documents/doc-1/x',
        { fileHash: 'abc' },
      ),
    );

    expect(attachment.fileHash).toBe('abc');
  });
});

describe('document attachments -- reads and soft delete', () => {
  it('lists only non-deleted attachments', async () => {
    const database = createFakeDatabase(() => [attachmentRow()]);

    await runWithTenantContext(CONTEXT_A, () => listAttachments(database, 'doc-1'));

    expect(database.findOne('SELECT').text).toContain('deleted_at IS NULL');
  });

  it('maps rows onto camelCase domain objects', async () => {
    const database = createFakeDatabase(() => [attachmentRow()]);

    const attachment = await runWithTenantContext(CONTEXT_A, () =>
      getAttachmentById(database, 'att-1'),
    );

    expect(attachment).toMatchObject({
      id: 'att-1',
      documentId: 'doc-1',
      attachmentType: DocumentAttachmentType.FRONT,
      fileName: 'passport.png',
      fileSizeBytes: 2048,
      fileMimeType: 'image/png',
    });
    expect(attachment).not.toHaveProperty('fileHash');
  });

  it('stamps deleted_at rather than removing the metadata row', async () => {
    const database = createFakeDatabase(() => [attachmentRow({ deleted_at: '2026-08-29' })]);

    const attachment = await runWithTenantContext(CONTEXT_A, () =>
      deleteAttachment(database, 'att-1'),
    );

    expect(database.find('DELETE FROM')).toHaveLength(0);
    expect(attachment?.deletedAt).toBeInstanceOf(Date);
  });

  it('returns null when the attachment was already deleted', async () => {
    const database = createFakeDatabase(() => []);

    await expect(
      runWithTenantContext(CONTEXT_A, () => deleteAttachment(database, 'att-1')),
    ).resolves.toBeNull();
  });
});

describe('document attachments -- audit trail', () => {
  it('records an upload event without leaking the secure file key', async () => {
    const database = createFakeDatabase(() => [attachmentRow()]);

    await runWithTenantContext(CONTEXT_A, () => create(database));

    const audit = database.findOne('document_audit_events');
    const serialized = JSON.stringify(audit.values);
    expect(audit.values).toContain('ATTACHMENT_UPLOADED');
    expect(serialized).not.toContain('documents/doc-1/abc.png');
    expect(serialized).toContain('image/png');
  });

  it('records a delete event referencing both document and attachment', async () => {
    const database = createFakeDatabase(() => [attachmentRow({ deleted_at: '2026-08-29' })]);

    await runWithTenantContext(CONTEXT_A, () => deleteAttachment(database, 'att-1'));

    const audit = database.findOne('document_audit_events');
    expect(audit.values).toContain('ATTACHMENT_DELETED');
    expect(audit.values).toContain('doc-1');
    expect(audit.values).toContain('att-1');
  });

  it('records nothing when the delete found no row', async () => {
    const database = createFakeDatabase(() => []);

    await runWithTenantContext(CONTEXT_A, () => deleteAttachment(database, 'att-1'));

    expect(database.find('document_audit_events')).toHaveLength(0);
  });
});
