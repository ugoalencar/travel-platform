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
  createOffer,
  getOffer,
  listOffers,
  updateOffer,
  createProposal,
  getProposal,
  listProposals,
  updateProposal,
  createRoute,
  getRoute,
  listRoutes,
  updateRoute,
  createSupplier,
  getSupplier,
  listSuppliers,
  updateSupplier,
  createTransportProduct,
  getTransportProduct,
  listTransportProducts,
  updateTransportProduct,
  createDeparture,
  getDeparture,
  listDepartures,
  updateDeparture,
  getAgenda,
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
    expect(typeof listOffers).toBe('function');
    expect(typeof getOffer).toBe('function');
    expect(typeof createOffer).toBe('function');
    expect(typeof updateOffer).toBe('function');
    expect(typeof listProposals).toBe('function');
    expect(typeof getProposal).toBe('function');
    expect(typeof createProposal).toBe('function');
    expect(typeof updateProposal).toBe('function');
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

  it('calls fetch for GET /api/offers with no tenant/dev-auth leakage in the request shape', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ offers: [] }));

    const result = await listOffers();

    expect(result).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/offers');
    expect(init?.method).toBeUndefined();
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('calls fetch for GET /api/offers/:id with no body/method override, only Content-Type', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const offer = {
      id: 'o1',
      agencyId: 'a1',
      name: 'Pacote Paris',
      price: 1000,
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ offer }));

    const result = await getOffer('o1');

    expect(result).toEqual(offer);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/offers/o1');
    expect(init?.method).toBeUndefined();
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('calls fetch for POST /api/offers with only the submitted fields, no agencyId/id/status/timestamps leakage', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const created = {
      id: 'o1',
      agencyId: 'a1',
      name: 'Pacote Paris',
      price: 1000,
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ offer: created }, 201));

    const result = await createOffer({
      name: 'Pacote Paris',
      price: 1000,
    });

    expect(result).toEqual(created);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/offers');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    const sentBody = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual({
      name: 'Pacote Paris',
      price: 1000,
    });
    const sentKeys = Object.keys(sentBody);
    expect(sentKeys).not.toContain('agencyId');
    expect(sentKeys).not.toContain('tenantId');
    expect(sentKeys).not.toContain('status');
    expect(sentKeys).not.toContain('id');
    expect(sentKeys).not.toContain('createdAt');
    expect(sentKeys).not.toContain('updatedAt');
  });

  it('calls fetch for PATCH /api/offers/:id with only the submitted fields, never agencyId/id/timestamps (status IS allowed)', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const updated = {
      id: 'o1',
      agencyId: 'a1',
      name: 'Pacote Paris',
      price: 1200,
      status: 'INACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ offer: updated }));

    const result = await updateOffer('o1', { price: 1200, status: 'INACTIVE' });

    expect(result).toEqual(updated);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/offers/o1');
    expect(init?.method).toBe('PATCH');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    const sentBody = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual({ price: 1200, status: 'INACTIVE' });
    const sentKeys = Object.keys(sentBody);
    expect(sentKeys).not.toContain('agencyId');
    expect(sentKeys).not.toContain('tenantId');
    expect(sentKeys).not.toContain('role');
    expect(sentKeys).not.toContain('id');
    expect(sentKeys).not.toContain('createdAt');
    expect(sentKeys).not.toContain('updatedAt');
  });

  it('calls fetch for GET /api/proposals with no body/method override', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ proposals: [] }));

    const result = await listProposals();

    expect(result).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/proposals');
    expect(init?.method).toBeUndefined();
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('calls fetch for GET /api/proposals/:id with no body/method override', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const proposal = {
      id: 'p1',
      agencyId: 'a1',
      customerId: 'c1',
      proposedPrice: 100,
      discount: 10,
      total: 90,
      status: 'DRAFT',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ proposal }));

    const result = await getProposal('p1');

    expect(result).toEqual(proposal);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/proposals/p1');
    expect(init?.method).toBeUndefined();
    expect(init?.body).toBeUndefined();
  });

  it('calls fetch for POST /api/proposals with only submitted fields, no total/status/agencyId/id/timestamps leakage', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const created = {
      id: 'p1',
      agencyId: 'a1',
      customerId: 'c1',
      proposedPrice: 100,
      discount: 10,
      total: 90,
      status: 'DRAFT',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ proposal: created }, 201));

    const result = await createProposal({
      customerId: 'c1',
      proposedPrice: 100,
      discount: 10,
    });

    expect(result).toEqual(created);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/proposals');
    expect(init?.method).toBe('POST');
    const sentBody = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual({ customerId: 'c1', proposedPrice: 100, discount: 10 });
    const sentKeys = Object.keys(sentBody);
    expect(sentKeys).not.toContain('total');
    expect(sentKeys).not.toContain('status');
    expect(sentKeys).not.toContain('agencyId');
    expect(sentKeys).not.toContain('tenantId');
    expect(sentKeys).not.toContain('id');
    expect(sentKeys).not.toContain('createdAt');
    expect(sentKeys).not.toContain('updatedAt');
  });

  it('calls fetch for PATCH /api/proposals/:id with only submitted fields, never total/status/customerId/offerId/wishId/agencyId/id/timestamps', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const updated = {
      id: 'p1',
      agencyId: 'a1',
      customerId: 'c1',
      proposedPrice: 200,
      discount: 20,
      total: 180,
      status: 'DRAFT',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ proposal: updated }));

    const result = await updateProposal('p1', { proposedPrice: 200, discount: 20 });

    expect(result).toEqual(updated);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/proposals/p1');
    expect(init?.method).toBe('PATCH');
    const sentBody = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual({ proposedPrice: 200, discount: 20 });
    const sentKeys = Object.keys(sentBody);
    expect(sentKeys).not.toContain('total');
    expect(sentKeys).not.toContain('status');
    expect(sentKeys).not.toContain('customerId');
    expect(sentKeys).not.toContain('offerId');
    expect(sentKeys).not.toContain('wishId');
    expect(sentKeys).not.toContain('agencyId');
    expect(sentKeys).not.toContain('tenantId');
    expect(sentKeys).not.toContain('id');
    expect(sentKeys).not.toContain('createdAt');
    expect(sentKeys).not.toContain('updatedAt');
  });
});

