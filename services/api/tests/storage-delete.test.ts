import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteStoredFileAfterCommit, saveFile } from '../src/storage';

// Local provider (STORAGE_PROVIDER unset outside production) in a throwaway
// UPLOADS_DIR. The Supabase provider shares the contract: remove() of a
// missing object is not an error.
describe('deleteStoredFileAfterCommit', () => {
  let uploadsDir: string;
  const log = { warn: vi.fn() };

  beforeEach(() => {
    uploadsDir = mkdtempSync(join(tmpdir(), 'travel-platform-storage-delete-'));
    process.env.UPLOADS_DIR = uploadsDir;
    delete process.env.STORAGE_PROVIDER;
    log.warn.mockReset();
  });

  afterEach(() => {
    rmSync(uploadsDir, { recursive: true, force: true });
    delete process.env.UPLOADS_DIR;
  });

  it('removes the stored object', async () => {
    await saveFile('media-assets/agency-a/asset.png', Buffer.from('x'));

    const removed = await deleteStoredFileAfterCommit('media-assets/agency-a/asset.png', log, { type: 'media_asset', id: 'a1' });

    expect(removed).toBe(true);
    expect(existsSync(join(uploadsDir, 'media-assets/agency-a/asset.png'))).toBe(false);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('is idempotent: deleting an object that is already gone is not an error', async () => {
    const removed = await deleteStoredFileAfterCommit('documents/doc-1/missing.pdf', log, { type: 'document_attachment', id: 'd1' });

    expect(removed).toBe(true);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('never throws on a storage failure: logs the orphan without the object key', async () => {
    const removed = await deleteStoredFileAfterCommit('trip-photos/../../../escape.png', log, { type: 'trip_photo', id: 'p1' });

    expect(removed).toBe(false);
    expect(log.warn).toHaveBeenCalledTimes(1);
    const [fields, message] = log.warn.mock.calls[0] as [Record<string, unknown>, string];
    expect(message).toBe('Stored object could not be deleted (orphaned)');
    expect(fields).toMatchObject({ bucket: 'trip-photos', entityType: 'trip_photo', entityId: 'p1' });
    expect(JSON.stringify(fields)).not.toContain('escape.png');
  });
});
