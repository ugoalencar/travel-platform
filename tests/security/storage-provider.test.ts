import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resolveStorageProvider,
  saveFile,
  readFile,
} from '../../services/api/src/storage';

vi.mock('../../services/api/src/file-storage', () => ({
  saveFile: vi.fn(() => Promise.resolve()),
  readFile: vi.fn(() => Promise.resolve(Buffer.from('local'))),
}));

vi.mock('../../services/api/src/supabase-storage', () => ({
  saveFile: vi.fn(() => Promise.resolve()),
  readFile: vi.fn(() => Promise.resolve(Buffer.from('supabase'))),
}));

async function loadMocks() {
  const local = await import('../../services/api/src/file-storage');
  const supabase = await import('../../services/api/src/supabase-storage');
  return {
    local: local as unknown as { saveFile: ReturnType<typeof vi.fn>; readFile: ReturnType<typeof vi.fn> },
    supabase: supabase as unknown as {
      saveFile: ReturnType<typeof vi.fn>;
      readFile: ReturnType<typeof vi.fn>;
    },
  };
}

const originalProvider = process.env.STORAGE_PROVIDER;

afterEach(() => {
  if (originalProvider === undefined) {
    delete process.env.STORAGE_PROVIDER;
  } else {
    process.env.STORAGE_PROVIDER = originalProvider;
  }
  vi.clearAllMocks();
});

describe('F-05: STORAGE_PROVIDER resolution', () => {
  it('defaults to local when unset (dev/test convenience only)', () => {
    delete process.env.STORAGE_PROVIDER;
    expect(resolveStorageProvider({})).toBe('local');
    expect(resolveStorageProvider({ STORAGE_PROVIDER: '' })).toBe('local');
    expect(resolveStorageProvider({ STORAGE_PROVIDER: '   ' })).toBe('local');
  });

  it('accepts local and supabase case-insensitively', () => {
    expect(resolveStorageProvider({ STORAGE_PROVIDER: 'local' })).toBe('local');
    expect(resolveStorageProvider({ STORAGE_PROVIDER: 'LOCAL' })).toBe('local');
    expect(resolveStorageProvider({ STORAGE_PROVIDER: 'supabase' })).toBe('supabase');
    expect(resolveStorageProvider({ STORAGE_PROVIDER: 'SUPABASE' })).toBe('supabase');
  });

  it('throws on unsupported providers (no silent fallback)', () => {
    expect(() => resolveStorageProvider({ STORAGE_PROVIDER: 's3' })).toThrow(
      /Invalid STORAGE_PROVIDER "s3"/
    );
    expect(() => resolveStorageProvider({ STORAGE_PROVIDER: 'disk' })).toThrow(
      /Invalid STORAGE_PROVIDER/
    );
  });

  it('routes saveFile/readFile to the local adapter when provider is local', async () => {
    const { local, supabase } = await loadMocks();
    process.env.STORAGE_PROVIDER = 'local';

    await saveFile('documents/x/y.pdf', Buffer.from('a'));
    await readFile('documents/x/y.pdf');

    expect(local.saveFile).toHaveBeenCalledWith('documents/x/y.pdf', expect.any(Buffer));
    expect(local.readFile).toHaveBeenCalledWith('documents/x/y.pdf');
    expect(supabase.saveFile).not.toHaveBeenCalled();
    expect(supabase.readFile).not.toHaveBeenCalled();
  });

  it('routes saveFile/readFile to the Supabase adapter when provider is supabase', async () => {
    const { local, supabase } = await loadMocks();
    process.env.STORAGE_PROVIDER = 'supabase';

    await saveFile('documents/x/y.pdf', Buffer.from('a'));
    const bytes = await readFile('documents/x/y.pdf');

    expect(supabase.saveFile).toHaveBeenCalledWith('documents/x/y.pdf', expect.any(Buffer));
    expect(supabase.readFile).toHaveBeenCalledWith('documents/x/y.pdf');
    expect(local.saveFile).not.toHaveBeenCalled();
    expect(local.readFile).not.toHaveBeenCalled();
    expect(bytes?.toString()).toBe('supabase');
  });

  it('fails closed (throws) instead of falling back when provider is invalid', async () => {
    process.env.STORAGE_PROVIDER = 's3';
    await expect(saveFile('documents/x/y.pdf', Buffer.from('a'))).rejects.toThrow(
      /Invalid STORAGE_PROVIDER/
    );
    await expect(readFile('documents/x/y.pdf')).rejects.toThrow(/Invalid STORAGE_PROVIDER/);
  });
});
