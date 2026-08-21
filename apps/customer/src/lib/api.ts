import type {
  Customer,
  CreateCustomerInput,
  UpdateCustomerInput,
} from '../types/customer';
import type { Wish, CreateWishInput, UpdateWishInput } from '../types/wish';
import type { Trip, CreateTripInput, UpdateTripInput } from '../types/trip';

// Single seam for a future production API base URL. In local dev this stays
// empty so requests go to relative paths (e.g. `/api/customers`) and are
// handled by the Vite dev-server proxy configured in vite.config.ts, which
// forwards to the real Fastify API and injects the dev-auth headers. The
// frontend never sets agencyId/tenant/role itself — it only calls the API
// and renders what comes back.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

interface ApiErrorBody {
  error: string;
  code: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await safeJson(response)) as Partial<ApiErrorBody> | null;
    throw new ApiError(
      body?.error ?? 'Request failed.',
      body?.code ?? 'UNKNOWN_ERROR',
      response.status,
    );
  }

  return (await response.json()) as T;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function listCustomers(): Promise<Customer[]> {
  const data = await request<{ customers: Customer[] }>('/api/customers');
  return data.customers;
}

export async function getCustomer(id: string): Promise<Customer> {
  const data = await request<{ customer: Customer }>(
    `/api/customers/${encodeURIComponent(id)}`,
  );
  return data.customer;
}

export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  const data = await request<{ customer: Customer }>('/api/customers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.customer;
}

export async function updateCustomer(
  id: string,
  input: UpdateCustomerInput,
): Promise<Customer> {
  const data = await request<{ customer: Customer }>(
    `/api/customers/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
  return data.customer;
}

export async function listWishes(): Promise<Wish[]> {
  const data = await request<{ wishes: Wish[] }>('/api/wishes');
  return data.wishes;
}

export async function getWish(id: string): Promise<Wish> {
  const data = await request<{ wish: Wish }>(
    `/api/wishes/${encodeURIComponent(id)}`,
  );
  return data.wish;
}

export async function createWish(input: CreateWishInput): Promise<Wish> {
  const data = await request<{ wish: Wish }>('/api/wishes', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.wish;
}

export async function updateWish(
  id: string,
  input: UpdateWishInput,
): Promise<Wish> {
  const data = await request<{ wish: Wish }>(
    `/api/wishes/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
  return data.wish;
}

export async function listTrips(): Promise<Trip[]> {
  const data = await request<{ trips: Trip[] }>('/api/trips');
  return data.trips;
}

export async function getTrip(id: string): Promise<Trip> {
  const data = await request<{ trip: Trip }>(
    `/api/trips/${encodeURIComponent(id)}`,
  );
  return data.trip;
}

export async function createTrip(input: CreateTripInput): Promise<Trip> {
  const data = await request<{ trip: Trip }>('/api/trips', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.trip;
}

export async function updateTrip(
  id: string,
  input: UpdateTripInput,
): Promise<Trip> {
  const data = await request<{ trip: Trip }>(
    `/api/trips/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
  return data.trip;
}
