import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import {
  DEFAULT_BRANDING,
  MAX_LOGO_BYTES,
  contrastWithWhite,
  parseBrandingUpdate,
  parseSlug,
  rowToBranding,
} from '../src/branding';
import { ValidationError } from '../src/errors';
import type { LiteDatabase } from '../src/database';

/**
 * Branding tests run without Postgres: tenant_branding is only a proposed
 * migration (docs/travel-lite/PX2-BRANDING-MIGRATION-PROPOSAL.md), so the
 * routes are exercised against a SQL-routing fake. SQL itself is verified by
 * branding-db.test.ts once the migration is approved and applied.
 */

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const MASTER_TOKEN = `v1.${TENANT_ID}.${USER_ID}.${'a'.repeat(64)}`;
const SELLER_TOKEN = `v1.${TENANT_ID}.${USER_ID}.${'b'.repeat(64)}`;

const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 2)]);
const WEBP_BYTES = Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.alloc(4, 0),
  Buffer.from('WEBP', 'latin1'),
  Buffer.alloc(16, 3),
]);

function dataUrl(mime: string, bytes: Buffer): string {
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

interface StoredRow {
  display_name: string | null;
  welcome_text: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  login_background: string | null;
  logo_mime: string | null;
  logo_data: Buffer | null;
}

interface FakeOptions {
  brandingRow?: StoredRow | null;
  tenants?: Record<string, { id: string; status: string }>;
  failBrandingRead?: boolean;
}

function createFake(options: FakeOptions = {}) {
  const state = { row: options.brandingRow ?? null };
  const calls = {
    tenantLookups: [] as unknown[][],
    brandingSelects: [] as unknown[][],
    upserts: [] as unknown[][],
    audits: [] as unknown[][],
  };

  const client = {
    query(sql: string, params: unknown[] = []) {
      if (/FROM auth_sessions/.test(sql)) {
        return Promise.resolve({
          rows: [
            {
              session_id: 'sess-1',
              expires_at: new Date(Date.now() + 3_600_000).toISOString(),
              revoked_at: null,
              role: 'MASTER',
              email: 'u@example.test',
              status: 'ACTIVE',
            },
          ],
        });
      }
      if (/FROM roles/.test(sql)) return Promise.resolve({ rows: [{ rank: 100, grants_all: false }] });
      if (/FROM permissions p/.test(sql)) {
        const grantsAll = params[2] === true;
        return Promise.resolve({
          rows: (grantsAll ? ['dashboard.configure'] : []).map((key) => ({ key })),
        });
      }
      if (/FROM sellers/.test(sql)) return Promise.resolve({ rows: [] });
      if (/FROM tenant_branding/.test(sql)) {
        calls.brandingSelects.push(params);
        if (options.failBrandingRead) return Promise.reject(new Error('relation "tenant_branding" does not exist'));
        return Promise.resolve({ rows: state.row ? [state.row] : [] });
      }
      if (/INSERT INTO tenant_branding/.test(sql)) {
        calls.upserts.push(params);
        const [, name, welcome, primary, secondary, loginBg, mime, data, , mode] = params as [
          string, string | null, string | null, string | null, string | null, string | null,
          string | null, Buffer | null, string, string,
        ];
        const previous = state.row;
        state.row = {
          display_name: name,
          welcome_text: welcome,
          primary_color: primary,
          secondary_color: secondary,
          login_background: loginBg,
          logo_mime: mode === 'keep' ? (previous?.logo_mime ?? null) : mime,
          logo_data: mode === 'keep' ? (previous?.logo_data ?? null) : data,
        };
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      if (/INSERT INTO audit_logs/.test(sql)) {
        calls.audits.push(params);
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.resolve({ rows: [] });
    },
  };

  // Role per token is decided by the test through grants_all on the role row.
  const database = {
    pool: {
      query(_sql: string, params: unknown[]) {
        calls.tenantLookups.push(params);
        const tenant = options.tenants?.[String(params[0])];
        return Promise.resolve({ rows: tenant ? [tenant] : [] });
      },
    },
    runAsTenant<T>(_tenantId: string, _userId: string | null, operation: (c: typeof client) => Promise<T>) {
      return operation(client);
    },
    withTenantTransaction<T>(operation: (c: typeof client) => Promise<T>) {
      return operation(client);
    },
    end: () => Promise.resolve(),
  };

  return { database: database as unknown as LiteDatabase, state, calls, client };
}

/** A MASTER (grants_all) or a SELLER (no dashboard.configure) behind the same fake. */
function createAppFor(role: 'MASTER' | 'SELLER', options: FakeOptions = {}) {
  const fake = createFake(options);
  const original = fake.client.query.bind(fake.client);
  fake.client.query = (sql: string, params: unknown[] = []) => {
    if (/FROM roles/.test(sql)) {
      return Promise.resolve({ rows: [{ rank: role === 'MASTER' ? 100 : 20, grants_all: role === 'MASTER' }] });
    }
    return original(sql, params);
  };
  return fake;
}

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function start(fake: ReturnType<typeof createFake>): Promise<FastifyInstance> {
  app = await buildApp({ database: fake.database });
  return app;
}

const GADOTTI_ROW: StoredRow = {
  display_name: 'Gadotti Viagens',
  welcome_text: 'Bem-vinda de volta',
  primary_color: '#1f4e8c',
  secondary_color: '#0b2545',
  login_background: '#eef3fa',
  logo_mime: 'image/png',
  logo_data: PNG_BYTES,
};

describe('branding validation', () => {
  it('accepts a complete, readable palette and normalizes the case', () => {
    const update = parseBrandingUpdate({
      displayName: '  Gadotti Viagens ',
      welcomeText: 'Olá!',
      primaryColor: '#1F4E8C',
      secondaryColor: '#0B2545',
      loginBackground: '#EEF3FA',
    });
    expect(update).toMatchObject({
      displayName: 'Gadotti Viagens',
      welcomeText: 'Olá!',
      primaryColor: '#1f4e8c',
      secondaryColor: '#0b2545',
      loginBackground: '#eef3fa',
      logo: { kind: 'keep' },
    });
  });

  it('treats empty and missing fields as "use the default"', () => {
    expect(parseBrandingUpdate({ displayName: '   ', primaryColor: '', welcomeText: null })).toMatchObject({
      displayName: null,
      welcomeText: null,
      primaryColor: null,
      secondaryColor: null,
      loginBackground: null,
    });
  });

  it.each([
    ['named color', { primaryColor: 'red' }],
    ['short hex', { primaryColor: '#fff' }],
    ['css function', { primaryColor: 'rgb(0,0,0)' }],
    ['url injection', { loginBackground: '#000000;background:url(//evil.example)' }],
    ['non-string color', { secondaryColor: 123 }],
  ])('rejects an invalid color (%s)', (_name, body) => {
    expect(() => parseBrandingUpdate(body)).toThrow(ValidationError);
  });

  it('rejects colors whose white text would be unreadable', () => {
    expect(() => parseBrandingUpdate({ primaryColor: '#f5f5f5' })).toThrow(/clara demais/);
    expect(() => parseBrandingUpdate({ secondaryColor: '#808080' })).toThrow(/clara demais/);
    expect(contrastWithWhite('#000000')).toBeGreaterThan(20);
    expect(contrastWithWhite('#ffffff')).toBeCloseTo(1, 1);
  });

  it('does not require contrast for the login background', () => {
    expect(parseBrandingUpdate({ loginBackground: '#ffffff' }).loginBackground).toBe('#ffffff');
  });

  it('bounds the text fields and refuses control characters', () => {
    expect(() => parseBrandingUpdate({ displayName: 'x'.repeat(81) })).toThrow(ValidationError);
    expect(() => parseBrandingUpdate({ welcomeText: 'x'.repeat(161) })).toThrow(ValidationError);
    expect(() => parseBrandingUpdate({ displayName: 'a\u0000b' })).toThrow(ValidationError);
    expect(() => parseBrandingUpdate({ displayName: 42 })).toThrow(ValidationError);
  });

  it('accepts PNG, JPEG and WebP logos whose bytes match the declared type', () => {
    for (const [mime, bytes] of [
      ['image/png', PNG_BYTES],
      ['image/jpeg', JPEG_BYTES],
      ['image/webp', WEBP_BYTES],
    ] as const) {
      const update = parseBrandingUpdate({ logoDataUrl: dataUrl(mime, bytes) });
      expect(update.logo).toMatchObject({ kind: 'set', mime });
    }
  });

  it('keeps, removes or replaces the logo depending on the field', () => {
    expect(parseBrandingUpdate({}).logo).toEqual({ kind: 'keep' });
    expect(parseBrandingUpdate({ logoDataUrl: null }).logo).toEqual({ kind: 'remove' });
    expect(parseBrandingUpdate({ logoDataUrl: dataUrl('image/png', PNG_BYTES) }).logo.kind).toBe('set');
  });

  it('refuses SVG, other types and malformed data URLs', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(() => parseBrandingUpdate({ logoDataUrl: dataUrl('image/svg+xml', svg) })).toThrow(ValidationError);
    expect(() => parseBrandingUpdate({ logoDataUrl: dataUrl('image/gif', Buffer.from('GIF89a'))})).toThrow(ValidationError);
    expect(() => parseBrandingUpdate({ logoDataUrl: 'https://evil.example/logo.png' })).toThrow(ValidationError);
    expect(() => parseBrandingUpdate({ logoDataUrl: 'data:image/png;base64,@@@' })).toThrow(ValidationError);
    expect(() => parseBrandingUpdate({ logoDataUrl: 42 })).toThrow(ValidationError);
  });

  it('refuses a file whose content does not match its declared type', () => {
    expect(() => parseBrandingUpdate({ logoDataUrl: dataUrl('image/png', JPEG_BYTES) })).toThrow(/não corresponde/);
    expect(() =>
      parseBrandingUpdate({ logoDataUrl: dataUrl('image/png', Buffer.from('<svg></svg> not really a png')) }),
    ).toThrow(ValidationError);
  });

  it('refuses a logo above the size limit', () => {
    const big = Buffer.concat([PNG_BYTES, Buffer.alloc(MAX_LOGO_BYTES, 1)]);
    expect(() => parseBrandingUpdate({ logoDataUrl: dataUrl('image/png', big) })).toThrow(/KB/);
  });

  it('validates slugs strictly', () => {
    expect(parseSlug(' Gadotti ')).toBe('gadotti');
    expect(parseSlug('agencia-1')).toBe('agencia-1');
    for (const bad of ['', '-x', 'a b', 'a/b', "x'--", 'A'.repeat(101), 7, null, undefined]) {
      expect(parseSlug(bad)).toBeNull();
    }
  });

  it('drops corrupted stored values instead of exposing them', () => {
    const branding = rowToBranding({
      ...GADOTTI_ROW,
      primary_color: 'url(//evil.example)',
      secondary_color: 'red',
      logo_mime: 'image/svg+xml',
    });
    expect(branding.primaryColor).toBeNull();
    expect(branding.secondaryColor).toBeNull();
    expect(branding.logoDataUrl).toBeNull();
    expect(branding.displayName).toBe('Gadotti Viagens');
    expect(rowToBranding(null)).toEqual(DEFAULT_BRANDING);
  });
});

describe('GET /branding/public', () => {
  it('serves the tenant branding resolved from the slug, without any tenant id', async () => {
    const fake = createFake({
      brandingRow: GADOTTI_ROW,
      tenants: { gadotti: { id: TENANT_ID, status: 'ACTIVE' } },
    });
    const response = await (await start(fake)).inject({ method: 'GET', url: '/api/branding/public?slug=Gadotti' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const { branding } = response.json<{ branding: Record<string, unknown> }>();
    expect(branding).toMatchObject({
      displayName: 'Gadotti Viagens',
      primaryColor: '#1f4e8c',
      logoDataUrl: dataUrl('image/png', PNG_BYTES),
    });
    expect(response.body).not.toContain(TENANT_ID);
    expect(fake.calls.tenantLookups).toEqual([['gadotti']]);
    expect(fake.calls.brandingSelects).toEqual([[TENANT_ID]]);
  });

  it('answers unknown, inactive and malformed slugs with the same default theme', async () => {
    const fake = createFake({
      brandingRow: GADOTTI_ROW,
      tenants: { parada: { id: OTHER_TENANT_ID, status: 'INACTIVE' } },
    });
    const server = await start(fake);

    for (const slug of ['nao-existe', 'parada', "x'; DROP TABLE tenants;--", '', 'A B']) {
      const response = await server.inject({ method: 'GET', url: `/api/branding/public?slug=${encodeURIComponent(slug)}` });
      expect(response.statusCode, slug).toBe(200);
      expect(response.json(), slug).toEqual({ branding: DEFAULT_BRANDING });
    }
    const noSlug = await server.inject({ method: 'GET', url: '/api/branding/public' });
    expect(noSlug.json()).toEqual({ branding: DEFAULT_BRANDING });
    // Malformed slugs never reach the database.
    expect(fake.calls.tenantLookups).toEqual([['nao-existe'], ['parada']]);
    expect(fake.calls.brandingSelects).toEqual([]);
  });

  it('ignores a tenant id sent by the client', async () => {
    const fake = createFake({
      brandingRow: GADOTTI_ROW,
      tenants: { gadotti: { id: TENANT_ID, status: 'ACTIVE' } },
    });
    await (await start(fake)).inject({
      method: 'GET',
      url: `/api/branding/public?slug=gadotti&tenantId=${OTHER_TENANT_ID}`,
      headers: { 'x-tenant-id': OTHER_TENANT_ID },
    });
    expect(fake.calls.brandingSelects).toEqual([[TENANT_ID]]);
  });

  it('falls back to the default theme when the read fails', async () => {
    const fake = createFake({
      failBrandingRead: true,
      tenants: { gadotti: { id: TENANT_ID, status: 'ACTIVE' } },
    });
    const response = await (await start(fake)).inject({ method: 'GET', url: '/api/branding/public?slug=gadotti' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ branding: DEFAULT_BRANDING });
  });

  it('works without the /api prefix as well', async () => {
    const fake = createFake({ tenants: {} });
    const response = await (await start(fake)).inject({ method: 'GET', url: '/branding/public?slug=x' });
    expect(response.statusCode).toBe(200);
  });
});

describe('GET /branding', () => {
  it('requires a session', async () => {
    const fake = createAppFor('MASTER');
    const response = await (await start(fake)).inject({ method: 'GET', url: '/api/branding' });
    expect(response.statusCode).toBe(401);
  });

  it('returns the session tenant branding to any authenticated user', async () => {
    const fake = createAppFor('SELLER', { brandingRow: GADOTTI_ROW });
    const response = await (await start(fake)).inject({
      method: 'GET',
      url: `/api/branding?tenantId=${OTHER_TENANT_ID}`,
      headers: { authorization: `Bearer ${SELLER_TOKEN}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ branding: { displayName: string } }>().branding.displayName).toBe('Gadotti Viagens');
    expect(fake.calls.brandingSelects).toEqual([[TENANT_ID]]);
  });

  it('fails closed when the read fails, so the editor never starts from a fake empty state', async () => {
    const fake = createAppFor('SELLER', { failBrandingRead: true });
    const response = await (await start(fake)).inject({
      method: 'GET',
      url: '/api/branding',
      headers: { authorization: `Bearer ${SELLER_TOKEN}` },
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    expect(response.body).not.toContain('tenant_branding');
  });
});

describe('PUT /branding', () => {
  const body = {
    displayName: 'Gadotti Viagens',
    welcomeText: 'Bem-vinda',
    primaryColor: '#1f4e8c',
    secondaryColor: '#0b2545',
    loginBackground: '#eef3fa',
  };

  it('requires a session', async () => {
    const fake = createAppFor('MASTER');
    const response = await (await start(fake)).inject({ method: 'PUT', url: '/api/branding', payload: body });
    expect(response.statusCode).toBe(401);
    expect(fake.calls.upserts).toEqual([]);
  });

  it('forbids a user without dashboard.configure and writes nothing', async () => {
    const fake = createAppFor('SELLER');
    const response = await (await start(fake)).inject({
      method: 'PUT',
      url: '/api/branding',
      headers: { authorization: `Bearer ${SELLER_TOKEN}` },
      payload: body,
    });
    expect(response.statusCode).toBe(403);
    expect(fake.calls.upserts).toEqual([]);
    expect(fake.calls.audits).toEqual([]);
  });

  it('lets a MASTER save, scoped to the session tenant even if the body names another', async () => {
    const fake = createAppFor('MASTER');
    const response = await (await start(fake)).inject({
      method: 'PUT',
      url: '/api/branding',
      headers: { authorization: `Bearer ${MASTER_TOKEN}` },
      payload: { ...body, tenantId: OTHER_TENANT_ID, tenant_id: OTHER_TENANT_ID, logoDataUrl: dataUrl('image/png', PNG_BYTES) },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ branding: Record<string, unknown> }>().branding).toMatchObject({
      displayName: 'Gadotti Viagens',
      primaryColor: '#1f4e8c',
      logoDataUrl: dataUrl('image/png', PNG_BYTES),
    });
    expect(fake.calls.upserts).toHaveLength(1);
    const params = fake.calls.upserts[0]!;
    expect(params[0]).toBe(TENANT_ID);
    expect(params).not.toContain(OTHER_TENANT_ID);
    expect(params[8]).toBe(USER_ID);
    expect(params[9]).toBe('set');
  });

  it('records an audit event listing only the changed field names', async () => {
    const fake = createAppFor('MASTER', { brandingRow: { ...GADOTTI_ROW, logo_mime: null, logo_data: null } });
    await (await start(fake)).inject({
      method: 'PUT',
      url: '/api/branding',
      headers: { authorization: `Bearer ${MASTER_TOKEN}` },
      payload: { ...body, welcomeText: 'Bem-vinda de volta', primaryColor: '#123456' },
    });

    expect(fake.calls.audits).toHaveLength(1);
    const [, , eventType, , , metadata] = fake.calls.audits[0] as [string, string, string, string, string, string];
    expect(eventType).toBe('BRANDING_UPDATED');
    expect(JSON.parse(metadata)).toEqual({ fields: 'primaryColor' });
  });

  it('keeps the stored logo when the body does not mention it, and removes it on null', async () => {
    const fake = createAppFor('MASTER', { brandingRow: GADOTTI_ROW });
    const server = await start(fake);
    const headers = { authorization: `Bearer ${MASTER_TOKEN}` };

    const kept = await server.inject({ method: 'PUT', url: '/api/branding', headers, payload: body });
    expect(kept.json<{ branding: { logoDataUrl: string | null } }>().branding.logoDataUrl).toBe(
      dataUrl('image/png', PNG_BYTES),
    );
    expect(fake.calls.upserts[0]![9]).toBe('keep');

    const removed = await server.inject({ method: 'PUT', url: '/api/branding', headers, payload: { ...body, logoDataUrl: null } });
    expect(removed.json<{ branding: { logoDataUrl: string | null } }>().branding.logoDataUrl).toBeNull();
    expect(fake.calls.upserts[1]![9]).toBe('remove');
  });

  it('rejects invalid payloads with 400 before touching the database', async () => {
    const fake = createAppFor('MASTER');
    const server = await start(fake);
    const headers = { authorization: `Bearer ${MASTER_TOKEN}` };
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

    for (const payload of [
      { ...body, primaryColor: 'red' },
      { ...body, primaryColor: '#f5f5f5' },
      { ...body, displayName: 'x'.repeat(81) },
      { ...body, logoDataUrl: dataUrl('image/svg+xml', svg) },
      { ...body, logoDataUrl: dataUrl('image/png', JPEG_BYTES) },
    ]) {
      const response = await server.inject({ method: 'PUT', url: '/api/branding', headers, payload });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    expect(fake.calls.upserts).toEqual([]);
  });
});
