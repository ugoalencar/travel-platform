/**
 * Storage facade selected by STORAGE_PROVIDER.
 *
 * Callers (document attachments, trip photos, Media Library, proposals)
 * import saveFile/readFile from here -- never from file-storage.ts or
 * supabase-storage.ts directly -- so the backing store can be swapped by
 * configuration alone. The provider is resolved lazily (same pattern as
 * file-storage.ts's uploadsDir) so tests can set process.env before the
 * first call without controlling import order.
 *
 * Production configuration is fail-closed via validateProductionEnvironment
 * (env.ts): STORAGE_PROVIDER must be set explicitly, and a "local" provider
 * requires an explicit UPLOADS_DIR (volume mount point) -- there is no
 * silent default to ./uploads inside an ephemeral container.
 */
import {
  readFile as readLocalFile,
  saveFile as saveLocalFile,
} from './file-storage';
import {
  readFile as readSupabaseFile,
  saveFile as saveSupabaseFile,
} from './supabase-storage';

export type StorageProvider = 'local' | 'supabase';

const SUPPORTED_PROVIDERS: readonly StorageProvider[] = ['local', 'supabase'];

/**
 * Resolves STORAGE_PROVIDER from the environment. Missing/blank defaults to
 * 'local' outside production (dev/test keep working with no config);
 * validateProductionEnvironment independently refuses a missing value in
 * production before this default can ever apply to a prod boot.
 */
export function resolveStorageProvider(
  environment: NodeJS.ProcessEnv = process.env,
): StorageProvider {
  const raw = environment.STORAGE_PROVIDER?.trim().toLowerCase();
  if (raw === undefined || raw === '') {
    return 'local';
  }
  if ((SUPPORTED_PROVIDERS as readonly string[]).includes(raw)) {
    return raw as StorageProvider;
  }
  throw new Error(
    `Invalid STORAGE_PROVIDER "${environment.STORAGE_PROVIDER}". Supported values: ${SUPPORTED_PROVIDERS.join(', ')}.`,
  );
}

function adapter() {
  return resolveStorageProvider() === 'supabase'
    ? { saveFile: saveSupabaseFile, readFile: readSupabaseFile }
    : { saveFile: saveLocalFile, readFile: readLocalFile };
}

export async function saveFile(secureFileKey: string, content: Buffer): Promise<void> {
  return adapter().saveFile(secureFileKey, content);
}

export async function readFile(secureFileKey: string): Promise<Buffer> {
  return adapter().readFile(secureFileKey);
}
