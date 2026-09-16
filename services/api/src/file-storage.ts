/**
 * Local-disk object-store adapter for document attachments.
 *
 * document-attachments.ts's own header says the design intent exactly:
 * "The database stores metadata only... bytes live in whatever object
 * store the deployment configures, addressed exclusively by a
 * secureFileKey this module mints." No such object store was ever
 * implemented anywhere in the codebase (confirmed by a full grep) --
 * this is that adapter, for local/staging use where no cloud storage
 * (S3/GCS) is provisioned. A production deployment can swap this for a
 * real object-store client without touching any caller: every function
 * here takes/returns exactly a `secureFileKey` and bytes, same contract
 * a cloud adapter would have.
 *
 * secureFileKey already looks like `documents/<documentId>/<uuid>.<ext>`
 * (generateSecureFileKey()) -- never derived from a client-controlled
 * filename -- so it's safe to use directly as a relative path under
 * UPLOADS_DIR with no further sanitization needed beyond the defensive
 * traversal check below.
 */

import { mkdir, readFile as fsReadFile, writeFile as fsWriteFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';

// Read lazily (not at module load) so tests can point this at a temp
// directory via process.env.UPLOADS_DIR before the first call, rather
// than needing to control import order.
function uploadsDir(): string {
  return resolve(process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads'));
}

function resolveSafePath(secureFileKey: string): string {
  const base = uploadsDir();
  const target = resolve(base, normalize(secureFileKey));
  if (!target.startsWith(base)) {
    throw new Error('Invalid secureFileKey: resolves outside the uploads directory');
  }
  return target;
}

export async function saveFile(secureFileKey: string, content: Buffer): Promise<void> {
  const path = resolveSafePath(secureFileKey);
  await mkdir(dirname(path), { recursive: true });
  await fsWriteFile(path, content);
}

export async function readFile(secureFileKey: string): Promise<Buffer> {
  return fsReadFile(resolveSafePath(secureFileKey));
}
