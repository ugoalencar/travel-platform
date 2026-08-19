import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

interface ApiPackageJson {
  scripts?: Record<string, string>;
}

describe('API package scripts for local manual testing', () => {
  it('defines official dev, start, and local database bootstrap scripts', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'),
    ) as ApiPackageJson;

    expect(packageJson.scripts?.dev).toBe('node scripts/start-local-api.cjs');
    expect(packageJson.scripts?.start).toBe('node dist/services/api/src/server.js');
    expect(packageJson.scripts?.['dev:db']).toBe('node scripts/bootstrap-local-db.cjs');
  });

  it('blocks the local dev launcher in production mode', () => {
    const result = spawnSync(
      process.execPath,
      [resolve(import.meta.dirname, '../scripts/start-local-api.cjs')],
      {
        cwd: resolve(import.meta.dirname, '..'),
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_ENV: 'production',
          ALLOW_DEV_AUTH: 'true',
        },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing to run the local API dev server');
  });
});
