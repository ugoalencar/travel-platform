import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  createCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
} from './api';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('api client shape', () => {
  it('exposes exactly the expected functions', () => {
    expect(typeof listCustomers).toBe('function');
    expect(typeof getCustomer).toBe('function');
    expect(typeof createCustomer).toBe('function');
    expect(typeof updateCustomer).toBe('function');
  });
});

describe('api client error mapping', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('resolves listCustomers with the customers array on success', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ customers: [] }),
    );

    const result = await listCustomers();
    expect(result).toEqual([]);
  });

  it('calls fetch for GET /api/customers with no tenant/dev-auth leakage in the request shape', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ customers: [] }));

    await listCustomers();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/customers');
    // No method override means GET; no body; only Content-Type header —
    // the frontend must never itself set agencyId/tenantId/x-dev-* on requests.
    expect(init?.method).toBeUndefined();
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('throws an ApiError carrying the message and code from a non-2xx body', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ error: 'Cliente não encontrado.', code: 'NOT_FOUND' }, 404),
    );

    await expect(listCustomers()).rejects.toMatchObject({
      message: 'Cliente não encontrado.',
      code: 'NOT_FOUND',
      status: 404,
    });
    await expect(listCustomers()).rejects.toBeInstanceOf(ApiError);
  });

  it('falls back to defaults when the error body is missing fields', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({}, 500),
    );

    await expect(listCustomers()).rejects.toMatchObject({
      message: 'Request failed.',
      code: 'UNKNOWN_ERROR',
      status: 500,
    });
  });
});
