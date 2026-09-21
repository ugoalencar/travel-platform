/**
 * Supabase Storage adapter for document attachments and import files.
 *
 * Drops in behind the same secureFileKey interface as file-storage.ts:
 * every function takes/returns a `secureFileKey` and bytes, so callers
 * never know (or need to know) whether the backing store is local disk
 * or Supabase Storage. The adapter is selected at startup via the
 * STORAGE_PROVIDER environment variable.
 *
 * Buckets must be created manually or via Supabase Dashboard:
 *   - "documents"  (private, for customer document attachments)
 *   - "imports"    (private, for import job source files)
 *   - "internal"   (private, for platform-internal files)
 *
 * SECURITY:
 *   - Service role key is NEVER exposed to the browser.
 *   - All operations go through the backend.
 *   - Bucket policies enforce tenant isolation at the storage layer.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseStorageAdapterOptions {
  /** Supabase project URL (e.g. https://xyz.supabase.co) */
  supabaseUrl: string;
  /** Supabase service role key (server-side ONLY) */
  supabaseServiceRoleKey: string;
}

let cachedClient: SupabaseClient | undefined;

function getSupabaseClient(options: SupabaseStorageAdapterOptions): SupabaseClient {
  if (!cachedClient) {
    cachedClient = createClient(options.supabaseUrl, options.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cachedClient;
}

function resolveOptions(): SupabaseStorageAdapterOptions {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      'SupabaseStorageAdapter requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
        'to be set in the environment. These are server-side secrets only.'
    );
  }

  return { supabaseUrl, supabaseServiceRoleKey };
}

/**
 * Extract the bucket name from a secureFileKey.
 * Keys follow the pattern: "bucket/path/to/file.ext"
 */
function parseBucketAndPath(secureFileKey: string): { bucket: string; path: string } {
  const slashIndex = secureFileKey.indexOf('/');
  if (slashIndex <= 0) {
    throw new Error(
      `Invalid secureFileKey: "${secureFileKey}". Expected format: "bucket/path/to/file.ext"`
    );
  }
  return {
    bucket: secureFileKey.substring(0, slashIndex),
    path: secureFileKey.substring(slashIndex + 1),
  };
}

/**
 * Upload a file to Supabase Storage.
 *
 * @param secureFileKey - e.g. "documents/abc123/file.pdf" or "imports/xyz/data.csv"
 * @param content - file bytes
 */
export async function saveFile(secureFileKey: string, content: Buffer): Promise<void> {
  const options = resolveOptions();
  const client = getSupabaseClient(options);
  const { bucket, path } = parseBucketAndPath(secureFileKey);

  const { error } = await client.storage.from(bucket).upload(path, content, {
    contentType: detectContentType(secureFileKey),
    upsert: false,
  });

  if (error) {
    throw new Error(`Supabase Storage upload failed for "${secureFileKey}": ${error.message}`);
  }
}

/**
 * Download a file from Supabase Storage.
 *
 * @param secureFileKey - e.g. "documents/abc123/file.pdf"
 * @returns file bytes
 */
export async function readFile(secureFileKey: string): Promise<Buffer> {
  const options = resolveOptions();
  const client = getSupabaseClient(options);
  const { bucket, path } = parseBucketAndPath(secureFileKey);

  const { data, error } = await client.storage.from(bucket).download(path);

  if (error) {
    throw new Error(`Supabase Storage download failed for "${secureFileKey}": ${error.message}`);
  }

  return Buffer.from(await data.arrayBuffer());
}

/**
 * Delete a file from Supabase Storage.
 *
 * @param secureFileKey - e.g. "documents/abc123/file.pdf"
 */
export async function deleteFile(secureFileKey: string): Promise<void> {
  const options = resolveOptions();
  const client = getSupabaseClient(options);
  const { bucket, path } = parseBucketAndPath(secureFileKey);

  const { error } = await client.storage.from(bucket).remove([path]);

  if (error) {
    throw new Error(`Supabase Storage delete failed for "${secureFileKey}": ${error.message}`);
  }
}

/**
 * Check if a file exists in Supabase Storage.
 *
 * @param secureFileKey - e.g. "documents/abc123/file.pdf"
 */
export async function fileExists(secureFileKey: string): Promise<boolean> {
  const options = resolveOptions();
  const client = getSupabaseClient(options);
  const { bucket, path } = parseBucketAndPath(secureFileKey);

  // Extract directory and filename from the path
  const parts = path.split('/');
  const filename = parts.pop() ?? '';
  const directory = parts.join('/') || undefined;

  const listOptions: { search: string } = { search: filename };

  try {
    const { data, error } = await client.storage.from(bucket).list(directory, listOptions);
    if (error) return false;
    // Check if the exact file is in the listing
    return (data ?? []).some((item) => item.name === filename);
  } catch {
    return false;
  }
}

/**
 * Get a signed URL for temporary access to a private file.
 * Useful for providing time-limited download links.
 *
 * @param secureFileKey - e.g. "documents/abc123/file.pdf"
 * @param expiresIn - seconds until the URL expires (default: 3600 = 1 hour)
 */
export async function getSignedUrl(
  secureFileKey: string,
  expiresIn: number = 3600,
): Promise<string> {
  const options = resolveOptions();
  const client = getSupabaseClient(options);
  const { bucket, path } = parseBucketAndPath(secureFileKey);

  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresIn);

  if (error) {
    throw new Error(`Supabase Storage signed URL failed for "${secureFileKey}": ${error.message}`);
  }

  return data.signedUrl;
}

/**
 * Create a bucket if it doesn't exist. Idempotent.
 *
 * @param bucketName - e.g. "documents", "imports"
 */
export async function ensureBucket(bucketName: string): Promise<void> {
  const options = resolveOptions();
  const client = getSupabaseClient(options);

  const { error } = await client.storage.createBucket(bucketName, {
    public: false,
    fileSizeLimit: 50 * 1024 * 1024, // 50MB per file
    // allowedMimeTypes omitted — validation happens at the app layer
  });

  // "Bucket already exists" is not an error
  if (error && !error.message.includes('already exists')) {
    throw new Error(`Failed to create bucket "${bucketName}": ${error.message}`);
  }
}

/**
 * Simple content-type detection based on file extension.
 */
function detectContentType(secureFileKey: string): string {
  const ext = secureFileKey.split('.').pop()?.toLowerCase() ?? '';
  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    csv: 'text/csv',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    json: 'application/json',
    txt: 'text/plain',
  };
  return mimeTypes[ext] ?? 'application/octet-stream';
}
