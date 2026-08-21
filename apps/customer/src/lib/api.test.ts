import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  createCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
  createWish,
  getWish,
  listWishes,
  updateWish,
  createTrip,
  getTrip,
  listTrips,
  updateTrip,
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
    expect(typeof listWishes).toBe('function');
    expect(typeof getWish).toBe('function');
    expect(typeof createWish).toBe('function');
    expect(typeof updateWish).toBe('function');
    expect(typeof listTrips).toBe('function');
    expect(typeof getTrip).toBe('function');
    expect(typeof createTrip).toBe('function');
    expect(typeof updateTrip).toBe('function');
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

  it('calls fetch for POST /api/customers with only the submitted fields, no tenant/dev-auth leakage', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const created = {
      id: 'c1',
      agencyId: 'a1',
      name: 'Maria Silva',
      email: 'maria@example.com',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ customer: created }, 201));

    const result = await createCustomer({ name: 'Maria Silva', email: 'maria@example.com' });

    expect(result).toEqual(created);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/customers');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    const sentBody = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual({
      name: 'Maria Silva',
      email: 'maria@example.com',
    });
    const sentKeys = Object.keys(sentBody);
    expect(sentKeys).not.toContain('agencyId');
    expect(sentKeys).not.toContain('tenantId');
    expect(sentKeys).not.toContain('role');
  });

  it('calls fetch for GET /api/customers/:id with no body/method override, only Content-Type', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const customer = {
      id: 'c1',
      agencyId: 'a1',
      name: 'Maria Silva',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ customer }));

    const result = await getCustomer('c1');

    expect(result).toEqual(customer);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/customers/c1');
    expect(init?.method).toBeUndefined();
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('calls fetch for PATCH /api/customers/:id with only the submitted fields, no tenant/dev-auth leakage', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const updated = {
      id: 'c1',
      agencyId: 'a1',
      name: 'Maria Souza',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ customer: updated }));

    const result = await updateCustomer('c1', { name: 'Maria Souza' });

    expect(result).toEqual(updated);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/customers/c1');
    expect(init?.method).toBe('PATCH');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    const sentBody = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual({ name: 'Maria Souza' });
    const sentKeys = Object.keys(sentBody);
    expect(sentKeys).not.toContain('agencyId');
    expect(sentKeys).not.toContain('tenantId');
    expect(sentKeys).not.toContain('role');
    expect(sentKeys).not.toContain('id');
    expect(sentKeys).not.toContain('createdAt');
  });

  it('calls fetch for GET /api/wishes with no tenant/dev-auth leakage in the request shape', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ wishes: [] }));

    const result = await listWishes();

    expect(result).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/wishes');
    expect(init?.method).toBeUndefined();
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('calls fetch for GET /api/wishes/:id with no body/method override, only Content-Type', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const wish = {
      id: 'w1',
      agencyId: 'a1',
      customerId: 'c1',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ wish }));

    const result = await getWish('w1');

    expect(result).toEqual(wish);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/wishes/w1');
    expect(init?.method).toBeUndefined();
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('calls fetch for POST /api/wishes with only the submitted fields, no tenant/dev-auth leakage', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const created = {
      id: 'w1',
      agencyId: 'a1',
      customerId: 'c1',
      destination: 'Paris',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ wish: created }, 201));

    const result = await createWish({ customerId: 'c1', destination: 'Paris' });

    expect(result).toEqual(created);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/wishes');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    const sentBody = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual({ customerId: 'c1', destination: 'Paris' });
    const sentKeys = Object.keys(sentBody);
    expect(sentKeys).not.toContain('agencyId');
    expect(sentKeys).not.toContain('tenantId');
    expect(sentKeys).not.toContain('role');
    expect(sentKeys).not.toContain('status');
  });

  it('calls fetch for PATCH /api/wishes/:id with only the submitted fields, never customerId', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const updated = {
      id: 'w1',
      agencyId: 'a1',
      customerId: 'c1',
      destination: 'Lisboa',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ wish: updated }));

    const result = await updateWish('w1', { destination: 'Lisboa' });

    expect(result).toEqual(updated);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/wishes/w1');
    expect(init?.method).toBe('PATCH');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    const sentBody = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual({ destination: 'Lisboa' });
    const sentKeys = Object.keys(sentBody);
    expect(sentKeys).not.toContain('customerId');
    expect(sentKeys).not.toContain('agencyId');
    expect(sentKeys).not.toContain('tenantId');
    expect(sentKeys).not.toContain('role');
    expect(sentKeys).not.toContain('status');
    expect(sentKeys).not.toContain('id');
    expect(sentKeys).not.toContain('createdAt');
  });

  it('calls fetch for GET /api/trips with no tenant/dev-auth leakage in the request shape', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ trips: [] }));

    const result = await listTrips();

    expect(result).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/trips');
    expect(init?.method).toBeUndefined();
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('calls fetch for GET /api/trips/:id with no body/method override, only Content-Type', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const trip = {
      id: 't1',
      agencyId: 'a1',
      customerId: 'c1',
      name: 'Lua de mel',
      destination: 'Paris',
      startDate: '2026-06-01',
      endDate: '2026-06-10',
      status: 'PLANNED',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ trip }));

    const result = await getTrip('t1');

    expect(result).toEqual(trip);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/trips/t1');
    expect(init?.method).toBeUndefined();
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('calls fetch for POST /api/trips with only the submitted fields, no tenant/dev-auth/saleId leakage', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const created = {
      id: 't1',
      agencyId: 'a1',
      customerId: 'c1',
      name: 'Lua de mel',
      destination: 'Paris',
      startDate: '2026-06-01',
      endDate: '2026-06-10',
      status: 'PLANNED',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ trip: created }, 201));

    const result = await createTrip({
      customerId: 'c1',
      name: 'Lua de mel',
      destination: 'Paris',
      startDate: '2026-06-01',
      endDate: '2026-06-10',
    });

    expect(result).toEqual(created);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/trips');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    const sentBody = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual({
      customerId: 'c1',
      name: 'Lua de mel',
      destination: 'Paris',
      startDate: '2026-06-01',
      endDate: '2026-06-10',
    });
    const sentKeys = Object.keys(sentBody);
    expect(sentKeys).not.toContain('agencyId');
    expect(sentKeys).not.toContain('tenantId');
    expect(sentKeys).not.toContain('status');
    expect(sentKeys).not.toContain('saleId');
  });

  it('calls fetch for PATCH /api/trips/:id with only the submitted fields, never customerId/status/saleId', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const updated = {
      id: 't1',
      agencyId: 'a1',
      customerId: 'c1',
      name: 'Aventura Lisboa',
      destination: 'Paris',
      startDate: '2026-06-01',
      endDate: '2026-06-10',
      status: 'PLANNED',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ trip: updated }));

    const result = await updateTrip('t1', { name: 'Aventura Lisboa' });

    expect(result).toEqual(updated);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/trips/t1');
    expect(init?.method).toBe('PATCH');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    const sentBody = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual({ name: 'Aventura Lisboa' });
    const sentKeys = Object.keys(sentBody);
    expect(sentKeys).not.toContain('customerId');
    expect(sentKeys).not.toContain('agencyId');
    expect(sentKeys).not.toContain('tenantId');
    expect(sentKeys).not.toContain('role');
    expect(sentKeys).not.toContain('status');
    expect(sentKeys).not.toContain('saleId');
    expect(sentKeys).not.toContain('id');
    expect(sentKeys).not.toContain('createdAt');
  });
});
