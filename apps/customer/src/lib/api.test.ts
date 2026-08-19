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
