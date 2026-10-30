import { afterEach, describe, expect, it, vi } from 'vitest';
import { CepLookup, normalizeCep, normalizeCustomerCep } from '../src/cep';

const payload = { cep: '01001-000', logradouro: 'Praca Exemplo', bairro: 'Centro', localidade: 'Sao Paulo', uf: 'SP' };
const response = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
afterEach(() => vi.useRealTimers());

describe('ViaCEP lookup', () => {
  it('accepts only eight digits or the standard mask, preserving leading zeros', () => {
    expect(normalizeCep('01001-000')).toBe('01001000');
    for (const value of ['01001A000', 'https://example.test', '1234567', '123456789']) {
      expect(() => normalizeCep(value)).toThrow();
    }
    expect(normalizeCustomerCep('01001000')).toBe('01001-000');
    expect(normalizeCustomerCep('')).toBeNull();
    expect(normalizeCustomerCep('legado', 'legado')).toBe('legado');
    expect(() => normalizeCustomerCep('novo invalido', 'legado')).toThrow();
  });

  it('uses a fixed URL, shares cached lookups, and sends no customer data', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(payload));
    const lookup = new CepLookup({ fetcher });
    const first = await lookup.lookup('01001-000', 'agency:user');
    expect(first).toMatchObject({ street: 'Praca Exemplo', city: 'Sao Paulo', state: 'SP', source: 'viacep', status: 'ok' });
    await lookup.lookup('01001000', 'other:user');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://viacep.com.br/ws/01001000/json/');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' });
    expect(fetcher.mock.calls[0]?.[1]?.body).toBeUndefined();
  });

  it('distinguishes missing and partial addresses', async () => {
    const missing = new CepLookup({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(response({ erro: true })) });
    await expect(missing.lookup('99999999', 'a:u')).rejects.toMatchObject({ statusCode: 404 });
    const generic = new CepLookup({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(response({ ...payload, logradouro: '', bairro: '' })) });
    await expect(generic.lookup('01001000', 'a:u')).resolves.toMatchObject({ status: 'generic', street: '', city: 'Sao Paulo' });
  });

  it('can be disabled without making any outbound request', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const lookup = new CepLookup({ fetcher, enabled: false });
    await expect(lookup.lookup('01001000', 'a:u')).rejects.toMatchObject({ statusCode: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('coalesces concurrent calls for the same public address', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(payload));
    const lookup = new CepLookup({ fetcher });
    await Promise.all([lookup.lookup('01001000', 'a:u'), lookup.lookup('01001000', 'b:u')]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('caps outbound usage even with different principals', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(response({ erro: true })));
    const lookup = new CepLookup({ fetcher });
    for (let i = 0; i < 60; i++) await expect(lookup.lookup('99999999', `a:${i}`)).rejects.toMatchObject({ statusCode: 404 });
    await expect(lookup.lookup('99999999', 'b:u')).rejects.toMatchObject({ statusCode: 429 });
    expect(fetcher).toHaveBeenCalledTimes(60);
  });

  it.each([{ ...payload, uf: 'XX' }, { ...payload, cep: '01002-000' }, { ...payload, localidade: 123 }])('rejects malformed or mismatched responses', async (data) => {
    const lookup = new CepLookup({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(response(data)) });
    await expect(lookup.lookup('01001000', 'a:u')).rejects.toMatchObject({ statusCode: 502 });
  });

  it('bounds remote response size and sanitizes failures', async () => {
    const lookup = new CepLookup({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(response({ ...payload, extra: 'x'.repeat(17000) })) });
    await expect(lookup.lookup('01001000', 'a:u')).rejects.toMatchObject({ statusCode: 502 });
    const failed = new CepLookup({ fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error('sensitive upstream content')) });
    await expect(failed.lookup('01001000', 'a:u')).rejects.toThrow('Consulta de CEP indisponivel');
  });

  it('times out without caching the failure', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const lookup = new CepLookup({ fetcher });
    const assertion = expect(lookup.lookup('01001000', 'a:u')).rejects.toMatchObject({ statusCode: 504 });
    await vi.advanceTimersByTimeAsync(3001);
    await assertion;
  });

  it('limits each principal, expires windows/cache, and bounds cache size', async () => {
    let now = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation((url) => {
      const cep = (typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).split('/')[4]!;
      return Promise.resolve(response({ ...payload, cep }));
    });
    const lookup = new CepLookup({ fetcher, now: () => now, cacheLimit: 1 });
    for (let i = 0; i < 10; i++) await lookup.lookup('01001000', 'a:u');
    await expect(lookup.lookup('01001000', 'a:u')).rejects.toMatchObject({ statusCode: 429 });
    await lookup.lookup('01001001', 'b:u');
    now = 60001;
    await lookup.lookup('01001000', 'a:u');
    expect(fetcher).toHaveBeenCalledTimes(3);
    now += 86400001;
    await lookup.lookup('01001000', 'a:u');
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});

describe('ViaCEP lookup - upstream cep and ceilings (parity with Full)', () => {
  it.each([{ ...payload, cep: 'abc' }, { ...payload, cep: '' }, { ...payload, cep: 1001000 }, { ...payload, cep: undefined }])(
    'classifies an upstream cep that is not a CEP as an invalid response',
    async (data) => {
      const lookup = new CepLookup({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(response(data)) });
      await expect(lookup.lookup('01001000', 'a:u')).rejects.toMatchObject({ statusCode: 502, code: 'CEP_INVALID_RESPONSE' });
    },
  );

  it('caps concurrent distinct lookups at 10 and coalesces the same CEP', async () => {
    const releases: Array<() => void> = [];
    const fetcher = vi.fn<typeof fetch>().mockImplementation((url) => {
      const cep = (typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).split('/')[4]!;
      return new Promise((resolve) => releases.push(() => resolve(response({ ...payload, cep }))));
    });
    const lookup = new CepLookup({ fetcher });
    const inFlight = Array.from({ length: 10 }, (_, i) => lookup.lookup(`0100100${i}`, `a:${i}`));
    await expect(lookup.lookup('01001010', 'b:u')).rejects.toMatchObject({ statusCode: 429, code: 'CEP_RATE_LIMIT' });
    const shared = lookup.lookup('01001000', 'c:u');
    expect(fetcher).toHaveBeenCalledTimes(10);
    releases.forEach((release) => release());
    await Promise.all([...inFlight, shared]);
  });

  it('refuses a new principal once 1000 are tracked, but keeps serving known ones', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(response(payload)));
    const lookup = new CepLookup({ fetcher });
    for (let i = 0; i < 1000; i++) await lookup.lookup('01001000', `agency:${i}`);
    await expect(lookup.lookup('01001000', 'agency:new')).rejects.toMatchObject({ statusCode: 429, code: 'CEP_RATE_LIMIT' });
    await expect(lookup.lookup('01001000', 'agency:0')).resolves.toMatchObject({ status: 'ok' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('ViaCEP lookup - malformed JSON (parity with Full)', () => {
  it('rejects malformed JSON as an invalid response, not an outage', async () => {
    const lookup = new CepLookup({
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response('not-json', { headers: { 'content-type': 'application/json' } })),
    });
    await expect(lookup.lookup('01001000', 'a:u')).rejects.toMatchObject({ statusCode: 502, code: 'CEP_INVALID_RESPONSE' });
  });
});
