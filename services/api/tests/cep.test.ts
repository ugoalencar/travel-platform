import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CepError,
  CepLookup,
  normalizeCep,
  resolveCepProviderEnabled,
} from '../src/cep';

const payload = {
  cep: '01001-000',
  logradouro: 'Praça da Sé',
  bairro: 'Sé',
  localidade: 'São Paulo',
  uf: 'SP',
};

const response = (data: unknown) =>
  new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json' },
  });

afterEach(() => vi.useRealTimers());

describe('Full CEP provider', () => {
  it('accepts only eight digits or the standard mask, preserving leading zeros', () => {
    expect(normalizeCep('01001-000')).toBe('01001000');
    expect(normalizeCep(' 01001000 ')).toBe('01001000');
    for (const value of ['01001A000', 'https://example.test', '1234567', '123456789']) {
      expect(() => normalizeCep(value)).toThrow();
    }
  });

  it('enables ViaCEP only explicitly in production and fails closed on unknown values', () => {
    expect(resolveCepProviderEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(resolveCepProviderEnabled({ NODE_ENV: 'production', TRAVEL_API_CEP_PROVIDER: 'viacep' })).toBe(true);
    expect(resolveCepProviderEnabled({ NODE_ENV: 'production', TRAVEL_API_CEP_PROVIDER: 'disabled' })).toBe(false);
    expect(resolveCepProviderEnabled({ NODE_ENV: 'production', TRAVEL_API_CEP_PROVIDER: 'other' })).toBe(false);
    expect(resolveCepProviderEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(resolveCepProviderEnabled({ NODE_ENV: 'test' })).toBe(true);
    expect(resolveCepProviderEnabled({ NODE_ENV: 'test', TRAVEL_API_CEP_PROVIDER: 'disabled' })).toBe(false);
    expect(resolveCepProviderEnabled({ NODE_ENV: 'test', TRAVEL_API_CEP_PROVIDER: 'other' })).toBe(false);
  });

  it('uses a fixed URL, shares cached lookups, and sends no customer data', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(payload));
    const lookup = new CepLookup({ fetcher, enabled: true });
    const first = await lookup.lookup('01001-000', 'agency:user');
    expect(first).toMatchObject({
      street: 'Praça da Sé',
      neighborhood: 'Sé',
      city: 'São Paulo',
      state: 'SP',
      source: 'viacep',
      status: 'ok',
    });
    await lookup.lookup('01001000', 'other:user');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://viacep.com.br/ws/01001000/json/');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' });
    expect(fetcher.mock.calls[0]?.[1]?.body).toBeUndefined();
  });

  it('distinguishes missing and partial addresses', async () => {
    const missing = new CepLookup({
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(response({ erro: true })),
      enabled: true,
    });
    await expect(missing.lookup('99999999', 'a:u')).rejects.toMatchObject({
      statusCode: 404,
      code: 'CEP_NOT_FOUND',
    });
    const generic = new CepLookup({
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        response({ ...payload, logradouro: '', bairro: '' }),
      ),
      enabled: true,
    });
    await expect(generic.lookup('01001000', 'a:u')).resolves.toMatchObject({
      status: 'generic',
      street: '',
      neighborhood: '',
      city: 'São Paulo',
    });
  });

  it('can be disabled without making any outbound request', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const lookup = new CepLookup({ fetcher, enabled: false });
    await expect(lookup.lookup('01001000', 'a:u')).rejects.toMatchObject({
      statusCode: 503,
      code: 'CEP_DISABLED',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('coalesces concurrent calls for the same public address', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(payload));
    const lookup = new CepLookup({ fetcher, enabled: true });
    await Promise.all([
      lookup.lookup('01001000', 'a:u'),
      lookup.lookup('01001000', 'b:u'),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('caps outbound usage even with different principals', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(response({ erro: true })));
    const lookup = new CepLookup({ fetcher, enabled: true });
    for (let i = 0; i < 60; i++) {
      await expect(lookup.lookup('99999999', `a:${i}`)).rejects.toMatchObject({
        statusCode: 404,
      });
    }
    await expect(lookup.lookup('99999999', 'b:u')).rejects.toMatchObject({
      statusCode: 429,
      code: 'CEP_RATE_LIMIT',
    });
    expect(fetcher).toHaveBeenCalledTimes(60);
  });

  it.each([
    { ...payload, uf: 'XX' },
    { ...payload, cep: '01002-000' },
    { ...payload, localidade: 123 },
  ])('rejects malformed or mismatched responses', async (data) => {
    const lookup = new CepLookup({
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(response(data)),
      enabled: true,
    });
    await expect(lookup.lookup('01001000', 'a:u')).rejects.toMatchObject({
      statusCode: 502,
      code: 'CEP_INVALID_RESPONSE',
    });
  });

  it('rejects malformed JSON as an invalid response, not an outage', async () => {
    const lookup = new CepLookup({
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response('not-json', {
          headers: { 'content-type': 'application/json' },
        }),
      ),
      enabled: true,
    });
    await expect(lookup.lookup('01001000', 'a:u')).rejects.toMatchObject({
      statusCode: 502,
      code: 'CEP_INVALID_RESPONSE',
    });
  });

  it('bounds remote response size and sanitizes failures', async () => {
    const lookup = new CepLookup({
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        response({ ...payload, extra: 'x'.repeat(17000) }),
      ),
      enabled: true,
    });
    await expect(lookup.lookup('01001000', 'a:u')).rejects.toMatchObject({
      statusCode: 502,
      code: 'CEP_INVALID_RESPONSE',
    });
    const failed = new CepLookup({
      fetcher: vi
        .fn<typeof fetch>()
        .mockRejectedValue(new Error('sensitive upstream content')),
      enabled: true,
    });
    await expect(failed.lookup('01001000', 'a:u')).rejects.toMatchObject({
      statusCode: 502,
      code: 'CEP_UNAVAILABLE',
      message: 'Consulta de CEP indisponível. Tente novamente ou preencha manualmente.',
    });
  });

  it('times out without caching the failure', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new Error('aborted')),
          { once: true },
        );
      }),
    );
    const lookup = new CepLookup({ fetcher, enabled: true });
    const assertion = expect(lookup.lookup('01001000', 'a:u')).rejects.toMatchObject({
      statusCode: 504,
      code: 'CEP_TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(3001);
    await assertion;
    const second = expect(lookup.lookup('01001000', 'a:u')).rejects.toMatchObject({
      statusCode: 504,
    });
    await vi.advanceTimersByTimeAsync(3001);
    await second;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('limits each principal, expires windows/cache, and bounds cache size', async () => {
    let now = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation((url) => {
      const cep = (typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).split('/')[4]!;
      return Promise.resolve(response({ ...payload, cep }));
    });
    const lookup = new CepLookup({ fetcher, enabled: true, now: () => now, cacheLimit: 1 });
    for (let i = 0; i < 10; i++) await lookup.lookup('01001000', 'a:u');
    await expect(lookup.lookup('01001000', 'a:u')).rejects.toMatchObject({
      statusCode: 429,
    });
    await lookup.lookup('01001001', 'b:u');
    now = 60001;
    await lookup.lookup('01001000', 'a:u');
    expect(fetcher).toHaveBeenCalledTimes(3);
    now += 86400001;
    await lookup.lookup('01001000', 'a:u');
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it.each([
    { ...payload, cep: 'abc' },
    { ...payload, cep: '' },
    { ...payload, cep: 1001000 },
    { ...payload, cep: undefined },
  ])('classifies an upstream cep that is not a CEP as an invalid response', async (data) => {
    const lookup = new CepLookup({
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(response(data)),
      enabled: true,
    });
    await expect(lookup.lookup('01001000', 'a:u')).rejects.toMatchObject({
      statusCode: 502,
      code: 'CEP_INVALID_RESPONSE',
    });
  });

  it('caps concurrent distinct lookups at 10 and recovers when they finish', async () => {
    const releases: Array<() => void> = [];
    const fetcher = vi.fn<typeof fetch>().mockImplementation((url) => {
      const cep = (typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).split('/')[4]!;
      return new Promise((resolve) => {
        releases.push(() => resolve(response({ ...payload, cep })));
      });
    });
    const lookup = new CepLookup({ fetcher, enabled: true });
    const inFlight = Array.from({ length: 10 }, (_, i) =>
      lookup.lookup(`0100100${i}`, `a:${i}`),
    );
    await expect(lookup.lookup('01001010', 'b:u')).rejects.toMatchObject({
      statusCode: 429,
      code: 'CEP_RATE_LIMIT',
    });
    // Same CEP as one already pending is coalesced, not throttled.
    const shared = lookup.lookup('01001000', 'c:u');
    expect(fetcher).toHaveBeenCalledTimes(10);
    releases.forEach((release) => release());
    await Promise.all([...inFlight, shared]);
    const next = lookup.lookup('01001010', 'b:u');
    await vi.waitFor(() => expect(releases.length).toBe(11));
    releases[10]!();
    await expect(next).resolves.toMatchObject({ status: 'ok' });
  });

  it('refuses a new principal once 1000 are tracked, but keeps serving known ones', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(response(payload)));
    const lookup = new CepLookup({ fetcher, enabled: true });
    for (let i = 0; i < 1000; i++) await lookup.lookup('01001000', `agency:${i}`);
    await expect(lookup.lookup('01001000', 'agency:new')).rejects.toMatchObject({
      statusCode: 429,
      code: 'CEP_RATE_LIMIT',
    });
    await expect(lookup.lookup('01001000', 'agency:0')).resolves.toMatchObject({ status: 'ok' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('maps provider failures to typed errors without leaking upstream text', async () => {
    const lookup = new CepLookup({
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(response({ erro: true })),
      enabled: true,
    });
    await expect(lookup.lookup('99999999', 'a:u')).rejects.toBeInstanceOf(CepError);
    await expect(lookup.lookup('99999999', 'a:u')).rejects.not.toThrow('viacep.com.br');
  });
});