describe('transport api client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('exposes exactly the expected transport functions', () => {
    expect(typeof listRoutes).toBe('function');
    expect(typeof getRoute).toBe('function');
    expect(typeof createRoute).toBe('function');
    expect(typeof updateRoute).toBe('function');
    expect(typeof listSuppliers).toBe('function');
    expect(typeof getSupplier).toBe('function');
    expect(typeof createSupplier).toBe('function');
    expect(typeof updateSupplier).toBe('function');
    expect(typeof listTransportProducts).toBe('function');
    expect(typeof getTransportProduct).toBe('function');
    expect(typeof createTransportProduct).toBe('function');
    expect(typeof updateTransportProduct).toBe('function');
    expect(typeof listDepartures).toBe('function');
    expect(typeof getDeparture).toBe('function');
    expect(typeof createDeparture).toBe('function');
    expect(typeof updateDeparture).toBe('function');
    expect(typeof getAgenda).toBe('function');
  });

  it('GET /api/transport/routes with no body/method override', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ routes: [] }));

    const result = await listRoutes();

    expect(result).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/transport/routes');
    expect(init?.method).toBeUndefined();
    expect(init?.body).toBeUndefined();
  });

  it('GET /api/transport/routes/:id', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const route = {
      id: 'r1',
      agencyId: 'a1',
      origin: 'Sao Paulo',
      destination: 'Rio de Janeiro',
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ route }));

    const result = await getRoute('r1');

    expect(result).toEqual(route);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('/api/transport/routes/r1');
  });

  it('POST /api/transport/routes sends only submitted fields, never agencyId/id/active/timestamps', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const created = {
      id: 'r1',
      agencyId: 'a1',
      origin: 'Sao Paulo',
      destination: 'Rio de Janeiro',
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ route: created }, 201));

    const result = await createRoute({ origin: 'Sao Paulo', destination: 'Rio de Janeiro' });

    expect(result).toEqual(created);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/transport/routes');
    expect(init?.method).toBe('POST');
    const sentBody = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual({ origin: 'Sao Paulo', destination: 'Rio de Janeiro' });
    const sentKeys = Object.keys(sentBody);
    expect(sentKeys).not.toContain('agencyId');
    expect(sentKeys).not.toContain('id');
    expect(sentKeys).not.toContain('active');
    expect(sentKeys).not.toContain('createdAt');
    expect(sentKeys).not.toContain('updatedAt');
  });

  it('PATCH /api/transport/routes/:id sends only submitted fields, never agencyId/id/timestamps', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const updated = {
      id: 'r1',
      agencyId: 'a1',
      origin: 'Sao Paulo',
      destination: 'Rio de Janeiro',
      active: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ route: updated }));

    const result = await updateRoute('r1', { active: false });

    expect(result).toEqual(updated);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/transport/routes/r1');
    expect(init?.method).toBe('PATCH');
    const sentBody = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual({ active: false });
    const sentKeys = Object.keys(sentBody);
    expect(sentKeys).not.toContain('agencyId');
    expect(sentKeys).not.toContain('id');
    expect(sentKeys).not.toContain('createdAt');
    expect(sentKeys).not.toContain('updatedAt');
  });

  it('GET /api/transport/suppliers with no body/method override', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ suppliers: [] }));

    const result = await listSuppliers();

    expect(result).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/transport/suppliers');
    expect(init?.method).toBeUndefined();
  });

  it('GET /api/transport/suppliers/:id', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const supplier = {
      id: 's1',
      agencyId: 'a1',
      name: 'Fast Bus Ltda',
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ supplier }));

    const result = await getSupplier('s1');

    expect(result).toEqual(supplier);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('/api/transport/suppliers/s1');
  });

  it('POST /api/transport/suppliers sends only submitted fields, never agencyId/id/active/timestamps', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const created = {
      id: 's1',
      agencyId: 'a1',
      name: 'Fast Bus Ltda',
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ supplier: created }, 201));

    const result = await createSupplier({ name: 'Fast Bus Ltda' });

    expect(result).toEqual(created);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/transport/suppliers');
    expect(init?.method).toBe('POST');
    const sentBody = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual({ name: 'Fast Bus Ltda' });
    const sentKeys = Object.keys(sentBody);
    expect(sentKeys).not.toContain('agencyId');
    expect(sentKeys).not.toContain('id');
    expect(sentKeys).not.toContain('active');
    expect(sentKeys).not.toContain('createdAt');
    expect(sentKeys).not.toContain('updatedAt');
  });

  it('PATCH /api/transport/suppliers/:id sends only submitted fields', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const updated = {
      id: 's1',
      agencyId: 'a1',
      name: 'Fast Bus Ltda',
      active: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ supplier: updated }));

    const result = await updateSupplier('s1', { active: false });

    expect(result).toEqual(updated);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/transport/suppliers/s1');
    expect(init?.method).toBe('PATCH');
    const sentBody = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual({ active: false });
    const sentKeys = Object.keys(sentBody);
    expect(sentKeys).not.toContain('agencyId');
    expect(sentKeys).not.toContain('id');
    expect(sentKeys).not.toContain('createdAt');
    expect(sentKeys).not.toContain('updatedAt');
  });

  it('GET /api/transport/products with no body/method override', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ products: [] }));

    const result = await listTransportProducts();

    expect(result).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/transport/products');
    expect(init?.method).toBeUndefined();
  });

  it('GET /api/transport/products/:id', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const product = {
      id: 'p1',
      agencyId: 'a1',
      name: 'SP-RJ Executivo',
      tripType: 'ONE_WAY',
      outboundRouteId: 'r1',
      price: 150,
      active: true,
      publiclyBookable: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ product }));

    const result = await getTransportProduct('p1');

    expect(result).toEqual(product);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('/api/transport/products/p1');
  });

  it('POST /api/transport/products sends only submitted fields, never agencyId/id/active/timestamps', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const created = {
      id: 'p1',
      agencyId: 'a1',
      name: 'SP-RJ Executivo',
      tripType: 'ONE_WAY',
      outboundRouteId: 'r1',
      price: 150,
      active: true,
      publiclyBookable: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ product: created }, 201));

    const result = await createTransportProduct({
      name: 'SP-RJ Executivo',
      tripType: 'ONE_WAY',
      outboundRouteId: 'r1',
      price: 150,
    });

    expect(result).toEqual(created);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/transport/products');
    expect(init?.method).toBe('POST');
    const sentBody = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual({
      name: 'SP-RJ Executivo',
      tripType: 'ONE_WAY',
      outboundRouteId: 'r1',
      price: 150,
    });
    const sentKeys = Object.keys(sentBody);
    expect(sentKeys).not.toContain('agencyId');
    expect(sentKeys).not.toContain('id');
    expect(sentKeys).not.toContain('active');
    expect(sentKeys).not.toContain('createdAt');
    expect(sentKeys).not.toContain('updatedAt');
  });

  it('PATCH /api/transport/products/:id sends only submitted fields, never tripType/outboundRouteId/returnRouteId/agencyId/id/timestamps', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const updated = {
      id: 'p1',
      agencyId: 'a1',
      name: 'SP-RJ Executivo',
      tripType: 'ONE_WAY',
      outboundRouteId: 'r1',
      price: 200,
      active: true,
      publiclyBookable: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ product: updated }));

    const result = await updateTransportProduct('p1', { price: 200 });

    expect(result).toEqual(updated);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/transport/products/p1');
    expect(init?.method).toBe('PATCH');
    const sentBody = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual({ price: 200 });
    const sentKeys = Object.keys(sentBody);
    expect(sentKeys).not.toContain('tripType');
    expect(sentKeys).not.toContain('outboundRouteId');
    expect(sentKeys).not.toContain('returnRouteId');
    expect(sentKeys).not.toContain('agencyId');
    expect(sentKeys).not.toContain('id');
    expect(sentKeys).not.toContain('createdAt');
    expect(sentKeys).not.toContain('updatedAt');
  });

  it('GET /api/transport/departures with no body/method override', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ departures: [] }));

    const result = await listDepartures();

    expect(result).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/transport/departures');
    expect(init?.method).toBeUndefined();
  });

  it('GET /api/transport/departures/:id', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const departure = {
      id: 'd1',
      agencyId: 'a1',
      productId: 'p1',
      departureAt: '2026-09-01T10:00:00.000Z',
      capacity: 40,
      serviceType: 'OWN',
      cancelled: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ departure }));

    const result = await getDeparture('d1');

    expect(result).toEqual(departure);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('/api/transport/departures/d1');
  });

  it('POST /api/transport/departures sends only submitted fields, never agencyId/id/cancelled/timestamps', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const created = {
      id: 'd1',
      agencyId: 'a1',
      productId: 'p1',
      departureAt: '2026-09-01T10:00:00.000Z',
      capacity: 40,
      serviceType: 'OWN',
      cancelled: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ departure: created }, 201));

    const result = await createDeparture({
      productId: 'p1',
      departureAt: '2026-09-01T10:00:00.000Z',
      capacity: 40,
      serviceType: 'OWN',
    });

    expect(result).toEqual(created);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/transport/departures');
    expect(init?.method).toBe('POST');
    const sentBody = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual({
      productId: 'p1',
      departureAt: '2026-09-01T10:00:00.000Z',
      capacity: 40,
      serviceType: 'OWN',
    });
    const sentKeys = Object.keys(sentBody);
    expect(sentKeys).not.toContain('agencyId');
    expect(sentKeys).not.toContain('id');
    expect(sentKeys).not.toContain('cancelled');
    expect(sentKeys).not.toContain('createdAt');
    expect(sentKeys).not.toContain('updatedAt');
  });

  it('PATCH /api/transport/departures/:id sends only submitted fields, never productId/agencyId/id/timestamps', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const updated = {
      id: 'd1',
      agencyId: 'a1',
      productId: 'p1',
      departureAt: '2026-09-01T10:00:00.000Z',
      capacity: 30,
      serviceType: 'OWN',
      cancelled: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(jsonResponse({ departure: updated }));

    const result = await updateDeparture('d1', { capacity: 30 });

    expect(result).toEqual(updated);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/transport/departures/d1');
    expect(init?.method).toBe('PATCH');
    const sentBody = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual({ capacity: 30 });
    const sentKeys = Object.keys(sentBody);
    expect(sentKeys).not.toContain('productId');
    expect(sentKeys).not.toContain('agencyId');
    expect(sentKeys).not.toContain('id');
    expect(sentKeys).not.toContain('createdAt');
    expect(sentKeys).not.toContain('updatedAt');
  });

  it('GET /api/transport/agenda with no body/method override', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const agenda = [
      {
        departure: {
          id: 'd1',
          agencyId: 'a1',
          productId: 'p1',
          departureAt: '2026-09-01T10:00:00.000Z',
          capacity: 40,
          serviceType: 'OWN',
          cancelled: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        productName: 'SP-RJ Executivo',
        outboundOrigin: 'Sao Paulo',
        outboundDestination: 'Rio de Janeiro',
        availableSeats: 40,
      },
    ];
    fetchMock.mockResolvedValue(jsonResponse({ agenda }));

    const result = await getAgenda();

    expect(result).toEqual(agenda);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/transport/agenda');
    expect(init?.method).toBeUndefined();
  });
});
